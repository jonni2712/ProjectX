import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:local_auth/local_auth.dart';
import '../providers/auth_provider.dart';
import '../providers/connection_provider.dart';
import '../config/api_config.dart';
import 'admin_screen.dart';

final biometricEnabledProvider = StateProvider<bool>((ref) => false);

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _storage = const FlutterSecureStorage();
  final _localAuth = LocalAuthentication();
  bool _biometricAvailable = false;
  bool _biometricEnabled = false;

  // Password change
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  bool _changingPassword = false;
  String? _passwordError;
  String? _passwordSuccess;

  @override
  void initState() {
    super.initState();
    _loadBiometricState();
  }

  @override
  void dispose() {
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    super.dispose();
  }

  Future<void> _loadBiometricState() async {
    final canAuth = await _localAuth.canCheckBiometrics || await _localAuth.isDeviceSupported();
    final enabled = await _storage.read(key: 'biometric_enabled') == 'true';
    setState(() {
      _biometricAvailable = canAuth;
      _biometricEnabled = enabled;
    });
    ref.read(biometricEnabledProvider.notifier).state = enabled;
  }

  Future<void> _toggleBiometric(bool value) async {
    if (value) {
      final authenticated = await _localAuth.authenticate(
        localizedReason: 'Authenticate to enable biometric login',
        options: const AuthenticationOptions(stickyAuth: true),
      );
      if (!authenticated) return;
    }
    await _storage.write(key: 'biometric_enabled', value: value.toString());
    setState(() => _biometricEnabled = value);
    ref.read(biometricEnabledProvider.notifier).state = value;
  }

  Future<void> _changePassword() async {
    final current = _currentPasswordController.text.trim();
    final newPass = _newPasswordController.text.trim();
    if (current.isEmpty || newPass.isEmpty) {
      setState(() {
        _passwordError = 'Both fields are required';
        _passwordSuccess = null;
      });
      return;
    }
    if (newPass.length < 6) {
      setState(() {
        _passwordError = 'New password must be at least 6 characters';
        _passwordSuccess = null;
      });
      return;
    }

    setState(() {
      _changingPassword = true;
      _passwordError = null;
      _passwordSuccess = null;
    });

    final authService = ref.read(authServiceProvider);
    final error = await authService.changePassword(current, newPass);

    setState(() {
      _changingPassword = false;
      if (error == null) {
        _passwordSuccess = 'Password changed successfully';
        _passwordError = null;
        _currentPasswordController.clear();
        _newPasswordController.clear();
      } else {
        _passwordError = error;
        _passwordSuccess = null;
      }
    });
  }

  Future<void> _logout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to disconnect?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Logout'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await ref.read(connectionStateProvider.notifier).disconnect();
      await ref.read(authStateProvider.notifier).logout();
    }
  }

  @override
  Widget build(BuildContext context) {
    final connectionState = ref.watch(connectionStateProvider);
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // User avatar and info
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundColor: Theme.of(context).colorScheme.primary,
                  child: const Icon(Icons.person, size: 40, color: Colors.white),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      authState.username ?? 'User',
                      style: GoogleFonts.jetBrainsMono(fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                    if (authState.role != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: authState.role == 'admin'
                              ? const Color(0xFF6C9EFF).withOpacity(0.2)
                              : const Color(0xFF4ECDC4).withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: authState.role == 'admin'
                                ? const Color(0xFF6C9EFF)
                                : const Color(0xFF4ECDC4),
                          ),
                        ),
                        child: Text(
                          authState.role == 'admin' ? 'Admin' : 'User',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: authState.role == 'admin'
                                ? const Color(0xFF6C9EFF)
                                : const Color(0xFF4ECDC4),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  ApiConfig.baseUrl,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),

          // Connection status
          Card(
            child: ListTile(
              leading: Icon(
                connectionState.isConnected ? Icons.cloud_done : Icons.cloud_off,
                color: connectionState.isConnected ? Colors.green : Colors.red,
              ),
              title: const Text('Server Connection'),
              subtitle: Text(connectionState.isConnected ? 'Connected' : 'Disconnected'),
              trailing: connectionState.isConnected
                  ? null
                  : TextButton(
                      onPressed: () => ref.read(connectionStateProvider.notifier).connect(),
                      child: const Text('Reconnect'),
                    ),
            ),
          ),
          const SizedBox(height: 8),

          // Security section
          Padding(
            padding: const EdgeInsets.only(left: 4, top: 16, bottom: 8),
            child: Text('SECURITY', style: GoogleFonts.inter(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w600)),
          ),
          Card(
            child: Column(
              children: [
                if (_biometricAvailable)
                  SwitchListTile(
                    secondary: const Icon(Icons.fingerprint),
                    title: const Text('Biometric Unlock'),
                    subtitle: const Text('Use fingerprint or face to unlock'),
                    value: _biometricEnabled,
                    onChanged: _toggleBiometric,
                  ),
                if (!_biometricAvailable)
                  const ListTile(
                    leading: Icon(Icons.fingerprint, color: Colors.grey),
                    title: Text('Biometric Unlock'),
                    subtitle: Text('Not available on this device'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Change Password section
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text('CHANGE PASSWORD', style: GoogleFonts.inter(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w600)),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _currentPasswordController,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'Current Password',
                      prefixIcon: Icon(Icons.lock_outline),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _newPasswordController,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'New Password',
                      prefixIcon: Icon(Icons.lock),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  if (_passwordError != null) ...[
                    const SizedBox(height: 8),
                    Text(_passwordError!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                  ],
                  if (_passwordSuccess != null) ...[
                    const SizedBox(height: 8),
                    Text(_passwordSuccess!, style: const TextStyle(color: Colors.green, fontSize: 13)),
                  ],
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _changingPassword ? null : _changePassword,
                    icon: _changingPassword
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.key),
                    label: Text(_changingPassword ? 'Changing...' : 'Change Password'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Admin Panel button (only for admins)
          if (authState.role == 'admin') ...[
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 8),
              child: Text('ADMINISTRATION', style: GoogleFonts.inter(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w600)),
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.admin_panel_settings, color: Color(0xFF6C9EFF)),
                title: const Text('Admin Panel'),
                subtitle: const Text('Manage users and permissions'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const AdminScreen()),
                  );
                },
              ),
            ),
            const SizedBox(height: 16),
          ],

          const SizedBox(height: 16),

          // Logout button
          SizedBox(
            width: double.infinity,
            height: 48,
            child: OutlinedButton.icon(
              onPressed: _logout,
              icon: const Icon(Icons.logout, color: Colors.red),
              label: const Text('Logout', style: TextStyle(color: Colors.red)),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Colors.red),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
