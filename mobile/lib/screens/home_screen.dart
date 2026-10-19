import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/item.dart';
import '../services/api_service.dart';
import 'connect_screen.dart';
import 'detail_screen.dart';
import 'search_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final List<MobileItem> _items = [];
  final ScrollController _scrollController = ScrollController();

  bool _isLoading = false;
  bool _hasMore = true;
  int _offset = 0;
  static const int _pageSize = 60;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadItems(refresh: true);
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
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
    if (_isLoading) return;

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

    try {
      final result = await ApiService.instance.getItems(
        limit: _pageSize,
        offset: _offset,
      );

      if (mounted) {
        setState(() {
          if (refresh) {
            _items.clear();
          }
          _items.addAll(result.items);
          _offset += result.items.length;
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
    }
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

  void _openDetail(int globalIndex) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DetailScreen(
          items: _items,
          initialIndex: globalIndex,
        ),
      ),
    );
  }

  Future<void> _disconnect() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Disconnect Server'),
        content: const Text('Disconnect from current Bowerbird desktop server?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Disconnect')),
        ],
      ),
    );

    if (confirm == true) {
      await ApiService.instance.disconnect();
      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const ConnectScreen()),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final grouped = _groupItemsByMonth(_items);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              ApiService.instance.libraryName ?? 'Bowerbird',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
            ),
            Text(
              '${_items.length} items loaded',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            tooltip: 'Search & Filter',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SearchScreen()),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.wifi_off_outlined),
            tooltip: 'Disconnect',
            onPressed: _disconnect,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _loadItems(refresh: true),
        child: _errorMessage != null && _items.isEmpty
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
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
                ? const Center(
                    child: Text('No media assets in library'),
                  )
                : CustomScrollView(
                    controller: _scrollController,
                    physics: const AlwaysScrollableScrollPhysics(),
                    slivers: [
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
                                  Text(
                                    monthName,
                                    style: theme.textTheme.titleMedium?.copyWith(
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: 0.2,
                                    ),
                                  ),
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
                            padding: const EdgeInsets.symmetric(horizontal: 2),
                            sliver: SliverGrid(
                              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 3,
                                crossAxisSpacing: 2,
                                mainAxisSpacing: 2,
                              ),
                              delegate: SliverChildBuilderDelegate(
                                (context, index) {
                                  final item = monthItems[index];
                                  final globalIndex = _items.indexOf(item);

                                  return GestureDetector(
                                    onTap: () => _openDetail(globalIndex),
                                    child: Stack(
                                      fit: StackFit.expand,
                                      children: [
                                        Image.network(
                                          ApiService.instance.getThumbnailUrl(item.id),
                                          fit: BoxFit.cover,
                                          headers: ApiService.instance.authHeaders,
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
                                                        ? progress.cumulativeBytesLoaded /
                                                            progress.expectedTotalBytes!
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
                                        if (item.isVideo)
                                          Positioned(
                                            top: 4,
                                            right: 4,
                                            child: Container(
                                              padding: const EdgeInsets.all(2),
                                              decoration: BoxDecoration(
                                                color: Colors.black54,
                                                borderRadius: BorderRadius.circular(4),
                                              ),
                                              child: const Icon(
                                                Icons.play_arrow,
                                                color: Colors.white,
                                                size: 14,
                                              ),
                                            ),
                                          ),
                                        if (item.isAudio)
                                          Positioned(
                                            top: 4,
                                            right: 4,
                                            child: Container(
                                              padding: const EdgeInsets.all(2),
                                              decoration: BoxDecoration(
                                                color: Colors.black54,
                                                borderRadius: BorderRadius.circular(4),
                                              ),
                                              child: const Icon(
                                                Icons.audiotrack,
                                                color: Colors.white,
                                                size: 14,
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                                  );
                                },
                                childCount: monthItems.length,
                              ),
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

                      const SliverToBoxAdapter(
                        child: SizedBox(height: 32),
                      ),
                    ],
                  ),
      ),
    );
  }
}
