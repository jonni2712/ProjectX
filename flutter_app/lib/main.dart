import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'config/api_config.dart';
import 'config/theme.dart';
import 'providers/auth_provider.dart';
import 'providers/connection_provider.dart';
import 'providers/file_provider.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF1A1A2E),
    systemNavigationBarIconBrightness: Brightness.light,
  ));

  runApp(const ProviderScope(child: ProjectXApp()));
}

class ProjectXApp extends ConsumerStatefulWidget {
  const ProjectXApp({super.key});

  @override
  ConsumerState<ProjectXApp> createState() => _ProjectXAppState();
}

class _ProjectXAppState extends ConsumerState<ProjectXApp> with WidgetsBindingObserver {
  bool _biometricPending = true;
  bool _biometricPassed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initApp();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Reconnect WebSocket when app comes back to foreground
      final authState = ref.read(authStateProvider);
      if (authState.isAuthenticated) {
        final connection = ref.read(connectionStateProvider);
        if (!connection.isConnected && !connection.isConnecting) {
          ref.read(connectionStateProvider.notifier).connect();
        }
        // Reload current directory
        final fileState = ref.read(fileProvider);
        ref.read(fileProvider.notifier).loadDirectory(fileState.currentPath);
      }
    }
  }

  Future<void> _initApp() async {
    await ApiConfig.init();
    await ref.read(authStateProvider.notifier).init();

    final storage = const FlutterSecureStorage();
    final biometricEnabled = await storage.read(key: 'biometric_enabled') == 'true';
    final hasToken = await storage.read(key: 'jwt_token') != null;

    if (biometricEnabled && hasToken) {
      try {
        final localAuth = LocalAuthentication();
        final canAuth = await localAuth.canCheckBiometrics || await localAuth.isDeviceSupported();
        if (canAuth) {
          final authenticated = await localAuth.authenticate(
            localizedReason: 'Unlock ProjectX',
            options: const AuthenticationOptions(
              stickyAuth: true,
              biometricOnly: false,
            ),
          );
          if (mounted) {
            setState(() {
              _biometricPending = false;
              _biometricPassed = authenticated;
            });
          }
          return;
        }
      } catch (_) {
        // Biometric failed (not enrolled, HW error, etc.) — skip lock
      }
    }

    if (mounted) {
      setState(() {
        _biometricPending = false;
        _biometricPassed = true;
      });
    }
  }

  Future<void> _retryBiometric() async {
    try {
      final localAuth = LocalAuthentication();
      final authenticated = await localAuth.authenticate(
        localizedReason: 'Unlock ProjectX',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false,
        ),
      );
      if (mounted) {
        setState(() => _biometricPassed = authenticated);
      }
    } catch (_) {
      // Let user retry
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);

    Widget home;
    if (_biometricPending) {
      home = const Scaffold(body: Center(child: CircularProgressIndicator()));
    } else if (!_biometricPassed) {
      home = _BiometricLockedScreen(onRetry: _retryBiometric);
    } else if (authState.isAuthenticated) {
      home = const HomeScreen();
    } else {
      home = const LoginScreen();
    }

    return MaterialApp(
      title: 'ProjectX',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: home,
    );
  }
}

class _BiometricLockedScreen extends StatelessWidget {
  final VoidCallback onRetry;
  const _BiometricLockedScreen({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lock, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            const Text('ProjectX is locked', style: TextStyle(fontSize: 18)),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.fingerprint),
              label: const Text('Unlock'),
            ),
          ],
        ),
      ),
    );
  }
}
