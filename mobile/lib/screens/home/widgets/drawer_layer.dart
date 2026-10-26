import 'package:flutter/material.dart';

import '../../../models/item.dart';
import '../../../widgets/folder_drawer.dart';

/// 抽屉（侧边栏）+ 遮罩层的组合。
///
/// 把 `AnimationController` 驱动的平移/遮罩全部收在这里，
/// 让主界面只剩"打开/关闭抽屉"的语义。
class DrawerLayer extends StatelessWidget {
  const DrawerLayer({
    super.key,
    required this.animation,
    required this.width,
    required this.folders,
    required this.view,
    required this.selectedFolderId,
    required this.stats,
    required this.historyCount,
    required this.libraryName,
    required this.onSelectCollection,
    required this.onSelectFolder,
    required this.onSwitchLibrary,
    required this.onSearch,
    required this.onClose,
    required this.onHorizontalDragUpdate,
    required this.onHorizontalDragEnd,
  });

  final Animation<double> animation;
  final double width;

  final List<MobileFolder> folders;
  final SidebarView view;
  final String? selectedFolderId;
  final LibraryStats stats;
  final int historyCount;
  final String libraryName;

  final ValueChanged<SidebarView> onSelectCollection;
  final ValueChanged<String?> onSelectFolder;
  final VoidCallback onSwitchLibrary;
  final VoidCallback onSearch;
  final VoidCallback onClose;

  final GestureDragUpdateCallback onHorizontalDragUpdate;
  final GestureDragEndCallback onHorizontalDragEnd;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        _buildDrawer(),
        _buildScrim(),
      ],
    );
  }

  Widget _buildDrawer() {
    return Positioned(
      left: 0,
      top: 0,
      bottom: 0,
      width: width,
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, child) {
          final t = Curves.easeOutCubic.transform(animation.value);
          return Transform.translate(offset: Offset(width * (t - 1), 0), child: child);
        },
        child: GestureDetector(
          onHorizontalDragUpdate: onHorizontalDragUpdate,
          onHorizontalDragEnd: onHorizontalDragEnd,
          child: FolderDrawer(
            folders: folders,
            view: view,
            selectedFolderId: selectedFolderId,
            stats: stats,
            historyCount: historyCount,
            onSelectCollection: onSelectCollection,
            onSelectFolder: onSelectFolder,
            libraryName: libraryName,
            onSwitchLibrary: onSwitchLibrary,
            onSearch: onSearch,
          ),
        ),
      ),
    );
  }

  Widget _buildScrim() {
    return Positioned.fill(
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, _) {
          final t = Curves.easeOutCubic.transform(animation.value);
          return IgnorePointer(
            ignoring: t <= 0,
            child: Padding(
              padding: EdgeInsets.only(left: width * t),
              child: GestureDetector(
                onTap: onClose,
                onHorizontalDragUpdate: onHorizontalDragUpdate,
                onHorizontalDragEnd: onHorizontalDragEnd,
                child: ColoredBox(
                  color: Colors.black.withValues(alpha: 0.28 * t),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// 主内容随抽屉平移 + 左侧大圆角的包装。
class DrawerShift extends StatelessWidget {
  const DrawerShift({
    super.key,
    required this.animation,
    required this.width,
    required this.child,
  });

  final Animation<double> animation;
  final double width;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, inner) {
        final t = Curves.easeOutCubic.transform(animation.value);
        return Transform.translate(
          offset: Offset(width * t, 0),
          child: ClipRRect(
            borderRadius: BorderRadius.horizontal(left: Radius.circular(40 * t)),
            child: inner,
          ),
        );
      },
      child: child,
    );
  }
}

/// 只做水平平移（不带圆角），用于 header 等浮层跟随抽屉移动。
class SlideWithDrawer extends StatelessWidget {
  const SlideWithDrawer({
    super.key,
    required this.animation,
    required this.width,
    required this.child,
  });

  final Animation<double> animation;
  final double width;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, inner) {
        final t = Curves.easeOutCubic.transform(animation.value);
        return Transform.translate(offset: Offset(width * t, 0), child: inner);
      },
      child: child,
    );
  }
}
