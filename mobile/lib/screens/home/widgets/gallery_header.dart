import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'header_action_pill.dart';
import 'header_round_button.dart';

/// 顶部 header 浮层：渐变背景 + 状态栏图标亮度 + 左右两组按钮。
///
/// 由 `HomeScreen` 通过 `Positioned` 放在最上层，渐变从屏幕最顶端
/// （含状态栏）一直过渡到 header 下沿的完全透明。
class GalleryHeader extends StatelessWidget {
  const GalleryHeader({
    super.key,
    required this.onOpenDrawer,
    required this.onSearch,
    required this.onMenuSelected,
    this.inboxCount = 0,
    this.filterActive = false,
    this.trashCount = 0,
    this.isTrashView = false,
  });

  final VoidCallback onOpenDrawer;
  final VoidCallback onSearch;

  /// 更多菜单的选择回调（菜单项由 HeaderActionPill 根据状态生成）。
  final ValueChanged<String> onMenuSelected;

  final int inboxCount;
  final bool filterActive;
  final int trashCount;
  final bool isTrashView;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final topPadding = MediaQuery.paddingOf(context).top;
    final headerHeight = topPadding + kToolbarHeight + 8;
    const pillRadius = Radius.circular(24);

    // 状态栏图标亮度跟随主题，避免系统分配到与背景同色的图标。
    final overlayStyle = theme.brightness == Brightness.light
        ? SystemUiOverlayStyle.dark
        : SystemUiOverlayStyle.light;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlayStyle,
      child: SizedBox(
        height: headerHeight,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        theme.colorScheme.surface,
                        theme.colorScheme.surface.withValues(alpha: 0),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            SafeArea(
              bottom: false,
              child: SizedBox(
                height: kToolbarHeight + 8,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Row(
                    children: [
                      HeaderRoundButton(
                        icon: Icons.menu,
                        tooltip: '文件夹',
                        onPressed: onOpenDrawer,
                      ),
                      const Spacer(),
                      const SizedBox(width: 10),
                      HeaderActionPill(
                        onSearch: onSearch,
                        onMenuSelected: onMenuSelected,
                        inboxCount: inboxCount,
                        filterActive: filterActive,
                        trashCount: trashCount,
                        isTrashView: isTrashView,
                        radius: pillRadius,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
