import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/item.dart';
import '../services/api_service.dart';
import '../services/gallery_feed.dart';
import '../services/item_query.dart';
import '../services/refresh_gate.dart';
import '../services/usage_history_service.dart';
import '../widgets/folder_drawer.dart';
import '../services/api_metadata.dart';

/// 主列表的数据与浏览状态（不含任何 UI / BuildContext）。
///
/// 页面只订阅它并渲染；所有网络请求、分页、视图切换都在这里，
/// 这样 `HomeScreen` 可以保持在 400 行以内，也便于单测。
class HomeController extends ChangeNotifier {
  HomeController({this.pageSize = 60});

  final int pageSize;

  final List<MobileItem> items = [];
  final RefreshGate _refreshGate = RefreshGate();

  ItemQuery _query = const ItemQuery();
  SidebarView _view = SidebarView.all;
  String? _activeFolderId;
  LibraryStats _stats = const LibraryStats();
  List<String> _historyIds = const [];
  List<MobileFolder> _folders = const [];
  List<MobileTag> _tags = const [];
  List<String> _colors = const [];

  bool _isLoading = false;
  bool _hasMore = true;
  int _offset = 0;
  bool _pendingRefresh = false;
  String? _errorMessage;
  bool _disposed = false;

  ItemQuery get query => _query;
  SidebarView get view => _view;
  String? get activeFolderId => _activeFolderId;
  LibraryStats get stats => _stats;
  List<String> get historyIds => _historyIds;
  List<MobileFolder> get folders => _folders;
  List<MobileTag> get tags => _tags;
  List<String> get colors => _colors;
  bool get isLoading => _isLoading;
  bool get hasMore => _hasMore;
  String? get errorMessage => _errorMessage;

  bool get isTrashView => _view == SidebarView.trash;
  bool get isHistoryView => _view == SidebarView.history;

  GalleryFeed get _feed => GalleryFeed(
        query: _query,
        isTrash: isTrashView,
        isHistory: isHistoryView,
        historyIds: _historyIds,
        pageSize: pageSize,
      );

  String get emptyMessage {
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

  ItemQuery _baseQuery() => ItemQuery(
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

  // ── 加载 ────────────────────────────────────────────────────────────

  Future<void> loadItems({bool refresh = false}) async {
    if (_isLoading) {
      if (refresh) _pendingRefresh = true;
      return;
    }
    _isLoading = true;
    if (refresh) {
      _offset = 0;
      _hasMore = true;
      _errorMessage = null;
    }
    _notify();

    final requestOffset = refresh ? 0 : _offset;
    try {
      final page = await _feed.fetch(requestOffset, cached: items);
      if (_disposed) return;
      if (refresh) items.clear();
      items.addAll(page.items);
      _offset = requestOffset + page.items.length;
      _hasMore = items.length < page.total && page.items.isNotEmpty;
      _errorMessage = null;
    } catch (e) {
      _errorMessage = e.toString().replaceAll('Exception: ', '');
    }
    _isLoading = false;
    _notify();

    if (_errorMessage == null) unawaited(loadStats());
    if (_pendingRefresh) {
      _pendingRefresh = false;
      unawaited(loadItems(refresh: true));
    }
  }

  /// ws 刷新：按已加载窗口大小重取，保持滚动深度。
  Future<void> reloadWindow() async {
    if (_isLoading) {
      _pendingRefresh = true;
      return;
    }
    final target = items.isEmpty ? pageSize : (items.length > 500 ? pageSize : items.length);
    _isLoading = true;
    _errorMessage = null;
    _notify();
    try {
      final page = await _feed.fetchWindow(target);
      if (_disposed) return;
      items
        ..clear()
        ..addAll(page.items);
      _offset = page.items.length;
      _hasMore = items.length < page.total && page.items.isNotEmpty;
    } catch (e) {
      _errorMessage = e.toString().replaceAll('Exception: ', '');
    }
    _isLoading = false;
    _notify();

    if (_pendingRefresh) {
      _pendingRefresh = false;
      unawaited(reloadWindow());
    }
  }

  Future<void> loadStats() async {
    try {
      final value = await ApiService.instance.getStats();
      if (_disposed) return;
      _stats = value;
      _notify();
    } catch (_) {}
  }

  Future<void> loadHistory() async {
    final ids = await UsageHistoryService.instance.ids();
    if (_disposed) return;
    _historyIds = ids;
    _notify();
  }

  Future<void> loadNavMetadata() async {
    try {
      final results = await Future.wait([
        ApiService.instance.getTags(),
        ApiService.instance.getFolders(),
        ApiService.instance.getColors(),
      ]);
      if (_disposed) return;
      _tags = results[0] as List<MobileTag>;
      _folders = results[1] as List<MobileFolder>;
      _colors = results[2] as List<String>;
      _notify();
    } catch (_) {}
  }

  void cancelPendingRefresh() => _refreshGate.cancel();

  Future<void> refreshAll() async {
    await Future.wait([
      loadItems(refresh: true),
      loadNavMetadata(),
      loadStats(),
      loadHistory(),
    ]);
  }

  // ── 视图选择 ────────────────────────────────────────────────────────

  void selectCollection(SidebarView next) {
    if (next == _view && next != SidebarView.folder) return;
    _view = next;
    _activeFolderId = null;
    _query = _baseQuery();
    _notify();
    unawaited(loadItems(refresh: true));
  }

  void selectFolder(String? folderId) {
    _view = SidebarView.folder;
    _activeFolderId = folderId;
    _query = _baseQuery();
    _notify();
    unawaited(loadItems(refresh: true));
  }

  /// 应用筛选条件：只覆盖筛选本身，集合/文件夹仍由当前视图决定。
  void applyFilter(ItemQuery filter) {
    _query = ItemQuery(
      text: filter.text,
      type: filter.type,
      orientation: filter.orientation,
      tag: filter.tag,
      folder: _view == SidebarView.folder ? _activeFolderId : null,
      color: filter.color,
      size: filter.size,
      rating: filter.rating,
      hasUrl: filter.hasUrl,
      hasNote: filter.hasNote,
      untagged: _view == SidebarView.untagged,
      uncategorized: _view == SidebarView.uncategorized,
    );
    _notify();
    unawaited(loadItems(refresh: true));
  }

  bool get filterActive => _query.toQueryString().isNotEmpty;

  /// 从废纸篓恢复后立刻从本地列表移除，避免等待整页刷新。
  void removeLocal(String itemId) {
    items.removeWhere((it) => it.id == itemId);
    _notify();
  }

  int get loadedCount => items.length;

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _refreshGate.cancel();
    super.dispose();
  }
}
