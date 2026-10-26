import 'package:flutter/material.dart';

import '../../../theme/app_theme.dart';
import 'header_round_button.dart';

/// 右侧「搜索 + 更多」融合成的单枚胶囊。
///
/// 两枚按钮共享一个胶囊背景与阴影，但按下反馈各自独立
/// （`Material` 必须位于 `ClipRRect` 内部，否则水波纹会被裁掉）。
class HeaderActionPill extends StatelessWidget {
  const HeaderActionPill({
    super.key,
    required this.onSearch,
    required this.onMenuSelected,
    this.inboxCount = 0,
    this.filterActive = false,
    this.trashCount = 0,
    this.isTrashView = false,
    this.radius = const Radius.circular(24),
  });

  final VoidCallback onSearch;
  final ValueChanged<String> onMenuSelected;

  final int inboxCount;
  final bool filterActive;
  final int trashCount;
  final bool isTrashView;
  final Radius radius;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final leftRadius = BorderRadius.horizontal(left: Radius.circular(radius.x));
    final rightRadius = BorderRadius.horizontal(right: Radius.circular(radius.x));

    return DecoratedBox(
      decoration: headerPillDecoration(theme, radius),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ClipRRect(
            borderRadius: leftRadius,
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                onTap: onSearch,
                child: SizedBox(
                  width: 48,
                  height: 48,
                  child: Icon(Icons.search, size: 24, color: theme.colorScheme.onSurface),
                ),
              ),
            ),
          ),
          ClipRRect(
            borderRadius: rightRadius,
            child: Material(
              type: MaterialType.transparency,
              child: PopupMenuButton<String>(
                tooltip: '更多',
                offset: const Offset(0, 46),
                padding: EdgeInsets.zero,
                // 与 header 按钮同色、大圆角、10% 大阴影
                color: elevatedSurfaceColor(theme),
                surfaceTintColor: Colors.transparent,
                elevation: 8,
                shadowColor: Colors.black.withValues(alpha: 0.10),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppRadii.menu),
                ),
                // 去掉展开时的缩放/高度过渡
                popUpAnimationStyle: AnimationStyle.noAnimation,
                onSelected: onMenuSelected,
                itemBuilder: (_) => pageMenuItems(
                  theme: theme,
                  inboxCount: inboxCount,
                  filterActive: filterActive,
                  trashCount: trashCount,
                  isTrashView: isTrashView,
                ),
                child: SizedBox(
                  width: 48,
                  height: 48,
                  child: Icon(Icons.more_horiz, size: 24, color: theme.colorScheme.onSurface),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 「更多」菜单项：图标 + 文字 + 可选徽标，危险项用 error 色。
List<PopupMenuEntry<String>> pageMenuItems({
  required ThemeData theme,
  int inboxCount = 0,
  bool filterActive = false,
  int trashCount = 0,
  bool isTrashView = false,
}) {
  return [
    _menuRow(theme, icon: Icons.refresh_rounded, label: '刷新', value: 'refresh'),
    _menuRow(
      theme,
      icon: Icons.filter_list_rounded,
      label: '筛选',
      value: 'filter',
      active: filterActive,
    ),
    _menuRow(
      theme,
      icon: Icons.inbox_rounded,
      label: '收件箱',
      value: 'inbox',
      badge: inboxCount > 0 ? '$inboxCount' : null,
    ),
    if (isTrashView && trashCount > 0)
      _menuRow(
        theme,
        icon: Icons.delete_forever_rounded,
        label: '清空废纸篓',
        value: 'emptyTrash',
        destructive: true,
      ),
    const PopupMenuDivider(height: 9),
    _menuRow(
      theme,
      icon: Icons.wifi_off_rounded,
      label: '断开连接',
      value: 'disconnect',
      destructive: true,
    ),
  ];
}

PopupMenuItem<String> _menuRow(
  ThemeData theme, {
  required IconData icon,
  required String label,
  required String value,
  String? badge,
  bool active = false,
  bool destructive = false,
}) {
  final tint = destructive
      ? theme.colorScheme.error
      : (active ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant);
  return PopupMenuItem<String>(
    value: value,
    height: 42,
    padding: const EdgeInsets.symmetric(horizontal: 12),
    child: Row(
      children: [
        Icon(icon, size: 18, color: tint),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: destructive ? theme.colorScheme.error : null,
            ),
          ),
        ),
        if (active) ...[
          Icon(Icons.circle, size: 8, color: theme.colorScheme.primary),
          const SizedBox(width: 4),
        ],
        if (badge != null)
          Text(
            badge,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
      ],
    ),
  );
}
