import 'package:flutter/material.dart';

import '../../../theme/app_theme.dart';

/// header 按钮/胶囊共用的投影：黑色、透明度 10%、大范围模糊。
List<BoxShadow> headerShadows = [
  BoxShadow(
    color: Colors.black.withValues(alpha: 0.10),
    blurRadius: 24,
    spreadRadius: 2,
    offset: const Offset(0, 6),
  ),
];

/// header 内圆形图标按钮：无边框，圆形底色 + 10% 大阴影。
class HeaderRoundButton extends StatelessWidget {
  const HeaderRoundButton({
    super.key,
    required this.icon,
    required this.onPressed,
    this.tooltip,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final button = DecoratedBox(
      decoration: ShapeDecoration(
        color: elevatedSurfaceColor(theme),
        shape: const CircleBorder(),
        shadows: headerShadows,
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: SizedBox(
            width: 48,
            height: 48,
            child: Icon(icon, size: 24, color: theme.colorScheme.onSurface),
          ),
        ),
      ),
    );
    if (tooltip == null) return button;
    return Tooltip(message: tooltip!, child: button);
  }
}

/// 胶囊（全圆角矩形）背景：填充色 + 共用投影。
ShapeDecoration headerPillDecoration(ThemeData theme, Radius radius) {
  return ShapeDecoration(
    color: elevatedSurfaceColor(theme),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(radius)),
    shadows: headerShadows,
  );
}
