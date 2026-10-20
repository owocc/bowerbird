import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/item.dart';
import '../services/api_service.dart';

/// Actions the preview overlay can hand back to the grid.
enum ItemPreviewAction { viewDetail, copyContent, download, share, delete }

/// Hero tag shared by the grid tile and the preview overlay.
String itemPreviewHeroTag(String itemId) => 'item-preview-$itemId';

/// Pushes a transparent modal route that grows [item] from its grid tile into
/// a large preview, with the action menu unfolding underneath.
Future<ItemPreviewAction?> showItemPreviewOverlay(
  BuildContext context,
  MobileItem item,
) {
  HapticFeedback.mediumImpact();
  return Navigator.of(context).push<ItemPreviewAction>(
    PageRouteBuilder<ItemPreviewAction>(
      opaque: false,
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 280),
      reverseTransitionDuration: const Duration(milliseconds: 240),
      pageBuilder: (_, _, _) => ItemPreviewOverlay(item: item),
    ),
  );
}

class ItemPreviewOverlay extends StatefulWidget {
  const ItemPreviewOverlay({super.key, required this.item});

  final MobileItem item;

  @override
  State<ItemPreviewOverlay> createState() => _ItemPreviewOverlayState();
}

class _ItemPreviewOverlayState extends State<ItemPreviewOverlay> {
  static const double _dismissDistance = 96;
  static const double _dismissVelocity = 700;

  double _dragOffset = 0;
  bool _dragging = false;
  bool _closing = false;
  bool _deleting = false;

  MobileItem get _item => widget.item;

  void _close([ItemPreviewAction? action]) {
    if (_closing || _deleting) return;
    _closing = true;
    Navigator.of(context).pop(action);
  }

  void _onVerticalDragStart(DragStartDetails details) {
    if (_deleting) return;
    setState(() => _dragging = true);
  }

  void _onVerticalDragUpdate(DragUpdateDetails details) {
    if (_deleting) return;
    final next = _dragOffset + details.delta.dy;
    // Only downward drags move the preview; upward drags keep it pinned.
    setState(() => _dragOffset = math.max(0, next));
  }

  void _onVerticalDragEnd(DragEndDetails details) {
    if (_deleting) return;
    final velocity = details.primaryVelocity ?? 0;
    if (_dragOffset > _dismissDistance || velocity > _dismissVelocity) {
      _close();
      return;
    }
    // Snap back; AnimatedContainer animates the transform because the
    // widget is rebuilt with _dragging == false.
    setState(() {
      _dragging = false;
      _dragOffset = 0;
    });
  }

  Future<void> _confirmDelete() async {
    if (_deleting) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除素材'),
        content: const Text('该素材将移入桌面端废纸篓，可在桌面端废纸篓中找回。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _deleting = true);
    try {
      await ApiService.instance.deleteItem(_item.id);
      if (!mounted) return;
      _closing = true;
      Navigator.of(context).pop(ItemPreviewAction.delete);
    } catch (e) {
      if (!mounted) return;
      setState(() => _deleting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('删除失败: ${e.toString().replaceAll('Exception: ', '')}'),
          backgroundColor: Colors.red.shade700,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final topInset = MediaQuery.paddingOf(context).top;
    final routeAnimation = ModalRoute.of(context)!.animation!;
    final theme = Theme.of(context);

    final maxImageWidth = math.min(size.width - 40, 560.0);
    final maxImageHeight = math.min(
      size.height * 0.56,
      size.height - topInset - 190,
    );
    final aspect = (_item.width > 0 && _item.height > 0)
        ? _item.width / _item.height
        : 1.0;
    double imageWidth = maxImageWidth;
    double imageHeight = imageWidth / aspect;
    if (imageHeight > maxImageHeight) {
      imageHeight = maxImageHeight;
      imageWidth = imageHeight * aspect;
    }

    final menuWidth = math.min(size.width - 40, 420.0);

    return Material(
      type: MaterialType.transparency,
      child: Stack(
        fit: StackFit.expand,
        children: [
          _buildScrim(routeAnimation),
          SafeArea(
            bottom: false,
            child: Align(
              alignment: Alignment.topCenter,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onVerticalDragStart: _onVerticalDragStart,
                      onVerticalDragUpdate: _onVerticalDragUpdate,
                      onVerticalDragEnd: _onVerticalDragEnd,
                      child: AnimatedContainer(
                        duration: _dragging
                            ? Duration.zero
                            : const Duration(milliseconds: 180),
                        curve: Curves.easeOutCubic,
                        transform: Matrix4.translationValues(0, _dragOffset, 0),
                        child: SizedBox(
                          width: imageWidth,
                          height: imageHeight,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              Hero(
                                tag: itemPreviewHeroTag(_item.id),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(14),
                                  child: ColoredBox(
                                    color: Colors.white.withValues(alpha: 0.04),
                                    child: Image.network(
                                      ApiService.instance.getThumbnailUrl(
                                        _item.id,
                                      ),
                                      headers: ApiService.instance.authHeaders,
                                      fit: BoxFit.cover,
                                      gaplessPlayback: true,
                                      loadingBuilder:
                                          (context, child, progress) {
                                            if (progress == null) return child;
                                            return const Center(
                                              child: SizedBox(
                                                width: 24,
                                                height: 24,
                                                child:
                                                    CircularProgressIndicator(
                                                      strokeWidth: 2,
                                                    ),
                                              ),
                                            );
                                          },
                                      errorBuilder:
                                          (context, error, stackTrace) =>
                                              Center(
                                                child: Icon(
                                                  Icons.broken_image_outlined,
                                                  size: 40,
                                                  color:
                                                      theme.colorScheme.outline,
                                                ),
                                              ),
                                    ),
                                  ),
                                ),
                              ),
                              if (_item.isVideo)
                                _PreviewBadge(
                                  icon: Icons.play_arrow_rounded,
                                  label: '视频',
                                )
                              else if (_item.isGif)
                                _PreviewBadge(
                                  icon: Icons.gif_box_outlined,
                                  label: 'GIF',
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    _buildMenu(routeAnimation, menuWidth, theme),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScrim(Animation<double> routeAnimation) {
    return AnimatedBuilder(
      animation: routeAnimation,
      builder: (context, _) {
        final t = Curves.easeOutCubic.transform(routeAnimation.value);
        final dragFade = (1 - _dragOffset / 360).clamp(0.45, 1.0);
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _close,
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 8 * t, sigmaY: 8 * t),
            child: ColoredBox(
              color: Colors.black.withValues(alpha: 0.66 * t * dragFade),
            ),
          ),
        );
      },
    );
  }

  Widget _buildMenu(
    Animation<double> routeAnimation,
    double width,
    ThemeData theme,
  ) {
    final menu = Container(
      width: width,
      padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          _menuButton(
            theme,
            icon: Icons.info_outline_rounded,
            label: '查看详情',
            onTap: () => _close(ItemPreviewAction.viewDetail),
          ),
          _menuButton(
            theme,
            icon: Icons.copy_rounded,
            label: '复制图片',
            onTap: () => _close(ItemPreviewAction.copyContent),
          ),
          _menuButton(
            theme,
            icon: Icons.download_rounded,
            label: '下载',
            onTap: () => _close(ItemPreviewAction.download),
          ),
          _menuButton(
            theme,
            icon: Icons.share_rounded,
            label: '分享',
            onTap: () => _close(ItemPreviewAction.share),
          ),
          _menuButton(
            theme,
            icon: Icons.delete_outline_rounded,
            label: '删除',
            color: theme.colorScheme.error,
            onTap: _confirmDelete,
          ),
        ],
      ),
    );

    return AnimatedBuilder(
      animation: routeAnimation,
      builder: (context, child) {
        final t = const Interval(
          0.25,
          1,
          curve: Curves.easeOutCubic,
        ).transform(routeAnimation.value);
        return Opacity(
          opacity: t,
          child: Transform.translate(
            offset: Offset(0, 24 * (1 - t)),
            child: child,
          ),
        );
      },
      child: menu,
    );
  }

  Widget _menuButton(
    ThemeData theme, {
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    Color? color,
  }) {
    final foreground = color ?? theme.colorScheme.onSurface;
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: _deleting ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: (color ?? theme.colorScheme.onSurface).withValues(
                    alpha: 0.08,
                  ),
                ),
                child: Icon(icon, size: 21, color: foreground),
              ),
              const SizedBox(height: 6),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: foreground,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PreviewBadge extends StatelessWidget {
  const _PreviewBadge({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 10,
      right: 10,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: Colors.white),
            const SizedBox(width: 3),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
