import 'dart:async';

import 'package:flutter/material.dart';

import '../controllers/home_controller.dart';
import '../controllers/tile_gesture_controller.dart';
import '../controllers/pinch_zoom_controller.dart';
import '../models/item.dart';
import '../services/api_service.dart';
import '../services/inbox_service.dart';
import '../services/gallery_actions.dart';
import '../services/media_actions.dart';
import '../services/share_tag_service.dart';
import '../services/home_socket_bindings.dart';
import '../services/websocket_service.dart';
import '../widgets/item_preview_overlay.dart';
import 'connect_screen.dart';
import 'detail_screen.dart';
import 'dialogs/home_dialogs.dart';
import 'home/widgets/gallery_scaffold.dart';
import 'home/widgets/home_shell.dart';
import 'home/widgets/home_menu_actions.dart';
import 'home/widgets/home_navigation.dart';
import '../utils/snack.dart';
import '../services/api_upload.dart';

/// 主界面：资料库浏览。
///
/// 分工（详见 mobile/CODE_STYLE.md）：
///  · 数据与浏览状态 → [HomeController]
///  · 双指缩放      → [PinchZoomController]
///  · 媒体动作      → `MediaActions`
///  · 弹窗          → [HomeDialogs]
///  · 视图          → `screens/home/widgets/`
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with WidgetsBindingObserver, TickerProviderStateMixin {
  final HomeController _data = HomeController();
  final PinchZoomController _zoom = PinchZoomController();
  final ScrollController _scrollController = ScrollController();
  late final AnimationController _drawer;

  final TileGestureController _tileGesture = TileGestureController();
  bool _isUploading = false;
  bool _drawerInteractable = false;
  int _inboxCount = InboxService.instance.count;

  late final HomeSocketBindings _sockets;

  @override
  void initState() {
    super.initState();
    _drawer = AnimationController(vsync: this, duration: const Duration(milliseconds: 240))
      ..addListener(_onDrawerTick);
    _data.addListener(_onDataChanged);
    _zoom.addListener(_onZoomChanged);
    _tileGesture.addListener(_onDataChanged);
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addObserver(this);
    InboxService.instance.addListener(_onInboxChanged);
    ShareTagService.instance.addListener(_onShareTagsChanged);

    _sockets = HomeSocketBindings(
      onLibraryChanged: (_, _) {
        if (!mounted) return;
        setState(() {});
        unawaited(_data.loadNavMetadata());
        unawaited(_data.loadStats());
        unawaited(_data.loadItems(refresh: true));
      },
      onItemsUpdated: () {
        if (mounted) unawaited(_data.reloadWindow());
      },
      onPairingRevoked: () {
        if (!mounted) return;
        HomeDialogs.showPairingRevoked(context, onConfirm: () => _disconnect(silent: true));
      },
    )..connect();
    unawaited(_data.refreshAll());
  }

  @override
  void dispose() {
    _sockets.dispose();
    InboxService.instance.removeListener(_onInboxChanged);
    ShareTagService.instance.removeListener(_onShareTagsChanged);
    _data
      ..removeListener(_onDataChanged)
      ..dispose();
    _zoom
      ..removeListener(_onZoomChanged)
      ..dispose();
    _tileGesture
      ..removeListener(_onDataChanged)
      ..dispose();
    _scrollController.dispose();
    _drawer.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    if (!WebSocketService.instance.isConnected) {
      WebSocketService.instance.connect();
    }
    unawaited(_data.refreshAll());
  }

  // ── 监听 ────────────────────────────────────────────────────────────

  void _onDataChanged() {
    if (mounted) setState(() {});
  }

  void _onZoomChanged() {
    if (mounted) setState(() {});
  }

  void _onInboxChanged() {
    if (!mounted) return;
    setState(() => _inboxCount = InboxService.instance.count);
  }

  void _onShareTagsChanged() {
    if (mounted) setState(() {});
  }

  void _markLocalMutation() {
    _sockets.markLocalMutation();
    _data.cancelPendingRefresh();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 400) {
      if (!_data.isLoading && _data.hasMore) unawaited(_data.loadItems());
    }
  }

  // ── 抽屉 ────────────────────────────────────────────────────────────

  void _onDrawerTick() {
    final next = _drawer.value > 0.001;
    if (next != _drawerInteractable && mounted) {
      setState(() => _drawerInteractable = next);
    }
  }

  bool get _drawerOpen => _drawer.value > 0.5;

  double get _drawerWidth => MediaQuery.sizeOf(context).width * 2 / 3;

  void _snapDrawer({required bool open}) => open ? _drawer.forward() : _drawer.reverse();

  void _onDrawerHorizontalUpdate(DragUpdateDetails d) =>
      _drawer.value = (_drawer.value + d.delta.dx / _drawerWidth).clamp(0.0, 1.0);

  void _onDrawerHorizontalEnd(DragEndDetails d) {
    final v = d.primaryVelocity ?? 0;
    _snapDrawer(open: v.abs() > 500 ? v > 0 : _drawer.value > 0.4);
  }

  // ── 条目交互 ────────────────────────────────────────────────────────

  void _onTileTap(MobileItem item) {
    if (_tileGesture.selectedIds.isNotEmpty) {
      _tileGesture.toggleSelected(item.id);
    } else if (_data.isTrashView) {
      unawaited(_restoreItem(item));
    } else {
      final index = _data.items.indexOf(item);
      if (index >= 0) unawaited(_openDetail(index));
    }
  }

  void _onLongPressStart(MobileItem item, Offset local) =>
      _tileGesture.start(item.id, local);

  void _onLongPressMove(MobileItem item, Offset local) => _tileGesture.move(local);

  void _onLongPressEnd(MobileItem item) {
    switch (_tileGesture.end()) {
      case TileGestureResult.quickAction:
        unawaited(_openItemPreview(item));
      case TileGestureResult.select:
        _tileGesture.toggleSelected(item.id);
      case TileGestureResult.none:
        break;
    }
  }

  void _onLongPressCancel(MobileItem item) => _tileGesture.cancel();

  Future<void> _openDetail(int globalIndex) async {
    final before = _data.items.length;
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => DetailScreen(items: _data.items, initialIndex: globalIndex),
      ),
    );
    if (mounted && _data.items.length != before) {
      _markLocalMutation();
      unawaited(_data.reloadWindow());
    }
  }

  Future<void> _openItemPreview(MobileItem item) async {
    if (!_tileGesture.beginPreview()) return;
    final action = await showItemPreviewOverlay(context, item);
    _tileGesture.endPreview();
    if (!mounted || action == null) return;

    if (action == ItemPreviewAction.viewDetail) {
      final index = _data.items.indexOf(item);
      if (index >= 0) await _openDetail(index);
      return;
    }
    if (action == ItemPreviewAction.delete) {
      showAppSnack(context, '已移入废纸篓');
      _markLocalMutation();
      await _data.reloadWindow();
      return;
    }
    final result = await MediaActions.fromPreview(action, item);
    if (result != null && mounted) await _runAction(Future.value(result));
  }

  Future<void> _runAction(Future<MediaActionResult> action) async {
    final result = await action;
    if (!mounted) return;
    if (result.markedUsed) unawaited(_data.loadHistory());
    showAppSnack(context, result.message, error: result.error);
  }

  // ── 批量操作 / 废纸篓 / 上传 / 连接 ─────────────────────────────────

  /// 批量动作的统一收尾：成功则清空选择并标记本地变更。
  Future<void> _applyToSelection(Future<ActionResult> action) async {
    final result = await action;
    if (!mounted) return;
    if (result.ok) {
      setState(_tileGesture.clearSelection);
      _markLocalMutation();
    }
    showAppSnack(context, result.message, error: !result.ok);
  }

  Future<void> _restoreItem(MobileItem item) async {
    final result = await GalleryActions.restore(item);
    if (!mounted) return;
    if (result.ok) {
      _markLocalMutation();
      _data.removeLocal(item.id);
      unawaited(_data.loadItems(refresh: true));
    }
    showAppSnack(context, result.message, error: !result.ok);
  }

  Future<void> _confirmEmptyTrash() async {
    final confirmed = await HomeDialogs.confirmEmptyTrash(context);
    if (confirmed != true || !mounted) return;
    final result = await GalleryActions.emptyTrash();
    if (!mounted) return;
    if (result.ok) {
      _markLocalMutation();
      unawaited(_data.loadItems(refresh: true));
      unawaited(_data.loadStats());
    }
    showAppSnack(context, result.message, error: !result.ok);
  }

  Future<void> _openFilterSheet() async {
    final applied = await HomeDialogs.showFilterSheet(
      context,
      initial: _data.query,
      tags: _data.tags,
      folders: _data.folders,
      colors: _data.colors,
    );
    if (applied != null && mounted) _data.applyFilter(applied);
  }

  Future<void> _handleUpload() async {
    final paths = await ApiService.instance.pickMediaFiles();
    if (paths.isEmpty || !mounted) return;
    setState(() => _isUploading = true);
    HomeDialogs.showUploadProgress(context, count: paths.length);
    final result = await GalleryActions.upload(paths);
    if (!mounted) return;
    Navigator.of(context, rootNavigator: true).pop();
    setState(() => _isUploading = false);
    if (!mounted) return;
    if (result.error != null) {
      showAppSnack(context, '上传失败: ${result.error}', error: true);
    } else {
      _markLocalMutation();
      await _data.reloadWindow();
      if (mounted) showAppSnack(context, '已上传 ${result.count} 个素材');
    }
  }

  Future<void> _disconnect({bool silent = false}) async {
    if (!silent && !await HomeDialogs.confirmDisconnect(context)) return;
    await ApiService.instance.disconnect();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const ConnectScreen()),
      (_) => false,
    );
  }

  void _onMenuSelected(String value) => HomeMenuActions.handle(
        value,
        context: context,
        onRefresh: () => unawaited(_data.loadItems(refresh: true)),
        onFilter: () => unawaited(_openFilterSheet()),
        onEmptyTrash: () => unawaited(_confirmEmptyTrash()),
        onDisconnect: () => unawaited(_disconnect()),
      );

  // ── 构建 ────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width * 2 / 3;
    return HomeShell(
      drawerAnimation: _drawer,
      drawerWidth: width,
      content: GalleryScaffold(
        data: _data,
        zoom: _zoom,
        tileGesture: _tileGesture,
        scrollController: _scrollController,
        selectedIds: _tileGesture.selectedIds,
        drawerInteractable: _drawerInteractable,
        isUploading: _isUploading,
        onDrawerHorizontalUpdate: _onDrawerHorizontalUpdate,
        onDrawerHorizontalEnd: _onDrawerHorizontalEnd,
        onRetry: () => unawaited(_data.loadItems(refresh: true)),
        onTileTap: _onTileTap,
        onTileSelect: (item) => _tileGesture.toggleSelected(item.id),
        onTilePreview: (item) => unawaited(_openItemPreview(item)),
        onLongPressStart: _onLongPressStart,
        onLongPressMove: _onLongPressMove,
        onLongPressEnd: _onLongPressEnd,
        onLongPressCancel: _onLongPressCancel,
        onClearSelection: () => setState(_tileGesture.clearSelection),
        onAddTag: () => unawaited(HomeDialogs.pickTagAnd(
          context,
          _data.tags,
          (tag) => _applyToSelection(GalleryActions.addTag(_tileGesture.selectedIds, tag)),
        )),
        onAddToFolder: () => unawaited(HomeDialogs.pickFolderAnd(
          context,
          _data.folders,
          (folder) => _applyToSelection(
            GalleryActions.addToFolder(_tileGesture.selectedIds, folder),
          ),
        )),
        onUpload: () => unawaited(_handleUpload()),
      ),
      data: _data,
      libraryName: ApiService.instance.libraryName ?? 'Bowerbird',
      inboxCount: _inboxCount,
      onOpenDrawer: () => _snapDrawer(open: !_drawerOpen),
      onSearch: () => HomeNavigation.openSearch(context),
      onMenuSelected: _onMenuSelected,
      onSelectCollection: (v) => _selectSidebar(() => _data.selectCollection(v)),
      onSelectFolder: (id) => _selectSidebar(() => _data.selectFolder(id)),
      onSwitchLibrary: () => unawaited(
        HomeNavigation.pickLibrary(
          context,
          onSwitched: () {
            unawaited(_data.loadNavMetadata());
            unawaited(_data.loadItems(refresh: true));
          },
        ),
      ),
      onCloseDrawer: () => _snapDrawer(open: false),
      onHorizontalDragUpdate: _onDrawerHorizontalUpdate,
      onHorizontalDragEnd: _onDrawerHorizontalEnd,
    );
  }

  /// 侧边栏选择后关闭抽屉再切换视图。
  void _selectSidebar(VoidCallback change) {
    _snapDrawer(open: false);
    change();
  }

}
