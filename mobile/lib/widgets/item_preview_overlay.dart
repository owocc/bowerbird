import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/item.dart';
import '../services/api_service.dart';
import '../services/share_tag_service.dart';
import '../services/api_items.dart';
import 'preview_action_drawer.dart';
import 'preview_badge.dart';

/// Actions the preview overlay can hand back to the grid.
enum ItemPreviewAction { viewDetail, copyContent, download, share, delete }

/// Hero tag shared by the grid tile and the preview overlay.
String itemPreviewHeroTag(String itemId) => 'item-preview-$itemId';

/// Pushes a transparent modal route that grows [item] from its grid tile into
/// a large preview, with the action drawer rising from the bottom edge.
Future<ItemPreviewAction?> showItemPreviewOverlay(
  BuildContext context,
  MobileItem item, {
  double initialDragOffset = 0,
}) {
  HapticFeedback.mediumImpact();
  return Navigator.of(context).push<ItemPreviewAction>(
    PageRouteBuilder<ItemPreviewAction>(
      opaque: false,
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 220),
      reverseTransitionDuration: const Duration(milliseconds: 240),
      pageBuilder: (_, _, _) => ItemPreviewOverlay(
        item: item,
        initialDragOffset: initialDragOffset,
      ),
    ),
  );
}

class ItemPreviewOverlay extends StatefulWidget {
  const ItemPreviewOverlay({
    super.key,
    required this.item,
    this.initialDragOffset = 0,
  });

  final MobileItem item;
  final double initialDragOffset;

  @override
  State<ItemPreviewOverlay> createState() => _ItemPreviewOverlayState();
}

class _ItemPreviewOverlayState extends State<ItemPreviewOverlay> {
  static const double _dismissDistance = 96;
  static const double _dismissVelocity = 700;
  static const double _drawerRowHeight = 56;
  static const double _drawerHandleArea = 30;
  static const double _drawerListPadding = 8;

  late double _dragOffset;
  bool _dragging = false;
  double _drawerDragOffset = 0;
  bool _closing = false;
  bool _deleting = false;

  MobileItem get _item => widget.item;

  @override
  void initState() {
    super.initState();
    _dragOffset = widget.initialDragOffset;
  }


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

  void _onDrawerDragStart(DragStartDetails details) {
    if (_deleting) return;
    setState(() => _dragging = true);
  }

  void _onDrawerDragUpdate(DragUpdateDetails details) {
    if (_deleting) return;
    final next = _drawerDragOffset + details.delta.dy;
    // Only downward drags move the drawer; upward drags keep it docked.
    setState(() => _drawerDragOffset = math.max(0, next));
  }

  void _onDrawerDragEnd(DragEndDetails details) {
    if (_deleting) return;
    final velocity = details.primaryVelocity ?? 0;
    if (_drawerDragOffset > _dismissDistance || velocity > _dismissVelocity) {
      // Keep the offset: the route's reverse animation continues the slide
      // from where the finger released instead of snapping back first.
      _close();
      return;
    }
    setState(() {
      _dragging = false;
      _drawerDragOffset = 0;
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
      await ShareTagService.instance.forget(_item.id);
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

    final actions = <PreviewAction>[
      PreviewAction(
        icon: Icons.info_outline_rounded,
        label: '查看详情',
        onTap: () => _close(ItemPreviewAction.viewDetail),
      ),
      PreviewAction(
        icon: Icons.copy_rounded,
        label: '复制图片',
        onTap: () => _close(ItemPreviewAction.copyContent),
      ),
      PreviewAction(
        icon: Icons.download_rounded,
        label: '下载',
        onTap: () => _close(ItemPreviewAction.download),
      ),
      PreviewAction(
        icon: Icons.share_rounded,
        label: '分享',
        onTap: () => _close(ItemPreviewAction.share),
      ),
      PreviewAction(
        icon: Icons.delete_outline_rounded,
        label: '删除',
        onTap: _confirmDelete,
        destructive: true,
      ),
    ];

    // Drawer natural height is known up front, so the preview can be sized to
    // stay clear of it instead of guessing a fixed menu reserve.
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    final drawerMaxHeight = size.height * 0.6;
    final drawerContentHeight =
        _drawerHandleArea +
        _drawerListPadding * 2 +
        _drawerRowHeight * actions.length +
        bottomInset;
    final drawerHeight = math.min(drawerContentHeight, drawerMaxHeight);

    final maxImageWidth = math.min(size.width - 40, 560.0);
    final maxImageHeight = math.min(
      size.height * 0.56,
      math.max(160.0, size.height - topInset - drawerHeight - 48),
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
                child: GestureDetector(
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
                              borderRadius: BorderRadius.circular(12),
                              child: ColoredBox(
                                color: Colors.white.withValues(alpha: 0.04),
                                child: Image.network(
                                  ApiService.instance.getThumbnailUrl(_item.id),
                                  headers: ApiService.instance.authHeaders,
                                  fit: BoxFit.cover,
                                  gaplessPlayback: true,
                                  loadingBuilder: (context, child, progress) {
                                    if (progress == null) return child;
                                    return const Center(
                                      child: SizedBox(
                                        width: 24,
                                        height: 24,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      ),
                                    );
                                  },
                                  errorBuilder: (context, error, stackTrace) =>
                                      Center(
                                        child: Icon(
                                          Icons.broken_image_outlined,
                                          size: 40,
                                          color: theme.colorScheme.outline,
                                        ),
                                      ),
                                ),
                              ),
                            ),
                          ),
                          if (_item.isVideo)
                            PreviewBadge(
                              icon: Icons.play_arrow_rounded,
                              label: '视频',
                            )
                          else if (_item.isGif)
                            PreviewBadge(
                              icon: Icons.gif_box_outlined,
                              label: 'GIF',
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: PreviewActionDrawer(
              actions: actions,
              routeAnimation: routeAnimation,
              height: drawerHeight,
              maxHeight: drawerMaxHeight,
              enabled: !_deleting,
              listPadding: _drawerListPadding,
              rowHeight: _drawerRowHeight,
              handleArea: _drawerHandleArea,
              onDragStart: _onDrawerDragStart,
              onDragUpdate: _onDrawerDragUpdate,
              onDragEnd: _onDrawerDragEnd,
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
        final dragFade = (1 - math.max(_dragOffset, _drawerDragOffset) / 360)
            .clamp(0.45, 1.0);
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
}
