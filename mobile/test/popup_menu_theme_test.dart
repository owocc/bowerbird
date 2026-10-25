import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:bowerbird_mobile/theme/app_theme.dart';

void main() {
  for (final entry in {'light': AppTheme.light(), 'dark': AppTheme.dark()}.entries) {
    test('${entry.key}: 菜单与 header 同色、大圆角、10% 大阴影', () {
      final theme = entry.value;
      final menu = theme.popupMenuTheme;
      // 菜单底色与 header 按钮一致（深色模式为专用 #353638）
      expect(menu.color, elevatedSurfaceColor(theme));
      expect(menu.surfaceTintColor, Colors.transparent);
      expect(menu.elevation, 8);
      expect(menu.menuPadding, const EdgeInsets.symmetric(vertical: 4));
      expect(menu.shadowColor, Colors.black.withValues(alpha: 0.10));
      final shape = menu.shape as RoundedRectangleBorder;
      expect(shape.borderRadius, BorderRadius.circular(AppRadii.menu));
      // 菜单圆角应当比普通卡片更大
      expect(AppRadii.menu, greaterThan(AppRadii.cardLarge));
      expect(shape.side, BorderSide.none);
    });
  }

  testWidgets('菜单项使用大圆角容器与 10% 阴影', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        body: Center(
          child: PopupMenuButton<String>(
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'refresh', child: Text('刷新')),
            ],
            child: const SizedBox(width: 48, height: 48, child: Icon(Icons.more_horiz)),
          ),
        ),
      ),
    ));

    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();

    final material = tester.widget<Material>(
      find.ancestor(of: find.text('刷新'), matching: find.byType(Material)).first,
    );
    expect(material.elevation, 8);
    expect(material.color, elevatedSurfaceColor(AppTheme.light()));
    final shape = material.shape as RoundedRectangleBorder;
    expect(shape.borderRadius, BorderRadius.circular(AppRadii.menu));
  });

  testWidgets('菜单紧贴按钮下方（间距 6dp），且最小宽度 200dp', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        body: Stack(
          children: [
            Positioned(
              top: 100,
              right: 16,
              child: PopupMenuButton<String>(
                position: PopupMenuPosition.over,
                offset: const Offset(0, 54),
                constraints: const BoxConstraints(minWidth: 200),
                itemBuilder: (_) => [
                  for (final label in ['刷新', '筛选', '收件箱'])
                    PopupMenuItem(value: label, child: Text(label)),
                ],
                child: const SizedBox(width: 48, height: 48, child: Icon(Icons.more_horiz)),
              ),
            ),
          ],
        ),
      ),
    ));

    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();

    final buttonRect = tester.getRect(find.byIcon(Icons.more_horiz));
    final menuRect = tester.getRect(find.text('刷新'));
    // 菜单容器顶部 = 按钮下沿 + 6（54 - 48 = 6）
    final menuMaterial = tester.getRect(
      find.ancestor(of: find.text('刷新'), matching: find.byType(Material)).first,
    );
    expect(menuMaterial.top - buttonRect.bottom, closeTo(6, 1.5));
    expect(menuMaterial.width, greaterThanOrEqualTo(200));
    expect(menuRect.width, greaterThan(0));
  });
}
