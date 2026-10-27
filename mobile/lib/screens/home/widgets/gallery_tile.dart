import 'package:flutter/material.dart';

import '../../../models/item.dart';
import '../../../services/api_service.dart';
import '../../../services/share_tag_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/share_tag_badge.dart';
import '../../../widgets/item_preview_overlay.dart';

/// 单个素材格子。
///
/// 手势约定（全部在手指抬起时判定，避免滚动时误触）：
///  · 点按          → 打开详情 / 废纸篓里点按 = 恢复
///  · 长按后不动松手 → 进入多选
///  · 长按后上滑松手 → 打开快速操作
class GalleryTile extends StatelessWidget {
  const GalleryTile({
    super.key,
    required this.item,
    required this.useAnimatedGif,
    required this.selected,
    required this.highlighted,
    required this.enableQuickAction,
    required this.onTap,
    required this.onSelect,
    required this.onOpenPreview,
    required this.onLongPressStart,
    required this.onLongPressMoveUpdate,
    required this.onLongPressEnd,
    required this.onLongPressCancel,
    required this.swipedUp,
    required this.onHighlightSync,
  });

  final MobileItem item;
  final bool useAnimatedGif;
  final bool selected;

  /// 长按期间在格子上叠加与多选态一致的半透明高亮。
  final bool highlighted;

  /// 废纸篓/使用历史视图不允许长按快速操作。
  final bool enableQuickAction;

  final VoidCallback onTap;
  final VoidCallback onSelect;
  final VoidCallback onOpenPreview;

  final ValueChanged<Offset> onLongPressStart;
  final ValueChanged<Offset> onLongPressMoveUpdate;
  final VoidCallback onLongPressEnd;
  final VoidCallback onLongPressCancel;

  /// 当前是否已上滑越过阈值（用于高亮反馈）。
  final bool swipedUp;
  final ValueChanged<bool> onHighlightSync;

  /// 判定为上滑所需的最小位移。
  static const double swipeThreshold = 16;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GestureDetector(
      onTap: onTap,
      onLongPressStart: enableQuickAction ? (d) => onLongPressStart(d.localPosition) : null,
      onLongPressMoveUpdate: enableQuickAction
          ? (d) => onLongPressMoveUpdate(d.localPosition)
          : null,
      onLongPressEnd: enableQuickAction ? (_) => onLongPressEnd() : null,
      onLongPressCancel: enableQuickAction ? onLongPressCancel : null,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.card),
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border.all(color: theme.dividerColor),
            borderRadius: BorderRadius.circular(AppRadii.card),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              _TileImage(item: item, useAnimatedGif: useAnimatedGif, theme: theme),
              if (item.isVideo) _Badge(theme: theme, icon: Icons.play_arrow, top: 4, right: 4),
              if (item.isAudio) _Badge(theme: theme, icon: Icons.audiotrack, top: 4, right: 4),
              if (item.isGif) const _GifBadge(),
              if (ShareTagService.instance.isMarked(item.id))
                const Positioned(left: 4, bottom: 4, child: ShareTagBadge()),
              if (selected)
                Container(
                  color: Colors.black38,
                  alignment: Alignment.topRight,
                  padding: const EdgeInsets.all(4),
                  child: const Icon(Icons.check_circle, color: Colors.white, size: 20),
                ),
              if (highlighted)
                IgnorePointer(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 120),
                    curve: Curves.easeOut,
                    color: Colors.black38,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TileImage extends StatelessWidget {
  const _TileImage({
    required this.item,
    required this.useAnimatedGif,
    required this.theme,
  });

  final MobileItem item;
  final bool useAnimatedGif;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Hero(
      tag: itemPreviewHeroTag(item.id),
      child: Image.network(
        useAnimatedGif
            ? ApiService.instance.getOriginalUrl(item.id)
            : ApiService.instance.getThumbnailUrl(item.id),
        fit: BoxFit.cover,
        headers: ApiService.instance.authHeaders,
        cacheWidth: useAnimatedGif ? 400 : null,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return Container(
            color: theme.colorScheme.surfaceContainerHighest,
            child: Center(
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  value: progress.expectedTotalBytes != null
                      ? progress.cumulativeBytesLoaded / progress.expectedTotalBytes!
                      : null,
                ),
              ),
            ),
          );
        },
        errorBuilder: (context, error, stackTrace) => Container(
          color: theme.colorScheme.surfaceContainerHighest,
          child: Icon(
            Icons.broken_image_outlined,
            color: theme.colorScheme.outline,
            size: 28,
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({
    required this.theme,
    required this.icon,
    required this.top,
    required this.right,
  });

  final ThemeData theme;
  final IconData icon;
  final double top;
  final double right;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: top,
      right: right,
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: Colors.black54,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Icon(icon, color: Colors.white, size: 14),
      ),
    );
  }
}

class _GifBadge extends StatelessWidget {
  const _GifBadge();

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 4,
      left: 4,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
        decoration: BoxDecoration(
          color: Colors.black54,
          borderRadius: BorderRadius.circular(4),
        ),
        child: const Text(
          'GIF',
          style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}
