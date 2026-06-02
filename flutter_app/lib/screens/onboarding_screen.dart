import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_fonts/google_fonts.dart';

import '../config/theme.dart';

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
      backgroundColor: AppColors.canvas,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 48),
              Center(
                child: Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: const Icon(Icons.terminal, size: 36, color: AppColors.accent),
                ),
              ),
              const SizedBox(height: 24),
              Center(
                child: Text(
                  'ProjectX',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: AppColors.text,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  'Your desktop, in your pocket',
                  style: GoogleFonts.inter(fontSize: 14, color: AppColors.textMuted),
                ),
              ),
              const SizedBox(height: 40),
              Expanded(
                child: ListView.separated(
                  itemCount: features.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (_, i) => features[i],
                ),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () => _finish(context),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.accent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: const Text('Get started'),
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
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22, color: AppColors.accent),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.inter(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.text,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: GoogleFonts.inter(fontSize: 13, color: AppColors.textMuted, height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
