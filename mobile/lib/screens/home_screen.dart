import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/item.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../services/item_query.dart';
import '../services/usage_history_service.dart';
import '../services/refresh_gate.dart';
import 'connect_screen.dart';
import '../services/inbox_service.dart';
import '../services/share_tag_service.dart';
import '../widgets/share_tag_badge.dart';
import 'detail_screen.dart';
import 'inbox_screen.dart';
import '../widgets/item_preview_overlay.dart';
import '../widgets/folder_drawer.dart';
import '../widgets/filter_sheet.dart';
import '../theme/app_theme.dart';
import 'search_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with WidgetsBindingObserver, TickerProviderStateMixin {
  final List<MobileItem> _items = [];
  final ScrollController _scrollController = ScrollController();

  bool _isLoading = false;
  bool _hasMore = true;
  int _offset = 0;
  static const int _pageSize = 60;
  // Grid animates GIFs only below this size; larger ones keep the static
  // thumbnail and the GIF badge to avoid multi-megabyte downloads per tile.
  static const int _gifAnimationMaxBytes = 8 * 1024 * 1024;
  String? _errorMessage;
  bool _isUploading = false;
  StreamSubscription? _wsLibSub;
  StreamSubscription? _wsItemsSub;
  StreamSubscription? _wsRevokedSub;
  bool _pendingRefresh = false;
  // 侧边栏当前视图（与桌面端一致：通用集合 or 某个文件夹）
  SidebarView _view = SidebarView.all;
  String? _activeFolderId;
  LibraryStats _stats = const LibraryStats();
  // 使用历史：本地记录的「最近使用」素材 id（对应桌面端 drag-history）
  List<String> _historyIds = [];
  final RefreshGate _refreshGate = RefreshGate();
  DateTime _lastLocalMutation = DateTime.fromMillisecondsSinceEpoch(0);
  int _inboxCount = InboxService.instance.count;
  late final AnimationController _drawer;
  ItemQuery _query = const ItemQuery();
  List<MobileFolder> _folders = [];
  List<MobileTag> _tags = [];
  List<String> _colors = [];
  final Set<String> _selectedIds = {};
  double _gridScale = 3;
  double _pinchStartScale = 3;
  // 长按手势状态：长按抬起时再依据是否上滑决定「多选」还是「快速操作」
  bool _isLongPressActive = false;
  bool _quickActionSwipedUp = false;
  Offset? _quickActionOrigin;
  // 正在被长按的条目 id，用于在格子上覆盖半透明高亮
  String? _pressedItemId;
  // 手指抬起判定为「上滑」所需的最小位移（逻辑像素）
  static const double _quickActionSwipeThreshold = 16;
  bool _previewOpening = false;

  void _onInboxChanged() {
    if (!mounted) return;
    setState(() => _inboxCount = InboxService.instance.count);
  }

  void _onShareTagsChanged() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    _drawer = AnimationController(vsync: this, duration: const Duration(milliseconds: 240));
    _drawer.addListener(_onDrawerTick);
    _loadItems(refresh: true);
    _loadNavMetadata();
    _loadStats();
    _loadHistory();
    _scrollController.addListener(_onScroll);
    _initWebSocket();
    WidgetsBinding.instance.addObserver(this);
    InboxService.instance.addListener(_onInboxChanged);
    ShareTagService.instance.addListener(_onShareTagsChanged);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (!WebSocketService.instance.isConnected) {
        WebSocketService.instance.connect();
      }
      _loadItems(refresh: true);
      _loadStats();
      _loadHistory();
    }
  }

  void _initWebSocket() {
    WebSocketService.instance.connect();
    _wsLibSub = WebSocketService.instance.onLibraryChanged.listen((event) {
      if (mounted) {
        final data = event['data'] as Map<String, dynamic>? ?? event;
        final newName = data['name'] as String?;
        if (newName != null && newName.isNotEmpty) {
          setState(() => ApiService.instance.libraryName = newName);
        }
        unawaited(_loadNavMetadata());
        unawaited(_loadStats());
        _refreshGate.schedule(() => _loadItems(refresh: true));
      }
    });
    _wsItemsSub = WebSocketService.instance.onItemsUpdated.listen((event) {
      if (!mounted) return;
      if (DateTime.now().difference(_lastLocalMutation) < const Duration(milliseconds: 900)) {
        return;
      }
      _refreshGate.schedule(_reloadWindow);
    });
    _wsRevokedSub = WebSocketService.instance.onPairingRevoked.listen((_) {
      if (mounted) {
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: const Text('授权已撤销'),
            content: const Text('桌面端已撤销此设备的连接授权，请重新配对。'),
            actions: [
              FilledButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  _disconnect(silent: true);
                },
                child: const Text('确定'),
              ),
            ],
          ),
        );
      }
    });
  }

  @override
  void dispose() {
    _wsLibSub?.cancel();
    _wsItemsSub?.cancel();
    _wsRevokedSub?.cancel();
    InboxService.instance.removeListener(_onInboxChanged);
    ShareTagService.instance.removeListener(_onShareTagsChanged);
    _scrollController.dispose();
    _drawer.dispose();
    WidgetsBinding.instance.removeObserver(this);
    _refreshGate.cancel();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 400) {
      if (!_isLoading && _hasMore) {
        _loadItems();
      }
    }
  }

  Future<void> _loadItems({bool refresh = false}) async {
    if (_isLoading) {
      if (refresh) {
        _pendingRefresh = true;
      }
      return;
    }

    if (refresh) {
      setState(() {
        _isLoading = true;
        _offset = 0;
        _hasMore = true;
        _errorMessage = null;
      });
    } else {
      setState(() {
        _isLoading = true;
      });
    }

    final requestOffset = refresh ? 0 : _offset;
    try {
      final result = await _fetchPage(requestOffset);
      if (mounted) {
        setState(() {
          if (refresh) {
            _items.clear();
          }
          _items.addAll(result.items);
          _offset = requestOffset + result.items.length;
          _hasMore = _items.length < result.total && result.items.isNotEmpty;
          _isLoading = false;
        });
      }
      // 统计数字（未打标签/未分类/废纸篓）随时保持最新
      unawaited(_loadStats());
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e.toString().replaceAll('Exception: ', '');
        });
      }
    } finally {
      if (mounted && _pendingRefresh) {
        _pendingRefresh = false;
        _loadItems(refresh: true);
      }
    }
  }

  /// 按当前侧边栏视图抓取一页：废纸篓走专用接口，使用历史是本地列表，
  /// 其余（全部 / 未打标签 / 未分类 / 文件夹）走查询接口。
  Future<({int total, List<MobileItem> items})> _fetchPage(int offset) async {
    if (_isTrashView) {
      return ApiService.instance.getCollectionItems(
        collection: LibraryCollection.trash,
        limit: _pageSize,
        offset: offset,
      );
    }
    if (_isHistoryView) {
      final ordered = _historyIds;
      final slice = ordered.skip(offset).take(_pageSize).toList();
      final items = <MobileItem>[];
      for (final id in slice) {
        final cached = _items.where((it) => it.id == id).firstOrNull;
        if (cached != null) {
          items.add(cached);
          continue;
        }
        try {
          items.add(MobileItem.fromDetail(await ApiService.instance.getItemDetail(id)));
        } catch (_) {
          // 条目可能已被删除，跳过
        }
      }
      return (total: ordered.length, items: items);
    }
    return ApiService.instance.queryItems(query: _query, limit: _pageSize, offset: offset);
  }

  /// 与 [_fetchPage] 一致，但按需要一次性取回更大的窗口（用于 ws 刷新）。
  Future<({int total, List<MobileItem> items})> _fetchPageSized(int limit) async {
    if (_isTrashView) {
      return ApiService.instance.getCollectionItems(
        collection: LibraryCollection.trash,
        limit: limit,
        offset: 0,
      );
    }
    if (_isHistoryView) {
      final ordered = _historyIds.take(limit).toList();
      final items = <MobileItem>[];
      for (final id in ordered) {
        try {
          items.add(MobileItem.fromDetail(await ApiService.instance.getItemDetail(id)));
        } catch (_) {}
      }
      return (total: _historyIds.length, items: items);
    }
    return ApiService.instance.queryItems(query: _query, limit: limit, offset: 0);
  }

  Future<void> _loadStats() async {
    try {
      final stats = await ApiService.instance.getStats();
      if (!mounted) return;
      setState(() => _stats = stats);
    } catch (_) {}
  }

  Future<void> _loadHistory() async {
    final ids = await UsageHistoryService.instance.ids();
    if (!mounted) return;
    setState(() => _historyIds = ids);
  }

  /// Re-runs the first page sized to the currently loaded window so a ws
  /// refresh does not visibly collapse the timeline back to one page.
  Future<void> _reloadWindow() async {
    if (_isLoading) {
      _pendingRefresh = true;
      return;
    }
    final target = _items.isEmpty ? _pageSize : (_items.length > 500 ? _pageSize : _items.length);
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final result = await _fetchPageSized(target);
      if (mounted) {
        setState(() {
          _items
            ..clear()
            ..addAll(result.items);
          _offset = result.items.length;
          _hasMore = _items.length < result.total && result.items.isNotEmpty;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e.toString().replaceAll('Exception: ', '');
        });
      }
    } finally {
      if (mounted && _pendingRefresh) {
        _pendingRefresh = false;
        _reloadWindow();
      }
    }
  }

  void _markLocalMutation() {
    _lastLocalMutation = DateTime.now();
    _refreshGate.cancel();
  }

  Future<void> _loadNavMetadata() async {
    try {
      final tags = await ApiService.instance.getTags();
      final folders = await ApiService.instance.getFolders();
      final colors = await ApiService.instance.getColors();
      if (!mounted) return;
      setState(() {
        _tags = tags;
        _folders = folders;
        _colors = colors;
      });
    } catch (_) {}
  }

  int get _crossAxisCount => _gridScale.round().clamp(2, 5);

  double get _drawerWidth => MediaQuery.sizeOf(context).width * 2 / 3;

  bool _drawerInteractable = false;

  void _onDrawerTick() {
    final next = _drawer.value > 0.001;
    if (next != _drawerInteractable && mounted) {
      setState(() => _drawerInteractable = next);
    }
  }

  bool get _drawerOpen => _drawer.value > 0.5;

  void _snapDrawer({required bool open}) {
    if (open) {
      _drawer.fling(velocity: 2);
    } else {
      _drawer.fling(velocity: -2);
    }
  }

  void _onDrawerHorizontalUpdate(DragUpdateDetails details) {
    final next = (_drawer.value + details.delta.dx / _drawerWidth).clamp(0.0, 1.0);
    _drawer.value = next;
  }

  void _onDrawerHorizontalEnd(DragEndDetails details) {
    final v = details.primaryVelocity ?? 0;
    if (v.abs() > 500) {
      _snapDrawer(open: v > 0);
      return;
    }
    _snapDrawer(open: _drawer.value > 0.4);
  }

  /// 无边框、带 10% 大阴影的圆形图标按钮（header 内使用）。
  Widget _roundIconButton({
    required IconData icon,
    required VoidCallback onPressed,
    String? tooltip,
    Widget? badgeChild,
  }) {
    final theme = Theme.of(context);
    // 用圆形 ShapeDecoration（自带 fill + 阴影），避免默认正方形背景露出直角。
    final button = DecoratedBox(
      decoration: ShapeDecoration(
        color: theme.colorScheme.surface,
        shape: const CircleBorder(),
        shadows: _headerShadows,
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: SizedBox(
            width: 48,
            height: 48,
            child: Icon(icon, size: 24, color: theme.colorScheme.onSurface),
          ),
        ),
      ),
    );
    final wrapped = badgeChild ?? button;
    if (tooltip == null) return wrapped;
    return Tooltip(message: tooltip, child: wrapped);
  }

  /// header 按钮/胶囊共用的投影：黑色、透明度 10%、大范围模糊。
  List<BoxShadow> get _headerShadows => [
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.10),
      blurRadius: 24,
      spreadRadius: 2,
      offset: const Offset(0, 6),
    ),
  ];

  /// 胶囊（全圆角矩形）背景：填充色 + 共用投影。
  ShapeDecoration _headerPillDecoration(ThemeData theme, Radius radius) {
    return ShapeDecoration(
      color: theme.colorScheme.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(radius)),
      shadows: _headerShadows,
    );
  }

  void _selectCollection(SidebarView view) {
    _snapDrawer(open: false);
    if (view == _view && view != SidebarView.folder) return;
    setState(() {
      _view = view;
      _activeFolderId = null;
      _query = _baseQuery();
      _selectedIds.clear();
    });
    _loadItems(refresh: true);
  }

  void _selectFolder(String? folderId) {
    _snapDrawer(open: false);
    setState(() {
      _view = SidebarView.folder;
      _activeFolderId = folderId;
      _query = _baseQuery();
      _selectedIds.clear();
    });
    _loadItems(refresh: true);
  }

  /// 当前侧边栏视图对应的查询（保留筛选 sheet 里的其他条件）。
  ItemQuery _baseQuery() {
    return ItemQuery(
      text: _query.text,
      type: _query.type,
      orientation: _query.orientation,
      tag: _query.tag,
      folder: _view == SidebarView.folder ? _activeFolderId : null,
      color: _query.color,
      size: _query.size,
      rating: _query.rating,
      hasUrl: _query.hasUrl,
      hasNote: _query.hasNote,
      untagged: _view == SidebarView.untagged,
      uncategorized: _view == SidebarView.uncategorized,
    );
  }

  /// 各视图的空状态文案，与桌面端 workspace 的空状态保持一致。
  String get _emptyMessage {
    switch (_view) {
      case SidebarView.trash:
        return '废纸篓是空的';
      case SidebarView.untagged:
        return '没有未打标签的素材';
      case SidebarView.uncategorized:
        return '没有未分类的素材';
      case SidebarView.history:
        return '还没有使用记录\n分享或导出素材后会出现在这里';
      case SidebarView.folder:
        return _activeFolderId == null ? '资料库是空的' : '这个文件夹是空的';
      case SidebarView.all:
        return '资料库是空的';
    }
  }

  bool get _isTrashView => _view == SidebarView.trash;
  bool get _isHistoryView => _view == SidebarView.history;

  void _openFilterSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => FilterSheet(
        initial: _query,
        tags: _tags,
        folders: _folders,
        colors: _colors,
        onApply: (q) {
          setState(() {
            // 只采纳筛选条件本身；侧边栏集合（未打标签/未分类）与当前文件夹
            // 仍由 _view/_activeFolderId 决定，避免筛选后视图悄悄变回「全部」。
            _query = ItemQuery(
              text: q.text,
              type: q.type,
              orientation: q.orientation,
              tag: q.tag,
              folder: _view == SidebarView.folder ? _activeFolderId : null,
              color: q.color,
              size: q.size,
              rating: q.rating,
              hasUrl: q.hasUrl,
              hasNote: q.hasNote,
              untagged: _view == SidebarView.untagged,
              uncategorized: _view == SidebarView.uncategorized,
            );
          });
          _loadItems(refresh: true);
        },
      ),
    );
  }

  void _toggleSelected(MobileItem item) {
    setState(() {
      if (_selectedIds.contains(item.id)) {
        _selectedIds.remove(item.id);
      } else {
        _selectedIds.add(item.id);
      }
    });
  }

  Future<void> _addSelectedToFolder(MobileFolder folder) async {
    final ids = _selectedIds.toList();
    try {
      for (final id in ids) {
        await ApiService.instance.addItemToFolder(id, folder.id);
      }
      if (!mounted) return;
      setState(() => _selectedIds.clear());
      _markLocalMutation();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('已添加到「${folder.name}」')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('添加失败: $e'), backgroundColor: Colors.red.shade700));
    }
  }

  Future<void> _addTagToSelected(String tag) async {
    final ids = _selectedIds.toList();
    try {
      for (final id in ids) {
        await ApiService.instance.addTagToItem(id, tag);
      }
      if (!mounted) return;
      setState(() => _selectedIds.clear());
      _markLocalMutation();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('已添加标签「$tag」')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('添加标签失败: $e'), backgroundColor: Colors.red.shade700));
    }
  }

  /// 废纸篓视图里点击条目即恢复（与桌面端从废纸篓恢复的行为对应）。
  Future<void> _restoreItem(MobileItem item) async {
    try {
      await ApiService.instance.restoreItem(item.id);
      if (!mounted) return;
      _markLocalMutation();
      setState(() => _items.removeWhere((it) => it.id == item.id));
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已从废纸篓恢复')));
      _loadItems(refresh: true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('恢复失败: ${e.toString().replaceAll('Exception: ', '')}'),
          backgroundColor: Colors.red.shade700,
        ),
      );
    }
  }

  Future<void> _confirmEmptyTrash() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('清空废纸篓？'),
        content: const Text('废纸篓中的素材将被永久删除，此操作无法撤销。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            child: const Text('清空'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ApiService.instance.emptyTrash();
      if (!mounted) return;
      _markLocalMutation();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('废纸篓已清空')));
      _loadItems(refresh: true);
      _loadStats();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('清空失败: ${e.toString().replaceAll('Exception: ', '')}'),
          backgroundColor: Colors.red.shade700,
        ),
      );
    }
  }

  Future<void> _pickFolderForSelection() async {
    final flat = _folders.expand((f) => f.flatten()).toList();
    if (flat.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('还没有文件夹')));
      return;
    }
    final chosen = await showModalBottomSheet<MobileFolder>(
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(
          children: [
            const ListTile(title: Text('添加到文件夹')),
            for (final f in flat)
              ListTile(
                leading: const Icon(Icons.folder_outlined),
                title: Text(f.name),
                onTap: () => Navigator.pop(ctx, f),
              ),
          ],
        ),
      ),
    );
    if (chosen != null) await _addSelectedToFolder(chosen);
  }

  Future<void> _pickTagForSelection() async {
    String? chosen;
    if (_tags.isNotEmpty) {
      chosen = await showModalBottomSheet<String>(
        context: context,
        builder: (ctx) => SafeArea(
          child: ListView(
            children: [
              const ListTile(title: Text('添加标签')),
              for (final t in _tags)
                ListTile(
                  leading: const Icon(Icons.label_outline),
                  title: Text(t.name),
                  onTap: () => Navigator.pop(ctx, t.name),
                ),
              ListTile(
                leading: const Icon(Icons.add),
                title: const Text('新建标签'),
                onTap: () => Navigator.pop(ctx, '__new__'),
              ),
            ],
          ),
        ),
      );
    } else {
      chosen = '__new__';
    }
    if (chosen == '__new__') {
      final controller = TextEditingController();
      chosen = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('新建标签'),
          content: TextField(controller: controller, autofocus: true),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, controller.text.trim()),
              child: const Text('添加'),
            ),
          ],
        ),
      );
    }
    if (chosen != null && chosen.isNotEmpty) await _addTagToSelected(chosen);
  }

  Map<String, List<MobileItem>> _groupItemsByMonth(List<MobileItem> items) {
    final groups = <String, List<MobileItem>>{};
    final formatter = DateFormat('MMMM yyyy');

    for (final item in items) {
      final key = formatter.format(item.dateTime);
      groups.putIfAbsent(key, () => []).add(item);
    }
    return groups;
  }

  Future<void> _openDetail(int globalIndex) async {
    final deleted = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => DetailScreen(items: _items, initialIndex: globalIndex),
      ),
    );
    if (deleted == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已移入废纸篓')));
      _markLocalMutation();
      unawaited(_reloadWindow());
    }
  }

  Future<void> _openItemPreview(MobileItem item, int globalIndex) async {
    if (_previewOpening) return;
    _previewOpening = true;
    final action = await showItemPreviewOverlay(context, item);
    _previewOpening = false;
    if (!mounted) return;
    if (action == null) return;

    switch (action) {
      case ItemPreviewAction.viewDetail:
        await _openDetail(globalIndex);
      case ItemPreviewAction.copyContent:
        await _copyItemContent(item);
      case ItemPreviewAction.download:
        await _downloadItem(item);
      case ItemPreviewAction.share:
        await _shareItem(item);
      case ItemPreviewAction.delete:
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已移入废纸篓')));
        _markLocalMutation();
        await _reloadWindow();
    }
  }

  Future<void> _disconnect({bool silent = false}) async {
    if (!silent) {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Disconnect Server'),
          content: const Text('Disconnect from current Bowerbird desktop server?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Disconnect'),
            ),
          ],
        ),
      );
      if (confirm != true) return;
    }

    WebSocketService.instance.disconnect();
    await ApiService.instance.disconnect();
    if (mounted) {
      Navigator.of(context)
          .pushReplacement(MaterialPageRoute(builder: (_) => const ConnectScreen()));
    }
  }

  Future<void> _showLibraryPicker() async {
    List<MobileLibrary> libraries = [];
    try {
      libraries = await ApiService.instance.getLibraries();
    } catch (_) {}

    if (!mounted) return;

    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        '切换资源库 / Switch Library',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                ),
                const Divider(),
                if (libraries.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(24.0),
                    child: Center(child: Text('未发现其他资源库')),
                  )
                else
                  Flexible(
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: libraries.length,
                      itemBuilder: (tileCtx, i) {
                        final lib = libraries[i];
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: lib.isActive
                                ? Theme.of(context).colorScheme.primaryContainer
                                : Theme.of(context).colorScheme.surfaceContainerHighest,
                            child: Icon(
                              Icons.photo_library_outlined,
                              color: lib.isActive
                                  ? Theme.of(context).colorScheme.primary
                                  : Theme.of(context).colorScheme.outline,
                            ),
                          ),
                          title: Text(
                            lib.name,
                            style: TextStyle(
                              fontWeight: lib.isActive ? FontWeight.bold : FontWeight.normal,
                            ),
                          ),
                          subtitle: Text('${lib.itemCount} 个素材 • ${lib.path}'),
                          trailing: lib.isActive
                              ? Icon(
                                  Icons.check_circle,
                                  color: Theme.of(context).colorScheme.primary,
                                )
                              : null,
                          onTap: () async {
                            Navigator.pop(ctx);
                            if (!lib.isActive) {
                              try {
                                await ApiService.instance.switchLibrary(lib.path);
                                if (mounted) {
                                  setState(() => ApiService.instance.libraryName = lib.name);
                                  ScaffoldMessenger.of(
                                    context,
                                  ).showSnackBar(SnackBar(content: Text('已切换至资源库: ${lib.name}')));
                                  unawaited(_loadNavMetadata());
                                  _loadItems(refresh: true);
                                }
                              } catch (e) {
                                if (mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text('切库失败: $e'),
                                      backgroundColor: Colors.red.shade700,
                                    ),
                                  );
                                }
                              }
                            }
                          },
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _handleUpload() async {
    final paths = await ApiService.instance.pickMediaFiles();
    if (paths.isEmpty) return;

    if (!mounted) return;
    setState(() => _isUploading = true);

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(
            children: [
              const CircularProgressIndicator(),
              const SizedBox(width: 20),
              Expanded(child: Text('正在上传 ${paths.length} 个素材到当前资源库...')),
            ],
          ),
        ),
      ),
    );

    try {
      final result = await ApiService.instance.uploadFiles(paths);
      final count = result.count;
      if (mounted) {
        Navigator.pop(context); // Close dialog
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('成功上传 $count 个素材到当前资源库')));
        _markLocalMutation();
        await _reloadWindow();
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context); // Close dialog
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('上传失败: ${e.toString().replaceAll('Exception: ', '')}'),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  Future<void> _downloadItem(MobileItem item) async {
    try {
      final originalUrl = ApiService.instance.getOriginalUrl(item.id);
      final response = await http
          .get(Uri.parse(originalUrl), headers: ApiService.instance.authHeaders)
          .timeout(const Duration(seconds: 30));

      if (response.statusCode != 200) {
        throw Exception('HTTP ${response.statusCode}');
      }

      final filename = item.filename.isNotEmpty ? item.filename : '${item.id}.${item.extension}';
      await ApiService.instance.saveMediaToGallery(response.bodyBytes, filename, item.mimeType);

      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('已保存至手机相册/下载目录: $filename')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('下载失败: ${e.toString().replaceAll('Exception: ', '')}'),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
    }
  }

  Future<void> _copyItemContent(MobileItem item) async {
    if (item.size > ApiService.maxClipboardFileBytes) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('文件过大（${item.formattedSize}），请使用分享或下载'),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
      return;
    }
    try {
      await ApiService.instance.copyItemContent(item);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('已复制素材内容，可粘贴到微信等应用')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('复制失败: ${e.toString().replaceAll('Exception: ', '')}'),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
    }
  }

  Future<void> _shareItem(MobileItem item) async {
    try {
      final originalUrl = ApiService.instance.getOriginalUrl(item.id);
      final response = await http
          .get(Uri.parse(originalUrl), headers: ApiService.instance.authHeaders)
          .timeout(const Duration(seconds: 30));

      if (response.statusCode != 200) {
        throw Exception('HTTP ${response.statusCode}');
      }

      final tempDir = await getTemporaryDirectory();
      final filename = item.filename.isNotEmpty ? item.filename : '${item.id}.${item.extension}';
      final file = File('${tempDir.path}/$filename');
      await file.writeAsBytes(response.bodyBytes);

      // 分享即「使用」，记录到使用历史（等价于桌面端的拖出记录）
      await UsageHistoryService.instance.record(item.id);
      if (mounted) {
        setState(() => _historyIds = [item.id, ..._historyIds.where((id) => id != item.id)]);
        final xFile = XFile(file.path, mimeType: item.mimeType);
        await Share.shareXFiles([xFile], text: item.name.isNotEmpty ? item.name : item.filename);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('分享失败: $e'), backgroundColor: Colors.red.shade700));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final grouped = _groupItemsByMonth(_items);

    final drawerWidth = _drawerWidth;
    final libraryTitle = ApiService.instance.libraryName ?? 'Bowerbird';
    return Material(
      color: theme.colorScheme.surface,
      child: Stack(
        children: [
          AnimatedBuilder(
            animation: _drawer,
            builder: (context, child) {
              final t = Curves.easeOutCubic.transform(_drawer.value);
              return Transform.translate(
                offset: Offset(drawerWidth * t, 0),
                child: ClipRRect(
                  borderRadius: BorderRadius.horizontal(left: Radius.circular(40 * t)),
                  child: child,
                ),
              );
            },
            child: Scaffold(
              extendBodyBehindAppBar: true,
              appBar: AppBar(
                backgroundColor: Colors.transparent,
                elevation: 0,
                scrolledUnderElevation: 0,
                surfaceTintColor: Colors.transparent,
                centerTitle: true,
                automaticallyImplyLeading: false,
                toolbarHeight: kToolbarHeight + 8,
                // 标题与按钮由 body 内的 _buildHeader 浮层绘制（位于渐变与模糊之上），
                // 这里保持完全透明，只负责撑出安全区高度。
                flexibleSpace: const SizedBox.shrink(),
                title: const SizedBox.shrink(),
              ),
              body: GestureDetector(
                onHorizontalDragUpdate: _drawerInteractable ? _onDrawerHorizontalUpdate : null,
                onHorizontalDragEnd: _drawerInteractable ? _onDrawerHorizontalEnd : null,
                onScaleStart: (details) {
                  if (details.pointerCount >= 2) {
                    _pinchStartScale = _gridScale;
                  }
                },
                onScaleUpdate: (details) {
                  if (details.pointerCount < 2) return;
                  final next = (_pinchStartScale / details.scale).clamp(2.0, 5.0);
                  if ((next - _gridScale).abs() >= 0.15) {
                    setState(() => _gridScale = next);
                  }
                },
                child: _errorMessage != null && _items.isEmpty
                    ? Center(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(
                            24,
                            MediaQuery.paddingOf(context).top + kToolbarHeight,
                            24,
                            24,
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.cloud_off, size: 64, color: theme.colorScheme.error),
                              const SizedBox(height: 16),
                              Text(
                                _errorMessage!,
                                textAlign: TextAlign.center,
                                style: theme.textTheme.bodyMedium,
                              ),
                              const SizedBox(height: 16),
                              FilledButton.icon(
                                onPressed: () => _loadItems(refresh: true),
                                icon: const Icon(Icons.refresh),
                                label: const Text('Retry'),
                              ),
                            ],
                          ),
                        ),
                      )
                    : _items.isEmpty && !_isLoading
                    ? Center(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(
                            32,
                            MediaQuery.paddingOf(context).top + kToolbarHeight,
                            32,
                            32,
                          ),
                          child: Text(
                            _emptyMessage,
                            textAlign: TextAlign.center,
                            style: theme.textTheme.titleMedium?.copyWith(
                              color: theme.colorScheme.outline,
                              fontWeight: FontWeight.w400,
                            ),
                          ),
                        ),
                      )
                    : CustomScrollView(
                        controller: _scrollController,
                        physics: const AlwaysScrollableScrollPhysics(),
                        slivers: [
                          // 顶部留白：安全区 + 工具栏，留出空间给 _buildHeader 浮层。
                          SliverToBoxAdapter(
                            child: SizedBox(
                              height: MediaQuery.paddingOf(context).top + kToolbarHeight + 8,
                            ),
                          ),
                          ...grouped.entries.expand((entry) {
                            final monthName = entry.key;
                            final monthItems = entry.value;

                            return [
                              // Month Section Header
                              SliverToBoxAdapter(
                                child: Padding(
                                  padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(monthName, style: theme.textTheme.titleMedium),
                                      Text(
                                        '${monthItems.length}',
                                        style: theme.textTheme.bodySmall?.copyWith(
                                          color: theme.colorScheme.outline,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),

                              // 3-Column Square Grid
                              SliverPadding(
                                padding: const EdgeInsets.symmetric(horizontal: 8),
                                sliver: SliverGrid(
                                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                                    crossAxisCount: _crossAxisCount,
                                    crossAxisSpacing: 8,
                                    mainAxisSpacing: 8,
                                  ),
                                  delegate: SliverChildBuilderDelegate((context, index) {
                                    final item = monthItems[index];
                                    final globalIndex = _items.indexOf(item);
                                    final useAnimatedGif =
                                        item.isGif && item.size <= _gifAnimationMaxBytes;
                                    final selected = _selectedIds.contains(item.id);
                                    return _buildGridTile(
                                      item: item,
                                      globalIndex: globalIndex,
                                      useAnimatedGif: useAnimatedGif,
                                      selected: selected,
                                      theme: theme,
                                    );
                                  }, childCount: monthItems.length),
                                ),
                              ),
                            ];
                          }),

                          // Loading More Indicator
                          if (_isLoading && _items.isNotEmpty)
                            const SliverToBoxAdapter(
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
                            ),

                          const SliverToBoxAdapter(child: SizedBox(height: 32)),
                        ],
                      ),
              ),
              bottomNavigationBar: _selectedIds.isEmpty
                  ? null
                  : SafeArea(
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
                              Text('已选 ${_selectedIds.length}'),
                              const Spacer(),
                              TextButton(
                                onPressed: () => setState(() => _selectedIds.clear()),
                                child: const Text('取消'),
                              ),
                              FilledButton.tonal(
                                onPressed: _pickTagForSelection,
                                child: const Text('加标签'),
                              ),
                              const SizedBox(width: 8),
                              FilledButton(
                                onPressed: _pickFolderForSelection,
                                child: const Text('添加到…'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
              floatingActionButton: FloatingActionButton(
                heroTag: 'upload_fab',
                tooltip: '上传素材到电脑',
                onPressed: _isUploading ? null : _handleUpload,
                child: const Icon(Icons.add_photo_alternate_rounded),
              ),
            ),
          ),
          Positioned(
            left: 0,
            top: 0,
            bottom: 0,
            width: drawerWidth,
            child: AnimatedBuilder(
              animation: _drawer,
              builder: (context, child) {
                final t = Curves.easeOutCubic.transform(_drawer.value);
                return Transform.translate(offset: Offset(drawerWidth * (t - 1), 0), child: child);
              },
              child: GestureDetector(
                onHorizontalDragUpdate: _onDrawerHorizontalUpdate,
                onHorizontalDragEnd: _onDrawerHorizontalEnd,
                child: FolderDrawer(
                  folders: _folders,
                  view: _view,
                  selectedFolderId: _activeFolderId,
                  stats: _stats,
                  historyCount: _historyIds.length,
                  onSelectCollection: _selectCollection,
                  onSelectFolder: _selectFolder,
                  libraryName: libraryTitle,
                  onSwitchLibrary: _showLibraryPicker,
                  onSearch: () {
                    Navigator.of(context)
                        .push(MaterialPageRoute(builder: (_) => const SearchScreen()));
                  },
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _drawer,
              builder: (context, _) {
                final t = Curves.easeOutCubic.transform(_drawer.value);
                return IgnorePointer(
                  ignoring: t <= 0,
                  child: Padding(
                    padding: EdgeInsets.only(left: drawerWidth * t),
                    child: GestureDetector(
                      onTap: () => _snapDrawer(open: false),
                      onHorizontalDragUpdate: _onDrawerHorizontalUpdate,
                      onHorizontalDragEnd: _onDrawerHorizontalEnd,
                      child: ColoredBox(
                        color: Colors.black.withValues(alpha: 0.28 * t),
                        child: const SizedBox.expand(),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          // Header 浮层：渐变背景（从屏幕最上沿 / 安全区之上开始）+ 轻微背景模糊 + 最上层内容。
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: AnimatedBuilder(
              animation: _drawer,
              builder: (context, child) {
                final t = Curves.easeOutCubic.transform(_drawer.value);
                return Transform.translate(offset: Offset(drawerWidth * t, 0), child: child);
              },
              child: _buildHeader(context, theme),
            ),
          ),
        ],
      ),
    );
  }

  /// Header 浮层：背景（渐变 + 轻微模糊）在所有内容之下，标题与按钮在最上层。
  Widget _buildHeader(BuildContext context, ThemeData theme) {
    final topPadding = MediaQuery.paddingOf(context).top;
    final headerHeight = topPadding + kToolbarHeight + 8;
    final backgroundHeight = headerHeight + 24;
    const pillRadius = Radius.circular(24);

    return SizedBox(
      height: headerHeight,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // 背景层保持不变
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: backgroundHeight,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      theme.colorScheme.surface.withValues(alpha: 0.92),
                      theme.colorScheme.surface.withValues(alpha: 0.80),
                      theme.colorScheme.surface.withValues(alpha: 0.45),
                      theme.colorScheme.surface.withValues(alpha: 0),
                    ],
                    stops: const [0, 0.45, 0.75, 1],
                  ),
                ),
              ),
            ),
          ),
          // 内容层
          SafeArea(
            bottom: false,
            child: SizedBox(
              height: kToolbarHeight + 8,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Row(
                  children: [
                    _roundIconButton(
                      icon: Icons.menu,
                      tooltip: '文件夹',
                      onPressed: () => _snapDrawer(open: !_drawerOpen),
                    ),
                    // 不再显示当前资料库名称，仅作为左右两组按钮之间的弹性留白
                    const Spacer(),
                    const SizedBox(width: 10),
                    _buildActionPill(context, theme, pillRadius),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 右侧搜索与更多二枚按钮共用一个胶囊背景，每个按钮自身状态独立
  /// （透明背景，仅共享背景 + 阴影；按下时各自显示高亮水波纹）。
  Widget _buildActionPill(BuildContext context, ThemeData theme, Radius pillRadius) {
    // 注意：Material 必须在 ClipRRect 内部，否则 InkWell 的水波纹会被裁剪/绘制在上层
    // 之外而看不到；同时文字与图标都要在 Material 内部，否则会被材质背景遮住。
    return DecoratedBox(
      decoration: _headerPillDecoration(theme, pillRadius),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 搜索按钮（独立的按下高亮）
          ClipRRect(
            borderRadius: const BorderRadius.horizontal(left: Radius.circular(24)),
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                onTap: () {
                  Navigator.of(context)
                      .push(MaterialPageRoute(builder: (_) => const SearchScreen()));
                },
                child: SizedBox(
                  width: 48,
                  height: 48,
                  child: Icon(Icons.search, size: 24, color: theme.colorScheme.onSurface),
                ),
              ),
            ),
          ),
          // 更多按钮
          ClipRRect(
            borderRadius: const BorderRadius.horizontal(right: Radius.circular(24)),
            child: Material(
              type: MaterialType.transparency,
              child: PopupMenuButton<String>(
                tooltip: '更多',
                offset: const Offset(0, 48),
                padding: EdgeInsets.zero,
                onSelected: (value) {
                  switch (value) {
                    case 'refresh':
                      _loadItems(refresh: true);
                    case 'filter':
                      _openFilterSheet();
                    case 'inbox':
                      Navigator.of(context)
                          .push(MaterialPageRoute(builder: (_) => const InboxScreen()));
                    case 'emptyTrash':
                      _confirmEmptyTrash();
                    case 'disconnect':
                      _disconnect();
                  }
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'refresh',
                    child: Row(
                      children: [Icon(Icons.refresh, size: 20), SizedBox(width: 12), Text('刷新')],
                    ),
                  ),
                  PopupMenuItem(
                    value: 'filter',
                    child: Row(
                      children: [
                        const Icon(Icons.filter_list, size: 20),
                        const SizedBox(width: 12),
                        const Text('筛选'),
                        if (_query.toQueryString().isNotEmpty) ...[
                          const Spacer(),
                          Icon(Icons.circle, size: 8, color: theme.colorScheme.primary),
                        ],
                      ],
                    ),
                  ),
                  PopupMenuItem(
                    value: 'inbox',
                    child: Row(
                      children: [
                        const Icon(Icons.inbox_outlined, size: 20),
                        const SizedBox(width: 12),
                        const Text('收件箱'),
                        if (_inboxCount > 0) ...[const Spacer(), Text('$_inboxCount')],
                      ],
                    ),
                  ),
                  // 仅在废纸篓视图下提供「清空废纸篓」，与桌面端右键菜单一致
                  if (_isTrashView && _stats.trashCount > 0)
                    const PopupMenuItem(
                      value: 'emptyTrash',
                      child: Row(
                        children: [
                          Icon(Icons.delete_forever_outlined, size: 20),
                          SizedBox(width: 12),
                          Text('清空废纸篓'),
                        ],
                      ),
                    ),
                  const PopupMenuItem(
                    value: 'disconnect',
                    child: Row(
                      children: [
                        Icon(Icons.wifi_off_outlined, size: 20),
                        SizedBox(width: 12),
                        Text('断开连接'),
                      ],
                    ),
                  ),
                ],
                child: SizedBox(
                  width: 48,
                  height: 48,
                  child: Icon(Icons.more_horiz, size: 24, color: theme.colorScheme.onSurface),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _resetQuickActionGesture() {
    _isLongPressActive = false;
    _quickActionSwipedUp = false;
    _quickActionOrigin = null;
    _pressedItemId = null;
  }

  Widget _buildGridTile({
    required MobileItem item,
    required int globalIndex,
    required bool useAnimatedGif,
    required bool selected,
    required ThemeData theme,
  }) {
    return GestureDetector(
      onTap: () {
        if (_selectedIds.isNotEmpty) {
          _toggleSelected(item);
        } else if (_isTrashView) {
          // 废纸篓里点击 = 恢复，避免打开详情后再操作
          _restoreItem(item);
        } else {
          _openDetail(globalIndex);
        }
      },
      // 长按（500ms，Flutter 默认长按识别阈值）后手指抬起时才判定动作：
      //   · 长按期间基本未移动 -> 进入多选
      //   · 长按期间上滑超过阈值 -> 打开快速操作
      // 未满 500ms 的滑动只由滚动列表消费，浏览内容时不会误触。
      onLongPressStart: _selectedIds.isNotEmpty || _isTrashView || _isHistoryView
          ? null
          : (details) {
              setState(() {
                _isLongPressActive = true;
                _pressedItemId = item.id;
                _quickActionOrigin = details.localPosition;
                _quickActionSwipedUp = false;
              });
            },
      onLongPressMoveUpdate: _selectedIds.isNotEmpty
          ? null
          : (details) {
              if (!_isLongPressActive) return;
              final origin = _quickActionOrigin;
              if (origin == null) return;
              // 只做记录，不在此触发任何动作（但高亮要实时反映是否已上滑）。
              final swipedUp = details.localPosition.dy - origin.dy < -_quickActionSwipeThreshold;
              if (swipedUp != _quickActionSwipedUp) {
                setState(() => _quickActionSwipedUp = swipedUp);
              }
            },
      onLongPressEnd: _selectedIds.isNotEmpty
          ? null
          : (_) {
              if (!_isLongPressActive) return;
              final swipedUp = _quickActionSwipedUp;
              setState(() => _resetQuickActionGesture());
              if (swipedUp) {
                _openItemPreview(item, globalIndex);
              } else {
                _toggleSelected(item);
              }
            },
      onLongPressCancel: _selectedIds.isNotEmpty
          ? null
          : () => setState(() => _resetQuickActionGesture()),
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
              Hero(
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
                  errorBuilder: (context, error, stackTrace) {
                    return Container(
                      color: theme.colorScheme.surfaceContainerHighest,
                      child: Icon(
                        Icons.broken_image_outlined,
                        color: theme.colorScheme.outline,
                        size: 28,
                      ),
                    );
                  },
                ),
              ),
              if (item.isVideo)
                Positioned(
                  top: 4,
                  right: 4,
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Icon(Icons.play_arrow, color: Colors.white, size: 14),
                  ),
                ),
              if (item.isGif)
                Positioned(
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
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              if (item.isAudio)
                Positioned(
                  top: 4,
                  right: 4,
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Icon(Icons.audiotrack, color: Colors.white, size: 14),
                  ),
                ),
              if (ShareTagService.instance.isMarked(item.id))
                const Positioned(left: 4, bottom: 4, child: ShareTagBadge()),
              if (selected)
                Container(
                  color: Colors.black38,
                  alignment: Alignment.topRight,
                  padding: const EdgeInsets.all(4),
                  child: const Icon(Icons.check_circle, color: Colors.white, size: 20),
                ),
              // 长按高亮：告诉用户当前触摸的是哪个 item，样式与多选态一致。
              if (_pressedItemId == item.id)
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
