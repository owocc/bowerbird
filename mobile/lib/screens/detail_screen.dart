import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:photo_view/photo_view.dart';
import 'package:share_plus/share_plus.dart';
import '../models/item.dart';
import '../services/api_service.dart';
import '../services/share_tag_service.dart';
import '../widgets/share_tag_badge.dart';
import '../widgets/video_player_page.dart';

class DetailScreen extends StatefulWidget {
  final List<MobileItem> items;
  final int initialIndex;

  const DetailScreen({
    super.key,
    required this.items,
    required this.initialIndex,
  });

  @override
  State<DetailScreen> createState() => _DetailScreenState();
}

class _DetailScreenState extends State<DetailScreen> {
  late final List<MobileItem> _items;
  late PageController _pageController;
  late int _currentIndex;
  bool _showOverlays = true;
  ItemDetail? _currentDetail;
  bool _isSharing = false;
  bool _isDownloading = false;
  bool _isCopying = false;
  bool _isDeleting = false;
  double? _copyProgress;
  double _actionPull = 0;
  bool _actionPulling = false;

  @override
  void initState() {
    super.initState();
    // Snapshot the list: the home screen clears and refills its own list on
    // refresh, which would otherwise mutate the pages under this screen.
    _items = List<MobileItem>.of(widget.items);
    _currentIndex = widget.initialIndex.clamp(0, _items.length - 1);
    _pageController = PageController(initialPage: _currentIndex);
    _loadCurrentDetail();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  MobileItem get _currentItem => _items[_currentIndex];

  Future<void> _loadCurrentDetail() async {
    final item = _currentItem;
    try {
      final detail = await ApiService.instance.getItemDetail(item.id);
      if (mounted && _currentItem.id == item.id) {
        setState(() => _currentDetail = detail);
      }
    } catch (_) {
      // Non-critical, fallback to item summary
    }
  }

  void _onPageChanged(int index) {
    setState(() {
      _currentIndex = index;
      _currentDetail = null;
    });
    _loadCurrentDetail();
  }

  void _toggleOverlays() {
    setState(() {
      _showOverlays = !_showOverlays;
    });
  }

  void _showSnack(BuildContext context, String message, {bool error = false}) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(message),
        duration: Duration(seconds: error ? 3 : 1),
        backgroundColor: error ? Colors.red.shade700 : null,
      ),
    );
  }

  Future<void> _shareCurrentItem() async {
    if (_isSharing) return;
    setState(() => _isSharing = true);

    final item = _currentItem;
    try {
      final originalUrl = ApiService.instance.getOriginalUrl(item.id);
      final response = await http.get(
        Uri.parse(originalUrl),
        headers: ApiService.instance.authHeaders,
      ).timeout(const Duration(seconds: 30));

      if (response.statusCode != 200) {
        throw Exception('Failed to download image: HTTP ${response.statusCode}');
      }

      final tempDir = await getTemporaryDirectory();
      final shareFolder = Directory('${tempDir.path}/share');
      if (!await shareFolder.exists()) {
        await shareFolder.create(recursive: true);
      }

      final filename = item.filename.isNotEmpty ? item.filename : 'item_${item.id}.${item.extension}';
      final file = File('${shareFolder.path}/$filename');
      await file.writeAsBytes(response.bodyBytes);

      if (mounted) {
        final xFile = XFile(file.path, mimeType: item.mimeType);
        await Share.shareXFiles([xFile], text: item.name.isNotEmpty ? item.name : item.filename);
      }
    } catch (e) {
      if (mounted) {
        _showSnack(
          context,
          'Share failed: ${e.toString().replaceAll('Exception: ', '')}',
          error: true,
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSharing = false);
      }
    }
  }

  Future<void> _downloadCurrentItem() async {
    if (_isDownloading) return;
    setState(() => _isDownloading = true);

    final item = _currentItem;
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
        _showSnack(context, '已保存至手机相册/下载目录: $filename');
      }
    } catch (e) {
      if (mounted) {
        _showSnack(
          context,
          '下载失败: ${e.toString().replaceAll('Exception: ', '')}',
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _isDownloading = false);
    }
  }

  Future<void> _copyCurrentContent() async {
    if (_isCopying) return;
    final item = _currentItem;
    if (item.size > ApiService.maxClipboardFileBytes) {
      _showSnack(context, '文件过大（${item.formattedSize}），请使用分享或下载', error: true);
      return;
    }

    setState(() {
      _isCopying = true;
      _copyProgress = 0;
    });
    try {
      await ApiService.instance.copyItemContent(
        item,
        onProgress: (received, total) {
          if (!mounted || total <= 0) return;
          final progress = (received / total).clamp(0.0, 1.0);
          // Throttle rebuilds to whole percent steps.
          if (_copyProgress == null || (progress - _copyProgress!) >= 0.01) {
            setState(() => _copyProgress = progress);
          }
        },
      );
      if (mounted) {
        _showSnack(context, '已复制素材内容，可粘贴到微信等应用');
      }
    } catch (e) {
      if (mounted) {
        _showSnack(
          context,
          '复制失败: ${e.toString().replaceAll('Exception: ', '')}',
          error: true,
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isCopying = false;
          _copyProgress = null;
        });
      }
    }
  }

  void _copyCurrentInfo() {
    final item = _currentItem;
    final detail = _currentDetail;
    final info = [
      '名称: ${item.name.isNotEmpty ? item.name : item.filename}',
      '文件名: ${item.filename}',
      if (detail != null && detail.url.isNotEmpty) '来源链接: ${detail.url}',
      '尺寸: ${item.width} x ${item.height}',
      '大小: ${item.formattedSize}',
      '格式: ${item.extension.toUpperCase()}',
      if (item.tags.isNotEmpty) '标签: ${item.tags.join(", ")}',
      if (detail != null && detail.note.isNotEmpty) '备注: ${detail.note}',
    ].join('\n');

    Clipboard.setData(ClipboardData(text: info));
    _showSnack(context, '素材关键信息已复制到剪贴板');
  }

  Future<void> _confirmDeleteCurrentItem() async {
    if (_isDeleting) return;
    final item = _currentItem;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('删除素材'),
        content: const Text('该素材将移入桌面端废纸篓，可在桌面端废纸篓中找回。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('取消'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _isDeleting = true);
    try {
      await ApiService.instance.deleteItem(item.id);
      await ShareTagService.instance.forget(item.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        _showSnack(
          context,
          e.toString().replaceAll('Exception: ', ''),
          error: true,
        );
        setState(() => _isDeleting = false);
      }
    }
  }

  void _onActionPullUpdate(DragUpdateDetails details) {
    final next = _actionPull - details.delta.dy;
    setState(() {
      _actionPulling = true;
      _actionPull = next.clamp(0.0, 280.0);
    });
  }

  void _onActionPullEnd(DragEndDetails details) {
    final velocity = details.primaryVelocity ?? 0;
    final shouldOpen = _actionPull > 96 || velocity < -700;
    setState(() {
      _actionPulling = false;
      _actionPull = 0;
    });
    if (shouldOpen) {
      _showFullMetadataSheet(_currentItem);
    }
  }

  void _showFullMetadataSheet(MobileItem item) {
    final detail = _currentDetail;
    final dateStr = DateFormat('yyyy-MM-dd HH:mm:ss').format(item.dateTime);
    final theme = Theme.of(context);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: theme.colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return DraggableScrollableSheet(
          initialChildSize: 0.6,
          minChildSize: 0.35,
          maxChildSize: 0.9,
          expand: false,
          builder: (context, scrollController) {
            return SingleChildScrollView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.outline.withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  Text(
                    item.filename,
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      FilledButton.tonalIcon(
                        onPressed: () {
                          Navigator.pop(sheetContext);
                          _copyCurrentContent();
                        },
                        icon: const Icon(Icons.copy_rounded, size: 18),
                        label: const Text('复制图片'),
                      ),
                      FilledButton.tonalIcon(
                        onPressed: () {
                          Navigator.pop(sheetContext);
                          _downloadCurrentItem();
                        },
                        icon: const Icon(Icons.download_rounded, size: 18),
                        label: const Text('下载'),
                      ),
                      FilledButton.tonalIcon(
                        onPressed: () {
                          Navigator.pop(sheetContext);
                          _shareCurrentItem();
                        },
                        icon: const Icon(Icons.share_rounded, size: 18),
                        label: const Text('分享'),
                      ),
                      FilledButton.tonalIcon(
                        onPressed: () {
                          Navigator.pop(sheetContext);
                          _confirmDeleteCurrentItem();
                        },
                        icon: Icon(Icons.delete_outline, size: 18, color: theme.colorScheme.error),
                        label: Text('删除', style: TextStyle(color: theme.colorScheme.error)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Divider(),
                  _buildMetaRow(Icons.title_outlined, 'Title', item.name.isNotEmpty ? item.name : item.filename),
                  if (ShareTagService.instance.isMarked(item.id))
                    _buildMetaRow(Icons.ios_share, '来源', '手机分享'),
                  _buildMetaRow(Icons.insert_drive_file_outlined, 'Filename', item.filename),
                  _buildMetaRow(Icons.calendar_today_outlined, 'Captured / Imported', dateStr),
                  _buildMetaRow(
                    Icons.aspect_ratio_outlined,
                    'Dimensions',
                    '${item.width} × ${item.height} (${item.orientation})',
                    copyValue: '${item.width} × ${item.height}',
                  ),
                  _buildMetaRow(Icons.data_usage_outlined, 'File Size', item.formattedSize),
                  _buildMetaRow(
                    Icons.description_outlined,
                    'Format',
                    item.extension.toUpperCase(),
                  ),
                  _buildMetaRow(Icons.category_outlined, 'MIME Type', item.mimeType),
                  if (detail != null && detail.filePath.isNotEmpty)
                    _buildMetaRow(Icons.folder_open_outlined, 'File Path', detail.filePath),
                  if (detail != null && detail.note.isNotEmpty)
                    _buildMetaRow(Icons.notes_outlined, 'Note', detail.note),
                  if (detail != null && detail.url.isNotEmpty)
                    _buildMetaRow(Icons.link_outlined, 'Source URL', detail.url),
                  if (detail != null && detail.prompt.isNotEmpty)
                    _buildMetaRow(Icons.psychology_outlined, 'Prompt', detail.prompt),
                  if (detail?.meta != null) ...[
                    if (detail!.meta!['colorModel'] != null)
                      _buildMetaRow(Icons.color_lens_outlined, 'Color Model', detail.meta!['colorModel'].toString()),
                    if (detail.meta!['colorSpace'] != null)
                      _buildMetaRow(Icons.tonality_outlined, 'Color Space', detail.meta!['colorSpace'].toString()),
                    if (detail.meta!['megapixels'] != null)
                      _buildMetaRow(Icons.photo_size_select_actual_outlined, 'Megapixels', detail.meta!['megapixels'].toString()),
                    if (detail.meta!['exifMake'] != null || detail.meta!['exifModel'] != null)
                      _buildMetaRow(
                        Icons.camera_alt_outlined,
                        'Camera',
                        '${detail.meta!['exifMake'] ?? ''} ${detail.meta!['exifModel'] ?? ''}'.trim(),
                      ),
                  ],
                  if (detail != null && detail.dominantColor != null && detail.dominantColor!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        children: [
                          const Icon(Icons.palette_outlined, size: 20),
                          const SizedBox(width: 12),
                          const Text('Dominant Color: ', style: TextStyle(fontWeight: FontWeight.w600)),
                          Container(
                            width: 18,
                            height: 18,
                            decoration: BoxDecoration(
                              color: _parseColor(detail.dominantColor!),
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white30),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              detail.dominantColor!.toUpperCase(),
                              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                            ),
                          ),
                          _buildCopyButton('Dominant Color', detail.dominantColor!.toUpperCase()),
                        ],
                      ),
                    ),
                  if (detail != null && detail.palette.isNotEmpty) ...[
                    _buildGroupHeader('Color Palette', detail.palette.join(', '), theme),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: detail.palette.map((hex) {
                        final c = _parseColor(hex);
                        return Tooltip(
                          message: hex.toUpperCase(),
                          child: Container(
                            width: 32,
                            height: 24,
                            decoration: BoxDecoration(
                              color: c,
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: Colors.white24),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                  if (item.folders.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _buildGroupHeader('Folders', item.folders.join(', '), theme),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: item.folders.map((f) => Chip(
                        avatar: const Icon(Icons.folder_outlined, size: 16),
                        label: Text(f),
                      )).toList(),
                    ),
                  ],
                  if (item.tags.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _buildGroupHeader('Tags', item.tags.join(', '), theme),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: item.tags.map((t) => Chip(
                        avatar: const Icon(Icons.tag, size: 16),
                        label: Text(t),
                      )).toList(),
                    ),
                  ],
                  const SizedBox(height: 24),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Color _parseColor(String hex) {
    var c = hex.replaceAll('#', '');
    if (c.length == 6) c = 'FF$c';
    return Color(int.tryParse(c, radix: 16) ?? 0xFF888888);
  }

  Widget _buildMetaRow(
    IconData icon,
    String label,
    String value, {
    String? copyValue,
  }) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: theme.colorScheme.outline),
          const SizedBox(width: 12),
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text('$label: ', style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(value),
            ),
          ),
          if (value.isNotEmpty)
            _buildCopyButton(label, copyValue ?? value),
        ],
      ),
    );
  }

  Widget _buildGroupHeader(String title, String copyValue, ThemeData theme) {
    return Row(
      children: [
        Text(title, style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold)),
        const Spacer(),
        _buildCopyButton(title, copyValue, size: 16),
      ],
    );
  }

  Widget _buildCopyButton(String label, String value, {double size = 18}) {
    return IconButton(
      icon: Icon(Icons.copy_rounded, size: size),
      tooltip: '复制$label',
      visualDensity: VisualDensity.compact,
      onPressed: value.isEmpty ? null : () => _copyField(label, value),
    );
  }

  Future<void> _copyField(String label, String value) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    _showCopyToast('已复制$label');
  }

  void _showCopyToast(String message) {
    final overlay = Overlay.of(context, rootOverlay: true);
    final entry = OverlayEntry(
      builder: (_) => Positioned(
        bottom: MediaQuery.of(context).size.height * 0.5,
        left: 0,
        right: 0,
        child: IgnorePointer(
          child: Center(
            child: Material(
              color: Colors.black87,
              borderRadius: BorderRadius.circular(20),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(message, style: const TextStyle(color: Colors.white, fontSize: 13)),
              ),
            ),
          ),
        ),
      ),
    );
    overlay.insert(entry);
    Future.delayed(const Duration(milliseconds: 1200), () {
      if (entry.mounted) entry.remove();
    });
  }

  Widget _buildPage(MobileItem item, int index) {
    if (item.isVideo) {
      return VideoPlayerPage(
        key: ValueKey('video-${item.id}'),
        item: item,
        isActive: index == _currentIndex,
        showControls: _showOverlays,
        onTap: _toggleOverlays,
      );
    }
    if (item.isGif) {
      return _AnimatedImagePage(
        key: ValueKey('gif-${item.id}'),
        item: item,
        onTap: _toggleOverlays,
      );
    }
    return GestureDetector(
      onTap: _toggleOverlays,
      child: PhotoView(
        imageProvider: NetworkImage(
          ApiService.instance.getOriginalUrl(item.id),
          headers: ApiService.instance.mediaHeaders,
        ),
        initialScale: PhotoViewComputedScale.contained,
        minScale: PhotoViewComputedScale.contained * 0.8,
        maxScale: PhotoViewComputedScale.covered * 3.5,
        heroAttributes: PhotoViewHeroAttributes(tag: item.id),
        errorBuilder: (context, error, stackTrace) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.broken_image, size: 64, color: Colors.white54),
                const SizedBox(height: 12),
                Text(item.filename, style: const TextStyle(color: Colors.white70)),
              ],
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentItem = _currentItem;
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          GestureDetector(
            onVerticalDragUpdate: _onActionPullUpdate,
            onVerticalDragEnd: _onActionPullEnd,
            child: PageView.builder(
              controller: _pageController,
              itemCount: _items.length,
              onPageChanged: _onPageChanged,
              itemBuilder: (context, index) {
                final item = _items[index];
                return _buildPage(item, index);
              },
            ),
          ),

          // Top Overlay Bar
          if (_showOverlays)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                padding: EdgeInsets.only(
                  top: MediaQuery.of(context).padding.top + 8,
                  bottom: 12,
                  left: 8,
                  right: 8,
                ),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Colors.black87, Colors.transparent],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back, color: Colors.white),
                      onPressed: () => Navigator.pop(context),
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        '${_currentIndex + 1} / ${_items.length}',
                        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w500),
                      ),
                    ),
                    if (_isCopying)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                                value: _copyProgress,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              _copyProgress == null ? '' : '${(_copyProgress! * 100).round()}%',
                              style: const TextStyle(color: Colors.white, fontSize: 11),
                            ),
                          ],
                        ),
                      )
                    else
                      IconButton(
                        icon: const Icon(Icons.content_copy, color: Colors.white),
                        tooltip: '复制素材内容',
                        onPressed: _copyCurrentContent,
                      ),
                    if (_isDownloading)
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 10),
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        ),
                      )
                    else
                      IconButton(
                        icon: const Icon(Icons.download_rounded, color: Colors.white),
                        tooltip: '下载原图',
                        onPressed: _downloadCurrentItem,
                      ),
                    if (_isSharing)
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 10),
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        ),
                      )
                    else
                      IconButton(
                        icon: const Icon(Icons.share, color: Colors.white),
                        tooltip: 'Share',
                        onPressed: _shareCurrentItem,
                      ),
                    PopupMenuButton<String>(
                      icon: _isDeleting
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                            )
                          : const Icon(Icons.more_vert, color: Colors.white),
                      enabled: !_isDeleting,
                      tooltip: '更多',
                      color: theme.colorScheme.surface,
                      onSelected: (value) {
                        switch (value) {
                          case 'copy_text':
                            _copyCurrentInfo();
                          case 'details':
                            _showFullMetadataSheet(currentItem);
                          case 'delete':
                            _confirmDeleteCurrentItem();
                        }
                      },
                      itemBuilder: (context) => [
                        const PopupMenuItem(
                          value: 'copy_text',
                          child: ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(Icons.text_fields),
                            title: Text('复制信息文本'),
                          ),
                        ),
                        const PopupMenuItem(
                          value: 'details',
                          child: ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(Icons.info_outline),
                            title: Text('查看详情'),
                          ),
                        ),
                        PopupMenuItem(
                          value: 'delete',
                          child: ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(Icons.delete_outline, color: theme.colorScheme.error),
                            title: Text('删除素材', style: TextStyle(color: theme.colorScheme.error)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: IgnorePointer(
              ignoring: _actionPull <= 0,
              child: AnimatedContainer(
                duration: _actionPulling ? Duration.zero : const Duration(milliseconds: 180),
                height: _actionPull,
                curve: Curves.easeOutCubic,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.72),
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                  ),
                  alignment: Alignment.topCenter,
                  padding: const EdgeInsets.only(top: 10),
                  child: Column(
                    children: [
                      Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.white38,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (_actionPull > 56)
                        TextButton.icon(
                          onPressed: () => _showFullMetadataSheet(currentItem),
                          icon: const Icon(Icons.info_outline, color: Colors.white),
                          label: const Text('查看详情', style: TextStyle(color: Colors.white)),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // Bottom Metadata Bar
          if (_showOverlays)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: GestureDetector(
                onTap: () => _showFullMetadataSheet(currentItem),
                onVerticalDragUpdate: _onActionPullUpdate,
                onVerticalDragEnd: _onActionPullEnd,
                child: Container(
                  padding: EdgeInsets.only(
                    top: 16,
                    bottom: MediaQuery.of(context).padding.bottom + 16,
                    left: 20,
                    right: 20,
                  ),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Colors.transparent, Colors.black87],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        currentItem.filename,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${currentItem.width} × ${currentItem.height} • ${currentItem.formattedSize} • ${DateFormat('yyyy-MM-dd').format(currentItem.dateTime)}',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.8),
                          fontSize: 13,
                        ),
                      ),
                      if (ShareTagService.instance.isMarked(currentItem.id)) ...[
                        const SizedBox(height: 8),
                        const ShareTagBadge(
                          label: '手机分享',
                          fontSize: 11,
                          iconSize: 12,
                          background: Colors.white24,
                        ),
                      ],
                      if (currentItem.tags.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 4,
                          children: currentItem.tags.take(4).map((t) {
                            return Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.white24,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                t,
                                style: const TextStyle(color: Colors.white, fontSize: 11),
                              ),
                            );
                          }).toList(),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Renders animated images (GIF/WebP) with the native [Image] widget.
///
/// PhotoView is bypassed here: its frame tracking does not reliably drive
/// multi-frame images, which left GIFs stuck on the first frame.
class _AnimatedImagePage extends StatelessWidget {
  const _AnimatedImagePage({super.key, required this.item, this.onTap});

  final MobileItem item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: InteractiveViewer(
        minScale: 0.8,
        maxScale: 4.0,
        child: Center(
          child: Image.network(
            ApiService.instance.getOriginalUrl(item.id),
            headers: ApiService.instance.mediaHeaders,
            fit: BoxFit.contain,
            gaplessPlayback: true,
            loadingBuilder: (context, child, progress) {
              if (progress == null) return child;
              return Center(
                child: CircularProgressIndicator(
                  color: Colors.white,
                  value: progress.expectedTotalBytes != null
                      ? progress.cumulativeBytesLoaded / progress.expectedTotalBytes!
                      : null,
                ),
              );
            },
            errorBuilder: (context, error, stackTrace) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.broken_image, size: 64, color: Colors.white54),
                    const SizedBox(height: 12),
                    Text(item.filename, style: const TextStyle(color: Colors.white70)),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
