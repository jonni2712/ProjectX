import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_fonts/google_fonts.dart';

/// First-run welcome screen. Shown once, before the login screen, when the app
/// has no saved servers and onboarding hasn't been completed yet.
class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  static const _storage = FlutterSecureStorage();
  static const _seenKey = 'onboarding_seen';

  static Future<bool> hasSeen() async => (await _storage.read(key: _seenKey)) == 'true';
  static Future<void> markSeen() async => _storage.write(key: _seenKey, value: 'true');

  Future<void> _finish(BuildContext context) async {
    await markSeen();
    if (context.mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    const features = [
      _Feature(Icons.folder_outlined, 'Files & editor', 'Browse and edit your code with syntax highlighting.'),
      _Feature(Icons.terminal, 'Terminal', 'A full terminal to your machine, in your pocket.'),
      _Feature(Icons.commit, 'Git', 'Status, commit, push, pull and branches on the go.'),
      _Feature(Icons.auto_awesome, 'Claude AI', 'Ask Claude about your code, right from the app.'),
    ];

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 48),
              Icon(Icons.terminal, size: 64, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 16),
              Center(
                child: Text(
                  'ProjectX',
                  style: GoogleFonts.jetBrainsMono(fontSize: 28, fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  'Your desktop, in your pocket',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              const SizedBox(height: 40),
              Expanded(
                child: ListView.separated(
                  itemCount: features.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 20),
                  itemBuilder: (_, i) => features[i],
                ),
              ),
              FilledButton(
                onPressed: () => _finish(context),
                child: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text('Get started'),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

class _Feature extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _Feature(this.icon, this.title, this.subtitle);

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: Theme.of(context).colorScheme.secondary),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ],
    );
  }
}
