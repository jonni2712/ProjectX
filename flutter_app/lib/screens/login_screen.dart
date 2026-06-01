import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../providers/auth_provider.dart';
import '../config/api_config.dart';
import '../models/server_profile.dart';
import '../services/server_store.dart';
import 'server_list_screen.dart';
import 'qr_scan_screen.dart';
import 'onboarding_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _serverController = TextEditingController(text: ApiConfig.baseUrl);
  bool _showPassword = false;
  String? _currentServerName;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _initServers());
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _serverController.dispose();
    super.dispose();
  }

  Future<void> _initServers() async {
    final servers = await ServerStore.loadServers();
    // First launch with no servers: show the onboarding intro once.
    if (servers.isEmpty && !await OnboardingScreen.hasSeen() && mounted) {
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const OnboardingScreen()),
      );
    }
    final current = await ServerStore.currentServer();
    if (!mounted) return;
    setState(() {
      if (current != null) {
        _serverController.text = current.url;
        _currentServerName = current.name;
      }
    });
  }

  Future<void> _openServerList() async {
    final selected = await Navigator.of(context).push<ServerProfile>(
      MaterialPageRoute(builder: (_) => const ServerListScreen()),
    );
    if (selected == null || !mounted) return;
    setState(() {
      _serverController.text = selected.url;
      _currentServerName = selected.name;
    });
  }

  Future<void> _scanQrInline() async {
    final raw = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const QrScanScreen()),
    );
    if (raw == null || !mounted) return;
    final parsed = ServerStore.parseQr(raw);
    if (parsed == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('That QR code is not a valid ProjectX server'), backgroundColor: Colors.red),
      );
      return;
    }
    final added = await ServerStore.addServer(name: parsed.name, url: parsed.url);
    await ServerStore.setCurrentId(added.id);
    ApiConfig.setBaseUrl(added.url);
    if (!mounted) return;
    setState(() {
      _serverController.text = added.url;
      _currentServerName = added.name;
    });
  }

  Future<void> _login() async {
    final url = _serverController.text.trim();
    ApiConfig.setBaseUrl(url);
    // Remember this server so it shows up in the server list next time.
    if (url.isNotEmpty) {
      final saved = await ServerStore.addServer(
        name: _currentServerName ?? ServerStore.hostOf(url),
        url: url,
      );
      await ServerStore.setCurrentId(saved.id);
    }
    final success = await ref.read(authStateProvider.notifier).login(
      _usernameController.text.trim(),
      _passwordController.text,
    );
    if (!success && mounted) {
      final error = ref.read(authStateProvider).error ?? 'Login failed';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error), backgroundColor: Colors.red),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.terminal, size: 64, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 16),
                Text('ProjectX', style: GoogleFonts.jetBrainsMono(fontSize: 28, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text('Remote Development', style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 48),
                TextField(
                  controller: _serverController,
                  keyboardType: TextInputType.url,
                  decoration: InputDecoration(
                    labelText: 'Server URL',
                    prefixIcon: const Icon(Icons.dns_outlined),
                    hintText: 'http://192.168.1.100:3000',
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.qr_code_scanner),
                      tooltip: 'Scan QR',
                      onPressed: _scanQrInline,
                    ),
                  ),
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: _openServerList,
                    icon: const Icon(Icons.dns_outlined, size: 18),
                    label: Text(
                      _currentServerName == null ? 'Manage servers' : 'Servers · ${_currentServerName!}',
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _usernameController,
                  decoration: const InputDecoration(
                    labelText: 'Username',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _passwordController,
                  obscureText: !_showPassword,
                  decoration: InputDecoration(
                    labelText: 'Password',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility),
                      onPressed: () => setState(() => _showPassword = !_showPassword),
                    ),
                  ),
                  onSubmitted: (_) => _login(),
                ),
                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: FilledButton(
                    onPressed: authState.isLoading ? null : _login,
                    child: authState.isLoading
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Connect'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
