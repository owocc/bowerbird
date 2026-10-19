import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
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
          initialChildSize: 0.5,
          minChildSize: 0.3,
          maxChildSize: 0.85,
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
                  _buildMetaRow(Icons.calendar_today_outlined, 'Date', dateStr),
                  _buildMetaRow(Icons.aspect_ratio_outlined, 'Dimensions', '${item.width} × ${item.height} (${item.orientation})'),
                  _buildMetaRow(Icons.data_usage_outlined, 'File Size', item.formattedSize),
                  _buildMetaRow(Icons.category_outlined, 'MIME Type', item.mimeType),

                  if (_currentDetail != null) ...[
                    if (_currentDetail!.dominantColor != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(
                          children: [
                            const Icon(Icons.palette_outlined, size: 20),
                            const SizedBox(width: 12),
                            const Text('Dominant Color:'),
                            const SizedBox(width: 8),
                            Container(
                              width: 20,
                              height: 20,
                              decoration: BoxDecoration(
                                color: _parseColor(_currentDetail!.dominantColor!),
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white24),
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (_currentDetail!.note.isNotEmpty)
                      _buildMetaRow(Icons.notes_outlined, 'Note', _currentDetail!.note),
                    if (_currentDetail!.meta != null) ...[
                      if (_currentDetail!.meta!['exifMake'] != null || _currentDetail!.meta!['exifModel'] != null)
                        _buildMetaRow(
                          Icons.camera_alt_outlined,
                          'Camera',
                          '${_currentDetail!.meta!['exifMake'] ?? ''} ${_currentDetail!.meta!['exifModel'] ?? ''}'.trim(),
                        ),
                    ],
                  ],

                  if (item.tags.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text('Tags', style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: item.tags.map((t) => Chip(label: Text(t))).toList(),
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
          // Swipeable Media Viewer
          GestureDetector(
            onTap: _toggleOverlays,
            child: PageView.builder(
              controller: _pageController,
              itemCount: widget.items.length,
              onPageChanged: _onPageChanged,
              itemBuilder: (context, index) {
                final item = widget.items[index];

                return InteractiveViewer(
                  minScale: 0.8,
                  maxScale: 5.0,
                  child: Center(
                    child: Image.network(
                      ApiService.instance.getOriginalUrl(item.id),
                      fit: BoxFit.contain,
                      headers: ApiService.instance.authHeaders,
                      loadingBuilder: (context, child, progress) {
                        if (progress == null) return child;
                        // While original loads, show thumbnail immediately as preview
                        return Stack(
                          alignment: Alignment.center,
                          children: [
                            Image.network(
                              ApiService.instance.getThumbnailUrl(item.id),
                              fit: BoxFit.contain,
                              headers: ApiService.instance.authHeaders,
                            ),
                            CircularProgressIndicator(
                              value: progress.expectedTotalBytes != null
                                  ? progress.cumulativeBytesLoaded / progress.expectedTotalBytes!
                                  : null,
                              color: Colors.white70,
                            ),
                          ],
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
