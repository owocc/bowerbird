import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:photo_view/photo_view.dart';
import 'package:photo_view/photo_view_gallery.dart';
import 'package:share_plus/share_plus.dart';
import '../models/item.dart';
import '../services/api_service.dart';
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
  late PageController _pageController;
  late int _currentIndex;
  bool _showOverlays = true;
  ItemDetail? _currentDetail;
  bool _isSharing = false;
  bool _isDownloading = false;
  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
    _loadCurrentDetail();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _loadCurrentDetail() async {
    final item = widget.items[_currentIndex];
    try {
      final detail = await ApiService.instance.getItemDetail(item.id);
      if (mounted) {
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

  Future<void> _shareCurrentItem() async {
    if (_isSharing) return;
    setState(() => _isSharing = true);

    final item = widget.items[_currentIndex];
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Share failed: ${e.toString().replaceAll('Exception: ', '')}'),
            backgroundColor: Colors.red.shade700,
          ),
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

    final item = widget.items[_currentIndex];
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
    } finally {
      if (mounted) setState(() => _isDownloading = false);
    }
  }

  void _copyCurrentInfo() {
    final item = widget.items[_currentIndex];
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
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('素材关键信息已复制到剪贴板')),
    );
  }

  void _showFullMetadataSheet(MobileItem item) {
    final dateStr = DateFormat('yyyy-MM-dd HH:mm:ss').format(item.dateTime);
    final theme = Theme.of(context);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: theme.colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
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
                  const SizedBox(height: 12),
                  const Divider(),
                  _buildMetaRow(Icons.title_outlined, 'Title', item.name.isNotEmpty ? item.name : item.filename),
                  _buildMetaRow(Icons.calendar_today_outlined, 'Captured / Imported', dateStr),
                  _buildMetaRow(Icons.aspect_ratio_outlined, 'Dimensions', '${item.width} × ${item.height} (${item.orientation})'),
                  _buildMetaRow(Icons.data_usage_outlined, 'File Size', item.formattedSize),
                  _buildMetaRow(Icons.category_outlined, 'MIME Type', item.mimeType),

                  if (_currentDetail != null) ...[
                    if (_currentDetail!.dominantColor != null && _currentDetail!.dominantColor!.isNotEmpty)
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
                                color: _parseColor(_currentDetail!.dominantColor!),
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white30),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(_currentDetail!.dominantColor!.toUpperCase(), style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
                          ],
                        ),
                      ),
                    if (_currentDetail!.palette.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.color_lens_outlined, size: 20),
                                const SizedBox(width: 12),
                                const Text('Color Palette: ', style: TextStyle(fontWeight: FontWeight.w600)),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 6,
                              children: _currentDetail!.palette.map((hex) {
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
                        ),
                      ),
                    if (_currentDetail!.note.isNotEmpty)
                      _buildMetaRow(Icons.notes_outlined, 'Note', _currentDetail!.note),
                    if (_currentDetail!.url.isNotEmpty)
                      _buildMetaRow(Icons.link_outlined, 'Source URL', _currentDetail!.url),
                    if (_currentDetail!.prompt.isNotEmpty)
                      _buildMetaRow(Icons.psychology_outlined, 'Prompt', _currentDetail!.prompt),
                    if (_currentDetail!.meta != null) ...[
                      if (_currentDetail!.meta!['colorModel'] != null)
                        _buildMetaRow(Icons.color_lens_outlined, 'Color Model', _currentDetail!.meta!['colorModel'].toString()),
                      if (_currentDetail!.meta!['colorSpace'] != null)
                        _buildMetaRow(Icons.tonality_outlined, 'Color Space', _currentDetail!.meta!['colorSpace'].toString()),
                      if (_currentDetail!.meta!['megapixels'] != null)
                        _buildMetaRow(Icons.photo_size_select_actual_outlined, 'Megapixels', _currentDetail!.meta!['megapixels'].toString()),
                      if (_currentDetail!.meta!['exifMake'] != null || _currentDetail!.meta!['exifModel'] != null)
                        _buildMetaRow(
                          Icons.camera_alt_outlined,
                          'Camera',
                          '${_currentDetail!.meta!['exifMake'] ?? ''} ${_currentDetail!.meta!['exifModel'] ?? ''}'.trim(),
                        ),
                    ],
                  ],

                  if (item.folders.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text('Folders', style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold)),
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
                    Text('Tags', style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold)),
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

  Widget _buildMetaRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: Theme.of(context).colorScheme.outline),
          const SizedBox(width: 12),
          Text('$label: ', style: const TextStyle(fontWeight: FontWeight.w600)),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentItem = widget.items[_currentIndex];

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // PhotoViewGallery for gesture zoom, double-tap zoom & smooth swipe
          GestureDetector(
            onTap: _toggleOverlays,
            child: PhotoViewGallery.builder(
              pageController: _pageController,
              itemCount: widget.items.length,
              onPageChanged: _onPageChanged,
              scrollPhysics: const BouncingScrollPhysics(),
              backgroundDecoration: const BoxDecoration(color: Colors.black),
              builder: (context, index) {
                final item = widget.items[index];
                return PhotoViewGalleryPageOptions(
                  imageProvider: NetworkImage(
                    ApiService.instance.getOriginalUrl(item.id),
                    headers: ApiService.instance.authHeaders,
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
                );
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
                  right: 16,
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
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${_currentIndex + 1} / ${widget.items.length}',
                        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w500),
                      ),
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
                    IconButton(
                      icon: const Icon(Icons.copy_rounded, color: Colors.white),
                      tooltip: '复制信息',
                      onPressed: _copyCurrentInfo,
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
                    IconButton(
                      icon: const Icon(Icons.info_outline, color: Colors.white),
                      tooltip: 'Details',
                      onPressed: () => _showFullMetadataSheet(currentItem),
                    ),
                  ],
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
