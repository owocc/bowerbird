import 'package:flutter/material.dart';

import '../../../models/item.dart';
import 'gallery_tile.dart';

/// 主列表的滚动区域：空状态 / 加载中 / 分组网格 + 无限滚动。
class GalleryBody extends StatelessWidget {
  const GalleryBody({
    super.key,
    required this.items,
    required this.grouped,
    required this.controller,
    required this.physics,
    required this.topInset,
    required this.isLoading,
    required this.emptyMessage,
    required this.errorMessage,
    required this.crossAxisCount,
    required this.selectedIds,
    required this.pressedItemId,
    required this.quickActionSwipedUp,
    required this.enableQuickAction,
    required this.onRetry,
    required this.onTileTap,
    required this.onTileSelect,
    required this.onTilePreview,
    required this.onLongPressStart,
    required this.onLongPressMove,
    required this.onLongPressEnd,
    required this.onLongPressCancel,
    required this.scrollLocked,
  });

  final List<MobileItem> items;
  final Map<String, List<MobileItem>> grouped;
  final ScrollController controller;
  final ScrollPhysics physics;

  /// 列表顶部留白（安全区 + 工具栏），给 header 浮层让位。
  final double topInset;

  final bool isLoading;
  final String emptyMessage;
  final String? errorMessage;
  final int crossAxisCount;
  final Set<String> selectedIds;
  final String? pressedItemId;
  final bool quickActionSwipedUp;
  final bool enableQuickAction;
  final bool scrollLocked;

  final VoidCallback onRetry;
  final ValueChanged<MobileItem> onTileTap;
  final ValueChanged<MobileItem> onTileSelect;
  final ValueChanged<MobileItem> onTilePreview;

  final void Function(MobileItem item, Offset local) onLongPressStart;
  final void Function(MobileItem item, Offset local) onLongPressMove;
  final ValueChanged<MobileItem> onLongPressEnd;
  final ValueChanged<MobileItem> onLongPressCancel;

  @override
  Widget build(BuildContext context) {
    if (errorMessage != null && items.isEmpty) {
      return _ErrorState(message: errorMessage!, topInset: topInset, onRetry: onRetry);
    }
    if (items.isEmpty && !isLoading) {
      return _EmptyState(message: emptyMessage, topInset: topInset);
    }
    return CustomScrollView(
      controller: controller,
      physics: physics,
      slivers: [
        SliverToBoxAdapter(child: SizedBox(height: topInset)),
        ...grouped.entries.expand(_buildMonthSlivers),
        if (isLoading && items.isNotEmpty) const _LoadingMore(),
        const SliverToBoxAdapter(child: SizedBox(height: 32)),
      ],
    );
  }

  Iterable<Widget> _buildMonthSlivers(MapEntry<String, List<MobileItem>> entry) {
    final monthItems = entry.value;
    return [
      SliverToBoxAdapter(child: _MonthHeader(title: entry.key, count: monthItems.length)),
      SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        sliver: SliverGrid(
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossAxisCount,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
          ),
          delegate: SliverChildBuilderDelegate(
            (context, index) {
              final item = monthItems[index];
              return _buildTile(item);
            },
            childCount: monthItems.length,
          ),
        ),
      ),
    ];
  }

  Widget _buildTile(MobileItem item) {
    final useAnimatedGif = item.isGif && item.size <= 8 * 1024 * 1024;
    return GalleryTile(
      key: ValueKey(item.id),
      item: item,
      useAnimatedGif: useAnimatedGif,
      selected: selectedIds.contains(item.id),
      highlighted: pressedItemId == item.id,
      enableQuickAction: enableQuickAction,
      swipedUp: quickActionSwipedUp,
      onTap: () => onTileTap(item),
      onSelect: () => onTileSelect(item),
      onOpenPreview: () => onTilePreview(item),
      onLongPressStart: (pos) => onLongPressStart(item, pos),
      onLongPressMoveUpdate: (pos) => onLongPressMove(item, pos),
      onLongPressEnd: () => onLongPressEnd(item),
      onLongPressCancel: () => onLongPressCancel(item),
      onHighlightSync: (_) {},
    );
  }
}

class _MonthHeader extends StatelessWidget {
  const _MonthHeader({required this.title, required this.count});

  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: theme.textTheme.titleMedium),
          Text(
            '$count',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.topInset, required this.onRetry});

  final String message;
  final double topInset;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: EdgeInsets.fromLTRB(24, topInset, 24, 24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off, size: 64, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center, style: theme.textTheme.bodyMedium),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.message, required this.topInset});

  final String message;
  final double topInset;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: EdgeInsets.fromLTRB(32, topInset, 32, 32),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium?.copyWith(
            color: theme.colorScheme.outline,
            fontWeight: FontWeight.w400,
          ),
        ),
      ),
    );
  }
}

class _LoadingMore extends StatelessWidget {
  const _LoadingMore();

  @override
  Widget build(BuildContext context) {
    return const SliverToBoxAdapter(
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
    );
  }
}

/// 多选态的底部操作栏。
class SelectionBar extends StatelessWidget {
  const SelectionBar({
    super.key,
    required this.count,
    required this.onCancel,
    required this.onAddTag,
    required this.onAddToFolder,
  });

  final int count;
  final VoidCallback onCancel;
  final VoidCallback onAddTag;
  final VoidCallback onAddToFolder;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Material(
        color: theme.colorScheme.surface,
        elevation: 0,
        child: Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: theme.dividerColor)),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Text('已选 $count'),
              const Spacer(),
              TextButton(onPressed: onCancel, child: const Text('取消')),
              FilledButton.tonal(onPressed: onAddTag, child: const Text('加标签')),
              const SizedBox(width: 8),
              FilledButton(onPressed: onAddToFolder, child: const Text('添加到…')),
            ],
          ),
        ),
      ),
    );
  }
}
