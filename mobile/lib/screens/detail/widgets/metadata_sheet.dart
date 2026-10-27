import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../models/item.dart';
import '../../../services/share_tag_service.dart';
import '../../../theme/app_theme.dart';

/// 详情页的「完整元数据」底部弹层。
///
/// 从 `DetailScreen` 抽出：这里只是纯展示 + 复制，与页面状态无关。
class MetadataSheet extends StatelessWidget {
  const MetadataSheet({
    super.key,
    required this.item,
    required this.detail,
    required this.scrollController,
    required this.onCopy,
  });

  final MobileItem item;
  final ItemDetail? detail;
  final ScrollController scrollController;

  /// 复制某个字段（由页面负责弹提示）。
  final void Function(String label, String value) onCopy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateStr = DateFormat('yyyy-MM-dd HH:mm:ss').format(item.dateTime);

    return SingleChildScrollView(
      controller: scrollController,
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SheetHandle(),
          Text(
            item.filename,
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          const Divider(),
          _MetaRow(
            icon: Icons.title_outlined,
            label: 'Title',
            value: item.name.isNotEmpty ? item.name : item.filename,
          ),
          if (ShareTagService.instance.isMarked(item.id))
            const _MetaRow(icon: Icons.ios_share, label: '来源', value: '手机分享'),
          _MetaRow(icon: Icons.insert_drive_file_outlined, label: 'Filename', value: item.filename),
          _MetaRow(icon: Icons.calendar_today_outlined, label: 'Captured / Imported', value: dateStr),
          _MetaRow(
            icon: Icons.aspect_ratio_outlined,
            label: 'Dimensions',
            value: '${item.width} × ${item.height} (${item.orientation})',
            copyValue: '${item.width} × ${item.height}',
            onCopy: onCopy,
          ),
          _MetaRow(icon: Icons.data_usage_outlined, label: 'File Size', value: item.formattedSize),
          _MetaRow(icon: Icons.description_outlined, label: 'Format', value: item.extension.toUpperCase()),
          _MetaRow(icon: Icons.category_outlined, label: 'MIME Type', value: item.mimeType),
          ..._detailRows(theme),
          if (item.folders.isNotEmpty) ...[
            const SizedBox(height: 12),
            _GroupHeader(
              title: 'Folders',
              copyValue: item.folders.join(', '),
              onCopy: onCopy,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: item.folders
                  .map((f) => Chip(
                        avatar: const Icon(Icons.folder_outlined, size: 16),
                        label: Text(f),
                      ))
                  .toList(),
            ),
          ],
          if (item.tags.isNotEmpty) ...[
            const SizedBox(height: 12),
            _GroupHeader(title: 'Tags', copyValue: item.tags.join(', '), onCopy: onCopy),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: item.tags
                  .map((t) => Chip(
                        avatar: const Icon(Icons.tag, size: 16),
                        label: Text(t),
                      ))
                  .toList(),
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  List<Widget> _detailRows(ThemeData theme) {
    final d = detail;
    if (d == null) return const [];
    return [
      if (d.filePath.isNotEmpty)
        _MetaRow(icon: Icons.folder_open_outlined, label: 'File Path', value: d.filePath),
      if (d.note.isNotEmpty) _MetaRow(icon: Icons.notes_outlined, label: 'Note', value: d.note),
      if (d.url.isNotEmpty) _MetaRow(icon: Icons.link_outlined, label: 'Source URL', value: d.url),
      if (d.prompt.isNotEmpty)
        _MetaRow(icon: Icons.psychology_outlined, label: 'Prompt', value: d.prompt),
      ..._exifRows(d),
      if (d.dominantColor != null && d.dominantColor!.isNotEmpty)
        _DominantColorRow(hex: d.dominantColor!, onCopy: onCopy),
      if (d.palette.isNotEmpty) ...[
        _GroupHeader(title: 'Color Palette', copyValue: d.palette.join(', '), onCopy: onCopy),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: d.palette
              .map((hex) => _PaletteChip(hex: hex))
              .toList(),
        ),
      ],
    ];
  }

  List<Widget> _exifRows(ItemDetail d) {
    final meta = d.meta;
    if (meta == null) return const [];
    final rows = <Widget>[];
    void add(String key, IconData icon, String label) {
      final v = meta[key];
      if (v == null) return;
      rows.add(_MetaRow(icon: icon, label: label, value: v.toString()));
    }

    add('colorModel', Icons.color_lens_outlined, 'Color Model');
    add('colorSpace', Icons.tonality_outlined, 'Color Space');
    add('megapixels', Icons.photo_size_select_actual_outlined, 'Megapixels');
    final make = meta['exifMake'];
    final model = meta['exifModel'];
    if (make != null || model != null) {
      rows.add(_MetaRow(
        icon: Icons.camera_alt_outlined,
        label: 'Camera',
        value: '${make ?? ''} ${model ?? ''}'.trim(),
      ));
    }
    return rows;
  }
}

/// 打开元数据弹层（页面调用这个入口，避免重复书写 sheet 模板）。
Future<void> showMetadataSheet(
  BuildContext context, {
  required MobileItem item,
  required ItemDetail? detail,
  required void Function(String label, String value) onCopy,
}) {
  final theme = Theme.of(context);
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: elevatedSurfaceColor(theme),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.sheet)),
    ),
    builder: (_) => DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.35,
      maxChildSize: 0.9,
      expand: false,
      builder: (context, scrollController) => MetadataSheet(
        item: item,
        detail: detail,
        scrollController: scrollController,
        onCopy: onCopy,
      ),
    ),
  );
}

class _SheetHandle extends StatelessWidget {
  const _SheetHandle();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 40,
        height: 4,
        margin: const EdgeInsets.only(bottom: 16),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({
    required this.icon,
    required this.label,
    required this.value,
    this.copyValue,
    this.onCopy,
  });

  final IconData icon;
  final String label;
  final String value;
  final String? copyValue;
  final void Function(String label, String value)? onCopy;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20),
          const SizedBox(width: 12),
          SizedBox(
            width: 120,
            child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
          Expanded(child: Text(value)),
          if (onCopy != null)
            _CopyButton(
              onTap: () => onCopy!(label, copyValue ?? value),
            ),
        ],
      ),
    );
  }
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({
    required this.title,
    required this.copyValue,
    required this.onCopy,
  });

  final String title;
  final String copyValue;
  final void Function(String label, String value) onCopy;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(width: 8),
        _CopyButton(onTap: () => onCopy(title, copyValue)),
      ],
    );
  }
}

class _CopyButton extends StatelessWidget {
  const _CopyButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      visualDensity: VisualDensity.compact,
      icon: const Icon(Icons.copy_outlined, size: 18),
      tooltip: '复制',
      onPressed: onTap,
    );
  }
}

class _DominantColorRow extends StatelessWidget {
  const _DominantColorRow({required this.hex, required this.onCopy});

  final String hex;
  final void Function(String label, String value) onCopy;

  @override
  Widget build(BuildContext context) {
    return Padding(
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
              color: parseHexColor(hex),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white30),
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              hex.toUpperCase(),
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            ),
          ),
          _CopyButton(onTap: () => onCopy('Dominant Color', hex.toUpperCase())),
        ],
      ),
    );
  }
}

class _PaletteChip extends StatelessWidget {
  const _PaletteChip({required this.hex});

  final String hex;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: hex.toUpperCase(),
      child: Container(
        width: 32,
        height: 24,
        decoration: BoxDecoration(
          color: parseHexColor(hex),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: Colors.white24),
        ),
      ),
    );
  }
}

/// `#RRGGBB` / `RRGGBB` / `AARRGGBB` → [Color]。
Color parseHexColor(String hex) {
  var value = hex.replaceAll('#', '');
  if (value.length == 6) value = 'FF$value';
  return Color(int.tryParse(value, radix: 16) ?? 0xFF888888);
}
