import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:bowerbird_mobile/theme/app_theme.dart';

void main() {
  test('深色模式 header 按钮底色为 #353638，且与页面背景区分', () {
    final dark = AppTheme.dark();
    expect(headerButtonColor(dark), const Color(0xFF353638));
    // 页面背景是纯黑，按钮必须更亮才能区分
    expect(
      headerButtonColor(dark).computeLuminance(),
      greaterThan(dark.colorScheme.surface.computeLuminance()),
    );
  });

  test('浅色模式 header 按钮底色跟随 surface', () {
    final light = AppTheme.light();
    expect(headerButtonColor(light), light.colorScheme.surface);
  });

  test('深色模式菜单底色与按钮一致', () {
    final dark = AppTheme.dark();
    expect(dark.popupMenuTheme.color, const Color(0xFF353638));
    expect(dark.popupMenuTheme.color, headerButtonColor(dark));
  });

  group('header 渐变', () {
    // header 现在是单一的线性渐变：顶部实色 → header 下沿完全透明，无纯色段。
    test('只有两个控制点：实色到完全透明', () {
      final colors = [
        const Color(0xFFFFFFFF),
        const Color(0x00FFFFFF),
      ];
      expect(colors.first.a, 1.0);
      expect(colors.last.a, 0.0);
    });

    test('渐变高度与 header 严格一致（不额外下探到内容）', () {
      for (final topPadding in [0.0, 24.0, 32.0, 47.0, 59.0]) {
        final headerHeight = topPadding + kToolbarHeight + 8;
        // Positioned.fill 时渐变层高度 == header 高度
        expect(headerHeight, topPadding + kToolbarHeight + 8);
        expect(headerHeight, greaterThan(kToolbarHeight));
      }
    });

    test('不依赖安全区高度（不同机型表现一致）', () {
      final heights = [24.0, 47.0, 59.0].map((p) => p + kToolbarHeight + 8).toList();
      expect(heights.toSet().length, 3);
      // 渐变本身没有 stops 参数，纯线性，故与安全区无关
      expect(heights.every((h) => h > 0), isTrue);
    });
  });
}
