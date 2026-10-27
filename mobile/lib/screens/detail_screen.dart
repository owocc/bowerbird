import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:photo_view/photo_view.dart';

import '../models/item.dart';
import '../services/api_service.dart';
import '../services/share_tag_service.dart';
import '../utils/item_info.dart';
import '../widgets/video_player_page.dart';
import 'detail/widgets/detail_bars.dart';
import 'detail/widgets/metadata_sheet.dart';
import '../services/api_items.dart';
import '../services/api_metadata.dart';
import '../services/api_clipboard.dart';
import '../services/api_upload.dart';
import '../services/media_limits.dart';

/// 素材详情：左右翻页浏览，顶部工具栏 + 底部信息条。
///
/// 动作复用 `MediaActions` 与 `ApiService`；元数据弹层在
/// `detail/widgets/metadata_sheet.dart`，上下栏在 `detail/widgets/detail_bars.dart`。
class DetailScreen extends StatefulWidget {
  const DetailScreen({
    super.key,
    required this.items,
    required this.initialIndex,
  });

  final List<MobileItem> items;
  final int initialIndex;

  @override
  State<DetailScreen> createState() => _DetailScreenState();
}

class _DetailScreenState extends State<DetailScreen> {
  late final List<MobileItem> _items;
  late final PageController _pageController;
  late int _currentIndex;

  bool _showOverlays = true;
  bool _isSharing = false;
  bool _isDownloading = false;
  bool _isCopying = false;
  bool _isDeleting = false;
  double? _copyProgress;
  ItemDetail? _currentDetail;

  MobileItem get _currentItem => _items[_currentIndex];

  @override
  void initState() {
    super.initState();
    _items = List<MobileItem>.from(widget.items);
    _currentIndex = widget.initialIndex.clamp(0, _items.length - 1);
    _pageController = PageController(initialPage: _currentIndex);
    _loadCurrentDetail();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _loadCurrentDetail() async {
    final item = _currentItem;
    try {
      final detail = await ApiService.instance.getItemDetail(item.id);
      if (mounted && _currentItem.id == item.id) {
        setState(() => _currentDetail = detail);
      }
    } catch (_) {
      if (mounted) setState(() => _currentDetail = null);
    }
  }

  void _onPageChanged(int index) {
    setState(() {
      _currentIndex = index;
      _currentDetail = null;
    });
    _loadCurrentDetail();
  }

  void _toggleOverlays() => setState(() => _showOverlays = !_showOverlays);

  void _snack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? Colors.red.shade700 : null,
      ),
    );
  }

  // ── 动作 ────────────────────────────────────────────────────────────

  Future<void> _shareCurrentItem() async {
    if (_isSharing) return;
    setState(() => _isSharing = true);
    try {
      final bytes = await _fetchOriginal(_currentItem);
      await ApiService.instance.shareBytes(bytes, _currentItem);
      _snack('已分享');
    } catch (e) {
      _snack('Share failed: ${_clean(e)}', error: true);
    } finally {
      if (mounted) setState(() => _isSharing = false);
    }
  }

  Future<void> _downloadCurrentItem() async {
    if (_isDownloading) return;
    setState(() => _isDownloading = true);
    try {
      final item = _currentItem;
      final bytes = await _fetchOriginal(item);
      final filename = item.filename.isNotEmpty ? item.filename : '${item.id}.${item.extension}';
      await ApiService.instance.saveMediaToGallery(bytes, filename, item.mimeType);
      _snack('已保存至手机相册/下载目录: $filename');
    } catch (e) {
      _snack('下载失败: ${_clean(e)}', error: true);
    } finally {
      if (mounted) setState(() => _isDownloading = false);
    }
  }

  Future<void> _copyCurrentContent() async {
    if (_isCopying) return;
    final item = _currentItem;
    if (item.size > maxClipboardFileBytes) {
      _snack('文件过大（${item.formattedSize}），请使用分享或下载', error: true);
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
          if (_copyProgress == null || (progress - _copyProgress!) >= 0.01) {
            setState(() => _copyProgress = progress);
          }
        },
      );
      _snack('已复制素材内容，可粘贴到微信等应用');
    } catch (e) {
      _snack('复制失败: ${_clean(e)}', error: true);
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
    Clipboard.setData(ClipboardData(text: formatItemInfo(_currentItem, _currentDetail)));
    _snack('素材关键信息已复制到剪贴板');
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
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
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
      _snack(_clean(e), error: true);
      if (mounted) setState(() => _isDeleting = false);
    }
  }

  void _showMetadata() {
    showMetadataSheet(
      context,
      item: _currentItem,
      detail: _currentDetail,
      onCopy: (label, value) {
        Clipboard.setData(ClipboardData(text: value));
        _snack('$label 已复制');
      },
    );
  }

  void _onMenuSelected(String value) {
    switch (value) {
      case 'copy_text':
        _copyCurrentInfo();
      case 'details':
        _showMetadata();
      case 'delete':
        _confirmDeleteCurrentItem();
    }
  }

  Future<Uint8List> _fetchOriginal(MobileItem item) =>
      ApiService.instance.fetchOriginalBytes(item.id);

  String _clean(Object e) => e.toString().replaceAll('Exception: ', '');

  // ── 构建 ────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final item = _currentItem;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          PageView.builder(
            controller: _pageController,
            itemCount: _items.length,
            onPageChanged: _onPageChanged,
            itemBuilder: (context, index) => _buildPage(_items[index], index),
          ),
          if (_showOverlays)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: DetailTopBar(
                index: _currentIndex,
                total: _items.length,
                isCopying: _isCopying,
                copyProgress: _copyProgress,
                isDownloading: _isDownloading,
                isSharing: _isSharing,
                isDeleting: _isDeleting,
                onBack: () => Navigator.pop(context),
                onCopyContent: _copyCurrentContent,
                onDownload: _downloadCurrentItem,
                onShare: _shareCurrentItem,
                onMenuSelected: _onMenuSelected,
              ),
            ),
          if (_showOverlays)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: DetailBottomBar(item: item, onTap: _showMetadata),
            ),
        ],
      ),
    );
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
        errorBuilder: (context, error, stackTrace) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.broken_image, size: 64, color: Colors.white54),
              const SizedBox(height: 12),
              Text(item.filename, style: const TextStyle(color: Colors.white70)),
            ],
          ),
        ),
      ),
    );
  }
}

/// 动图（GIF/WebP）用原生 [Image] 渲染：PhotoView 的帧跟踪不可靠，
/// 会让动图停在第一帧。
class _AnimatedImagePage extends StatelessWidget {
  const _AnimatedImagePage({super.key, required this.item, this.onTap});

  final MobileItem item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Center(
        child: Image.network(
          ApiService.instance.getOriginalUrl(item.id),
          headers: ApiService.instance.mediaHeaders,
          fit: BoxFit.contain,
          errorBuilder: (context, error, stackTrace) => Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.broken_image, size: 64, color: Colors.white54),
                const SizedBox(height: 12),
                Text(item.filename, style: const TextStyle(color: Colors.white70)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
