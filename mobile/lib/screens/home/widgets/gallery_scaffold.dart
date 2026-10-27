import 'package:flutter/material.dart';

import '../../../controllers/home_controller.dart';
import '../../../controllers/pinch_zoom_controller.dart';
import '../../../controllers/tile_gesture_controller.dart';
import '../../../models/item.dart';
import '../../../utils/item_grouping.dart';
import 'gallery_body.dart';

/// 主内容 Scaffold：透明 AppBar + 缩放/抽屉手势 + 网格 + 多选栏 + 上传按钮。
///
/// 从 `HomeScreen` 抽出，让页面文件只保留状态与交互回调。
class GalleryScaffold extends StatelessWidget {
  const GalleryScaffold({
    super.key,
    required this.data,
    required this.zoom,
    required this.tileGesture,
    required this.scrollController,
    required this.selectedIds,
    required this.drawerInteractable,
    required this.isUploading,
    required this.onDrawerHorizontalUpdate,
    required this.onDrawerHorizontalEnd,
    required this.onRetry,
    required this.onTileTap,
    required this.onTileSelect,
    required this.onTilePreview,
    required this.onLongPressStart,
    required this.onLongPressMove,
    required this.onLongPressEnd,
    required this.onLongPressCancel,
    required this.onClearSelection,
    required this.onAddTag,
    required this.onAddToFolder,
    required this.onUpload,
  });

  final HomeController data;
  final PinchZoomController zoom;
  final TileGestureController tileGesture;
  final ScrollController scrollController;
  final Set<String> selectedIds;
  final bool drawerInteractable;
  final bool isUploading;

  final GestureDragUpdateCallback onDrawerHorizontalUpdate;
  final GestureDragEndCallback onDrawerHorizontalEnd;

  final VoidCallback onRetry;
  final ValueChanged<MobileItem> onTileTap;
  final ValueChanged<MobileItem> onTileSelect;
  final ValueChanged<MobileItem> onTilePreview;
  final void Function(MobileItem item, Offset local) onLongPressStart;
  final void Function(MobileItem item, Offset local) onLongPressMove;
  final ValueChanged<MobileItem> onLongPressEnd;
  final ValueChanged<MobileItem> onLongPressCancel;

  final VoidCallback onClearSelection;
  final VoidCallback onAddTag;
  final VoidCallback onAddToFolder;
  final VoidCallback onUpload;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: _transparentAppBar(),
      body: Listener(
        onPointerDown: zoom.handlePointerDown,
        onPointerMove: zoom.handlePointerMove,
        onPointerUp: zoom.handlePointerUp,
        onPointerCancel: zoom.handlePointerUp,
        child: GestureDetector(
          onHorizontalDragUpdate: drawerInteractable ? onDrawerHorizontalUpdate : null,
          onHorizontalDragEnd: drawerInteractable ? onDrawerHorizontalEnd : null,
          child: GalleryBody(
            items: data.items,
            grouped: groupItemsByMonth(data.items),
            controller: scrollController,
            physics: zoom.isPinching
                ? const NeverScrollableScrollPhysics()
                : const AlwaysScrollableScrollPhysics(),
            topInset: MediaQuery.paddingOf(context).top + kToolbarHeight + 8,
            isLoading: data.isLoading,
            emptyMessage: data.emptyMessage,
            errorMessage: data.errorMessage,
            crossAxisCount: zoom.crossAxisCount,
            selectedIds: selectedIds,
            pressedItemId: tileGesture.pressedItemId,
            quickActionSwipedUp: tileGesture.swipedUp,
            enableQuickAction:
                !data.isTrashView && !data.isHistoryView && selectedIds.isEmpty,
            scrollLocked: zoom.isPinching,
            onRetry: onRetry,
            onTileTap: onTileTap,
            onTileSelect: onTileSelect,
            onTilePreview: onTilePreview,
            onLongPressStart: onLongPressStart,
            onLongPressMove: onLongPressMove,
            onLongPressEnd: onLongPressEnd,
            onLongPressCancel: onLongPressCancel,
          ),
        ),
      ),
      bottomNavigationBar: selectedIds.isEmpty
          ? null
          : SelectionBar(
              count: selectedIds.length,
              onCancel: onClearSelection,
              onAddTag: onAddTag,
              onAddToFolder: onAddToFolder,
            ),
      floatingActionButton: FloatingActionButton(
        heroTag: 'upload_fab',
        tooltip: '上传素材到电脑',
        onPressed: isUploading ? null : onUpload,
        child: const Icon(Icons.add_photo_alternate_rounded),
      ),
    );
  }

  /// 完全透明的 AppBar：只为撑出安全区高度，视觉全由 header 浮层负责。
  AppBar _transparentAppBar() {
    return AppBar(
      backgroundColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: true,
      automaticallyImplyLeading: false,
      toolbarHeight: kToolbarHeight + 8,
      flexibleSpace: const SizedBox.shrink(),
      title: const SizedBox.shrink(),
    );
  }
}
