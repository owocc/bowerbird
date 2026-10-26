import 'package:flutter/material.dart';

/// 快速操作抽屉里的一行。
class PreviewAction {
  const PreviewAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;
}

/// 从屏幕底部上滑唤出的快速操作抽屉。
///
/// 从 `ItemPreviewOverlay` 抽出：它只负责"画一个可拖拽的底部抽屉"，
/// 具体动作由 [actions] 提供。
class PreviewActionDrawer extends StatelessWidget {
  const PreviewActionDrawer({
    super.key,
    required this.actions,
    required this.routeAnimation,
    required this.height,
    required this.maxHeight,
    required this.enabled,
    required this.onDragStart,
    required this.onDragUpdate,
    required this.onDragEnd,
    this.listPadding = 8,
    this.rowHeight = 56,
    this.handleArea = 24,
  });

  final List<PreviewAction> actions;
  final Animation<double> routeAnimation;
  final double height;
  final double maxHeight;

  /// false 时（例如正在删除）禁用行点击。
  final bool enabled;

  final GestureDragStartCallback onDragStart;
  final GestureDragUpdateCallback onDragUpdate;
  final GestureDragEndCallback onDragEnd;

  final double listPadding;
  final double rowHeight;
  final double handleArea;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    final scrollable = height < maxHeight;
    const radius = BorderRadius.vertical(top: Radius.circular(24));

    final drawer = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onVerticalDragStart: onDragStart,
      onVerticalDragUpdate: onDragUpdate,
      onVerticalDragEnd: onDragEnd,
      child: Container(
        width: double.infinity,
        constraints: BoxConstraints(maxHeight: maxHeight),
        decoration: BoxDecoration(
          borderRadius: radius,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.45),
              blurRadius: 28,
              offset: const Offset(0, -6),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: radius,
          child: Material(
            color: theme.colorScheme.surfaceContainerHigh,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _handle(theme),
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    padding: EdgeInsets.only(
                      top: listPadding,
                      bottom: bottomInset + listPadding,
                    ),
                    physics: scrollable
                        ? const ClampingScrollPhysics()
                        : const NeverScrollableScrollPhysics(),
                    itemCount: actions.length,
                    itemBuilder: (context, index) => _row(theme, actions[index]),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    return AnimatedBuilder(
      animation: routeAnimation,
      builder: (context, child) {
        // 预览先出现，抽屉跟随路由动画后 ~88% 的时间滑入。
        final t = const Interval(0.12, 1, curve: Curves.easeOutCubic)
            .transform(routeAnimation.value);
        return Transform.translate(offset: Offset(0, (1 - t) * height), child: child);
      },
      child: drawer,
    );
  }

  Widget _handle(ThemeData theme) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onVerticalDragStart: onDragStart,
      onVerticalDragUpdate: onDragUpdate,
      onVerticalDragEnd: onDragEnd,
      child: SizedBox(
        height: handleArea,
        child: Center(
          child: Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ),
      ),
    );
  }

  Widget _row(ThemeData theme, PreviewAction action) {
    final foreground =
        action.destructive ? theme.colorScheme.error : theme.colorScheme.onSurface;
    return InkWell(
      onTap: enabled ? action.onTap : null,
      child: SizedBox(
        height: rowHeight,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: foreground.withValues(alpha: 0.08),
                ),
                child: Icon(action.icon, size: 21, color: foreground),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  action.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: foreground,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
