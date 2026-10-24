import 'package:flutter/material.dart';

/// ChatGPT 2026 / OpenAI visual tokens for the mobile app.
/// Interaction stays the same; chrome only.
class AppColors {
  static const lightBackground = Color(0xFFFFFFFF);
  static const lightSurface = Color(0xFFF4F4F4);
  static const lightDivider = Color(0xFFEBEBEB);
  static const lightBorder = Color(0xFFE5E5E5);
  static const lightText = Color(0xFF0D0D0D);
  static const lightSecondary = Color(0xFF353535);
  static const lightMuted = Color(0xFF6E6E80);

  static const darkBackground = Color(0xFF000000);
  static const darkSurface = Color(0xFF111111);
  static const darkBorder = Color(0xFF2D2D2D);
  static const darkText = Color(0xFFFFFFFF);
  static const darkSecondary = Color(0xFFD1D1D1);
  static const darkMuted = Color(0xFF8E8EA0);

  static const accent = Color(0xFF10A37F);
  static const accentHover = Color(0xFF0D8A6D);

  static const error = Color(0xFFB42318);
}

class AppRadii {
  static const pill = 9999.0;
  static const card = 12.0;
  static const cardLarge = 16.0;
  static const chipSmall = 4.0;
  static const code = 8.0;
}

class AppTheme {
  static ThemeData light() => _build(
        brightness: Brightness.light,
        background: AppColors.lightBackground,
        surface: AppColors.lightSurface,
        border: AppColors.lightBorder,
        divider: AppColors.lightDivider,
        text: AppColors.lightText,
        secondary: AppColors.lightSecondary,
        muted: AppColors.lightMuted,
      );

  static ThemeData dark() => _build(
        brightness: Brightness.dark,
        background: AppColors.darkBackground,
        surface: AppColors.darkSurface,
        border: AppColors.darkBorder,
        divider: AppColors.darkBorder,
        text: AppColors.darkText,
        secondary: AppColors.darkSecondary,
        muted: AppColors.darkMuted,
      );

  static ThemeData _build({
    required Brightness brightness,
    required Color background,
    required Color surface,
    required Color border,
    required Color divider,
    required Color text,
    required Color secondary,
    required Color muted,
  }) {
    final scheme = ColorScheme(
      brightness: brightness,
      primary: AppColors.accent,
      onPrimary: Colors.white,
      secondary: AppColors.accent,
      onSecondary: Colors.white,
      error: AppColors.error,
      onError: Colors.white,
      surface: background,
      onSurface: text,
      onSurfaceVariant: secondary,
      outline: muted,
      outlineVariant: divider,
      surfaceContainerLowest: background,
      surfaceContainerLow: surface,
      surfaceContainer: surface,
      surfaceContainerHigh: surface,
      surfaceContainerHighest: surface,
      primaryContainer: AppColors.accent.withValues(alpha: 0.12),
      onPrimaryContainer: AppColors.accentHover,
    );

    final textTheme = ThemeData(brightness: brightness).textTheme.copyWith(
          headlineLarge: TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.w500,
            letterSpacing: -0.64,
            height: 1.2,
            color: text,
          ),
          headlineMedium: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w500,
            letterSpacing: -0.24,
            color: text,
          ),
          titleLarge: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w500,
            letterSpacing: -0.2,
            color: text,
          ),
          titleMedium: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w500,
            height: 1.6,
            color: text,
          ),
          bodyLarge: TextStyle(fontSize: 16, height: 1.6, color: text, fontWeight: FontWeight.w400),
          bodyMedium: TextStyle(fontSize: 14, height: 1.5, color: text, fontWeight: FontWeight.w400),
          bodySmall: TextStyle(fontSize: 12, height: 1.4, color: muted, fontWeight: FontWeight.w400),
          labelLarge: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: text),
          labelMedium: TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: muted),
        );

    final pillShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(AppRadii.pill),
    );
    final cardShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(AppRadii.card),
      side: BorderSide(color: border),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      canvasColor: background,
      dividerColor: divider,
      textTheme: textTheme,
      iconTheme: IconThemeData(color: secondary, size: 22),
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: text,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleMedium,
        iconTheme: IconThemeData(color: text),
        surfaceTintColor: Colors.transparent,
      ),
      chipTheme: ChipThemeData(
        shape: pillShape,
        side: BorderSide(color: border),
        selectedColor: AppColors.accent.withValues(alpha: 0.14),
        backgroundColor: surface,
        labelStyle: textTheme.labelLarge!.copyWith(fontSize: 12, fontWeight: FontWeight.w400),
        secondaryLabelStyle: textTheme.labelLarge!.copyWith(fontSize: 12, color: AppColors.accent),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
        showCheckmark: false,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: Colors.white,
          shape: pillShape,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          textStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: Colors.white,
          shape: pillShape,
          elevation: 0,
          shadowColor: Colors.transparent,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.accent,
          shape: pillShape,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: text,
          side: BorderSide(color: border),
          shape: pillShape,
        ),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColors.accent,
        foregroundColor: Colors.white,
        elevation: 0,
        focusElevation: 0,
        hoverElevation: 2,
        highlightElevation: 2,
        shape: CircleBorder(),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.pill),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.pill),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadii.pill),
          borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        hintStyle: TextStyle(color: muted, fontWeight: FontWeight.w400),
        labelStyle: TextStyle(color: secondary),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: cardShape,
        shadowColor: Colors.black.withValues(alpha: 0.08),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: background,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.cardLarge),
        ),
        elevation: 8,
        shadowColor: Colors.black.withValues(alpha: 0.10),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: background,
        modalBackgroundColor: background,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.cardLarge)),
        ),
        elevation: 8,
        showDragHandle: false,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: brightness == Brightness.light ? AppColors.lightText : AppColors.darkSurface,
        contentTextStyle: TextStyle(
          color: brightness == Brightness.light ? Colors.white : AppColors.darkText,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadii.card)),
      ),
      dividerTheme: DividerThemeData(color: divider, space: 1, thickness: 1),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.accent),
      listTileTheme: ListTileThemeData(
        selectedColor: AppColors.accent,
        selectedTileColor: AppColors.accent.withValues(alpha: 0.08),
        iconColor: secondary,
        textColor: text,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadii.code)),
      ),
    );
  }
}
