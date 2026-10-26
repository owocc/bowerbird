import 'dart:async';

import 'package:flutter/material.dart';

import '../models/item.dart';
import '../services/api_items.dart';
import '../services/api_metadata.dart';
import '../services/api_service.dart';
import '../services/item_query.dart';
import '../services/websocket_service.dart';
import 'detail_screen.dart';
import 'search/widgets/search_filters.dart';
import 'search/widgets/search_results.dart';

/// 搜索页：查询输入 + 多维筛选 + 结果网格。
///
/// 筛选区与结果区分别在 `search/widgets/` 下，本文件只负责状态与请求。
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  static const int _pageSize = 60;

  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  final List<MobileItem> _results = [];

  bool _isLoading = false;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  int _totalCount = 0;
  int _requestId = 0;
  String? _errorMessage;

  String _selectedType = '';
  String _selectedOrientation = '';
  String _selectedSize = '';
  int? _selectedRating;
  String _urlPresence = '';
  String _notePresence = '';
  String? _selectedColor;
  String? _selectedFolderId;
  String? _selectedTag;

  List<MobileTag> _availableTags = const [];
  List<MobileFolder> _availableFolders = const [];
  List<String> _availableColors = const [];

  StreamSubscription<Map<String, dynamic>>? _wsItemsSub;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _loadMetadata();
    unawaited(_performSearch());
    _wsItemsSub = WebSocketService.instance.onItemsUpdated.listen((_) {
      if (mounted) unawaited(_reloadWindow());
    });
  }

  @override
  void dispose() {
    _wsItemsSub?.cancel();
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 300) {
      unawaited(_performSearch(reset: false));
    }
  }

  ItemQuery _currentQuery() => ItemQuery(
        text: _searchController.text,
        type: _selectedType,
        orientation: _selectedOrientation,
        tag: _selectedTag,
        folder: _selectedFolderId,
        color: _selectedColor,
        size: _selectedSize,
        rating: _selectedRating,
        hasUrl: _urlPresence,
        hasNote: _notePresence,
      );

  Future<void> _performSearch({bool reset = true}) async {
    if (!reset && (!_hasMore || _isLoading || _isLoadingMore)) return;
    final requestId = ++_requestId;
    setState(() {
      if (reset) {
        _isLoading = true;
      } else {
        _isLoadingMore = true;
      }
      _errorMessage = null;
    });

    try {
      final res = await ApiService.instance.queryItems(
        query: _currentQuery(),
        offset: reset ? 0 : _results.length,
        limit: _pageSize,
      );
      if (!mounted || requestId != _requestId) return;
      setState(() {
        if (reset) _results.clear();
        _results.addAll(res.items);
        _totalCount = res.total;
        _hasMore = _results.length < res.total && res.items.isNotEmpty;
        _isLoading = false;
        _isLoadingMore = false;
      });
    } catch (e) {
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _isLoading = false;
        _isLoadingMore = false;
        _errorMessage = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  /// 远端变更后按已加载窗口重跑，尽量保持用户在结果里的位置。
  Future<void> _reloadWindow() async {
    if (_isLoading || _isLoadingMore) return;
    if (_results.isEmpty) {
      await _performSearch();
      return;
    }
    final target = _results.length > 500 ? _pageSize : _results.length;
    final requestId = ++_requestId;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final res = await ApiService.instance.queryItems(
        query: _currentQuery(),
        offset: 0,
        limit: target,
      );
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _results
          ..clear()
          ..addAll(res.items);
        _totalCount = res.total;
        _hasMore = _results.length < res.total && res.items.isNotEmpty;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _isLoading = false;
        _errorMessage = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  Future<void> _loadMetadata() async {
    try {
      final results = await Future.wait([
        ApiService.instance.getTags(),
        ApiService.instance.getFolders(),
        ApiService.instance.getColors(),
      ]);
      if (!mounted) return;
      setState(() {
        _availableTags = results[0] as List<MobileTag>;
        _availableFolders = results[1] as List<MobileFolder>;
        _availableColors = results[2] as List<String>;
      });
    } catch (_) {}
  }

  void _clearAllFilters() {
    setState(() {
      _searchController.clear();
      _selectedType = '';
      _selectedOrientation = '';
      _selectedSize = '';
      _selectedRating = null;
      _urlPresence = '';
      _notePresence = '';
      _selectedTag = null;
      _selectedFolderId = null;
      _selectedColor = null;
    });
    unawaited(_performSearch());
  }

  bool get _hasActiveFilters =>
      _searchController.text.isNotEmpty ||
      _selectedType.isNotEmpty ||
      _selectedOrientation.isNotEmpty ||
      _selectedSize.isNotEmpty ||
      _selectedRating != null ||
      _urlPresence.isNotEmpty ||
      _notePresence.isNotEmpty ||
      _selectedTag != null ||
      _selectedFolderId != null ||
      _selectedColor != null;

  Future<void> _openItem(int index) async {
    final deleted = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => DetailScreen(items: _results, initialIndex: index),
      ),
    );
    if (deleted != true || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已移入废纸篓')));
    unawaited(_performSearch());
  }

  /// 统一处理筛选变化：更新状态后立即重查。
  void _apply(VoidCallback change) {
    setState(change);
    unawaited(_performSearch());
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: _buildSearchField(),
        actions: [
          if (_hasActiveFilters)
            IconButton(
              icon: const Icon(Icons.filter_alt_off),
              tooltip: 'Reset Filters',
              onPressed: _clearAllFilters,
            ),
          IconButton(icon: const Icon(Icons.search), onPressed: _performSearch),
        ],
      ),
      body: Column(
        children: [
          SearchFilters(
            type: _selectedType,
            orientation: _selectedOrientation,
            size: _selectedSize,
            rating: _selectedRating,
            urlPresence: _urlPresence,
            notePresence: _notePresence,
            color: _selectedColor,
            folderId: _selectedFolderId,
            tag: _selectedTag,
            colors: _availableColors,
            folders: _availableFolders,
            tags: _availableTags,
            onTypeChanged: (v) => _apply(() => _selectedType = v),
            onOrientationChanged: (v) => _apply(() => _selectedOrientation = v),
            onSizeChanged: (v) => _apply(() => _selectedSize = v),
            onRatingChanged: (v) => _apply(() => _selectedRating = v),
            onUrlPresenceChanged: (v) => _apply(() => _urlPresence = v),
            onNotePresenceChanged: (v) => _apply(() => _notePresence = v),
            onColorChanged: (v) => _apply(() => _selectedColor = v),
            onFolderChanged: (v) => _apply(() => _selectedFolderId = v),
            onTagChanged: (v) => _apply(() => _selectedTag = v),
          ),
          if (!_isLoading)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              alignment: Alignment.centerLeft,
              child: Text(
                '共 $_totalCount 个结果 · 已加载 ${_results.length}'
                '${_isLoadingMore ? " · 加载中…" : ""}',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          Expanded(
            child: SearchResults(
              results: _results,
              isLoading: _isLoading,
              errorMessage: _errorMessage,
              scrollController: _scrollController,
              onRetry: () => unawaited(_performSearch()),
              onOpenItem: (index) => unawaited(_openItem(index)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchField() {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: TextField(
        controller: _searchController,
        textInputAction: TextInputAction.search,
        onSubmitted: (_) => _performSearch(),
        decoration: InputDecoration(
          hintText: '搜索素材、标签、备注',
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          suffixIcon: _searchController.text.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear, size: 18),
                  onPressed: () {
                    _searchController.clear();
                    unawaited(_performSearch());
                  },
                )
              : null,
        ),
      ),
    );
  }
}
