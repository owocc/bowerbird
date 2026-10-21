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
import 'connect_screen.dart';
import '../services/inbox_service.dart';
import '../services/share_tag_service.dart';
import '../widgets/share_tag_badge.dart';
import 'detail_screen.dart';
import 'inbox_screen.dart';
import '../widgets/item_preview_overlay.dart';
import 'search_screen.dart';
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
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
  int _inboxCount = InboxService.instance.count;

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
    _loadItems(refresh: true);
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
        _loadItems(refresh: true);
      }
    });
    _wsItemsSub = WebSocketService.instance.onItemsUpdated.listen((event) {
      if (mounted) {
        _loadItems(refresh: true);
      }
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
    WidgetsBinding.instance.removeObserver(this);
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
    } finally {
      if (mounted && _pendingRefresh) {
        _pendingRefresh = false;
        _loadItems(refresh: true);
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

  Future<void> _openDetail(int globalIndex) async {
    final deleted = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => DetailScreen(
          items: _items,
          initialIndex: globalIndex,
        ),
      ),
    );
    if (deleted == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('已移入废纸篓')),
      );
      _loadItems(refresh: true);
    }
  }

  Future<void> _openItemPreview(MobileItem item, int globalIndex) async {
    final action = await showItemPreviewOverlay(context, item);
    if (!mounted || action == null) return;

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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已移入废纸篓')),
        );
        await _loadItems(refresh: true);
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
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Disconnect')),
          ],
        ),
      );
      if (confirm != true) return;
    }

    WebSocketService.instance.disconnect();
    await ApiService.instance.disconnect();
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const ConnectScreen()),
      );
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
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
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
                              ? Icon(Icons.check_circle, color: Theme.of(context).colorScheme.primary)
                              : null,
                          onTap: () async {
                            Navigator.pop(ctx);
                            if (!lib.isActive) {
                              try {
                                await ApiService.instance.switchLibrary(lib.path);
                                if (mounted) {
                                  setState(() => ApiService.instance.libraryName = lib.name);
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('已切换至资源库: ${lib.name}')),
                                  );
                                  _loadItems(refresh: true);
                                }
                              } catch (e) {
                                if (mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('切库失败: $e'), backgroundColor: Colors.red.shade700),
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
              Expanded(
                child: Text('正在上传 ${paths.length} 个素材到当前资源库...'),
              ),
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('成功上传 $count 个素材到当前资源库')),
        );
        _loadItems(refresh: true);
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
      final response = await http.get(
        Uri.parse(originalUrl),
        headers: ApiService.instance.authHeaders,
      ).timeout(const Duration(seconds: 30));

      if (response.statusCode != 200) {
        throw Exception('HTTP ${response.statusCode}');
      }

      final filename = item.filename.isNotEmpty ? item.filename : '${item.id}.${item.extension}';
      await ApiService.instance.saveMediaToGallery(response.bodyBytes, filename, item.mimeType);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已保存至手机相册/下载目录: $filename')),
        );
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已复制素材内容，可粘贴到微信等应用')),
        );
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
      final response = await http.get(
        Uri.parse(originalUrl),
        headers: ApiService.instance.authHeaders,
      ).timeout(const Duration(seconds: 30));

      if (response.statusCode != 200) {
        throw Exception('HTTP ${response.statusCode}');
      }

      final tempDir = await getTemporaryDirectory();
      final filename = item.filename.isNotEmpty ? item.filename : '${item.id}.${item.extension}';
      final file = File('${tempDir.path}/$filename');
      await file.writeAsBytes(response.bodyBytes);

      if (mounted) {
        final xFile = XFile(file.path, mimeType: item.mimeType);
        await Share.shareXFiles([xFile], text: item.name.isNotEmpty ? item.name : item.filename);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('分享失败: $e'), backgroundColor: Colors.red.shade700),
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
        title: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: _showLibraryPicker,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text(
                              ApiService.instance.libraryName ?? 'Bowerbird',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 4),
                          const Icon(Icons.arrow_drop_down, size: 20),
                        ],
                      ),
                      Text(
                        '${_items.length} 个素材 • 点击切库',
                        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          Badge.count(
            count: _inboxCount,
            isLabelVisible: _inboxCount > 0,
            child: IconButton(
              icon: const Icon(Icons.inbox_outlined),
              tooltip: '收件箱',
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const InboxScreen()),
                );
              },
            ),
          ),
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
                                  final useAnimatedGif = item.isGif && item.size <= _gifAnimationMaxBytes;

                                  return GestureDetector(
                                    onTap: () => _openDetail(globalIndex),
                                    onLongPress: () => _openItemPreview(item, globalIndex),
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
                                        if (item.isGif)
                                          Positioned(
                                            top: 4,
                                            left: 4,
                                            child: Container(
                                              padding: const EdgeInsets.symmetric(
                                                horizontal: 4,
                                                vertical: 1,
                                              ),
                                              decoration: BoxDecoration(
                                                color: Colors.black54,
                                                borderRadius: BorderRadius.circular(4),
                                              ),
                                              child: const Text(
                                                'GIF',
                                                style: TextStyle(
                                                  color: Colors.white,
                                                  fontSize: 9,
                                                  fontWeight: FontWeight.bold,
                                                ),
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
                                        if (ShareTagService.instance.isMarked(item.id))
                                          const Positioned(
                                            left: 4,
                                            bottom: 4,
                                            child: ShareTagBadge(),
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
      floatingActionButton: FloatingActionButton(
        heroTag: 'upload_fab',
        tooltip: '上传素材到电脑',
        onPressed: _isUploading ? null : _handleUpload,
        child: const Icon(Icons.add_photo_alternate_rounded),
      ),
    );
  }
}
