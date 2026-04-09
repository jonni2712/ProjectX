import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      useMaterial3: true,
      colorScheme: ColorScheme.dark(
        primary: const Color(0xFF6C9EFF),
        secondary: const Color(0xFF4ECDC4),
        surface: const Color(0xFF1A1A2E),
        error: const Color(0xFFFF6B6B),
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: const Color(0xFFE0E0E0),
      ),
      scaffoldBackgroundColor: const Color(0xFF0F0F1A),
      cardTheme: CardThemeData(
        color: const Color(0xFF1A1A2E),
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: const Color(0xFF0F0F1A),
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.jetBrainsMono(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: const Color(0xFFE0E0E0),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Color(0xFF1A1A2E),
        selectedItemColor: Color(0xFF6C9EFF),
        unselectedItemColor: Color(0xFF666680),
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme).copyWith(
        bodyMedium: GoogleFonts.inter(color: const Color(0xFFE0E0E0)),
        bodySmall: GoogleFonts.inter(color: const Color(0xFF999999)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF16162A),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Color(0xFF6C9EFF)),
        ),
      ),
      dividerColor: Colors.white.withValues(alpha: 0.08),
      iconTheme: const IconThemeData(color: Color(0xFF999999)),
    );
  }
}
