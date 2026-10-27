import 'package:flutter/material.dart';

import '../../../controllers/home_controller.dart';
import '../../../widgets/folder_drawer.dart';
import 'drawer_layer.dart';
import 'gallery_header.dart';

/// 主界面的整体骨架：内容 + 抽屉 + 遮罩 + header 浮层。
///
/// 四层叠放关系固定在这里，`HomeScreen` 只需提供数据与回调，
/// 也让"谁在最上面"一目了然（header 永远在最后 = 最上层）。
class HomeShell extends StatelessWidget {
  const HomeShell({
    super.key,
    required this.drawerAnimation,
    required this.drawerWidth,
    required this.content,
    required this.data,
    required this.libraryName,
    required this.inboxCount,
    required this.onOpenDrawer,
    required this.onSearch,
    required this.onMenuSelected,
    required this.onSelectCollection,
    required this.onSelectFolder,
    required this.onSwitchLibrary,
    required this.onCloseDrawer,
    required this.onHorizontalDragUpdate,
    required this.onHorizontalDragEnd,
  });

  final Animation<double> drawerAnimation;
  final double drawerWidth;
  final Widget content;

  final HomeController data;
  final String libraryName;
  final int inboxCount;

  final VoidCallback onOpenDrawer;
  final VoidCallback onSearch;
  final ValueChanged<String> onMenuSelected;
  final ValueChanged<SidebarView> onSelectCollection;
  final ValueChanged<String?> onSelectFolder;
  final VoidCallback onSwitchLibrary;
  final VoidCallback onCloseDrawer;
  final GestureDragUpdateCallback onHorizontalDragUpdate;
  final GestureDragEndCallback onHorizontalDragEnd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface,
      child: Stack(
        children: [
          DrawerShift(
            animation: drawerAnimation,
            width: drawerWidth,
            child: content,
          ),
          DrawerLayer(
            animation: drawerAnimation,
            width: drawerWidth,
            folders: data.folders,
            view: data.view,
            selectedFolderId: data.activeFolderId,
            stats: data.stats,
            historyCount: data.historyIds.length,
            libraryName: libraryName,
            onSelectCollection: onSelectCollection,
            onSelectFolder: onSelectFolder,
            onSwitchLibrary: onSwitchLibrary,
            onSearch: onSearch,
            onClose: onCloseDrawer,
            onHorizontalDragUpdate: onHorizontalDragUpdate,
            onHorizontalDragEnd: onHorizontalDragEnd,
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SlideWithDrawer(
              animation: drawerAnimation,
              width: drawerWidth,
              child: GalleryHeader(
                onOpenDrawer: onOpenDrawer,
                onSearch: onSearch,
                onMenuSelected: onMenuSelected,
                inboxCount: inboxCount,
                filterActive: data.filterActive,
                trashCount: data.stats.trashCount,
                isTrashView: data.isTrashView,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
