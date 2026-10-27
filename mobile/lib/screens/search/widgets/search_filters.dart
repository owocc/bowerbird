import 'package:flutter/material.dart';

import '../../../models/item.dart';
import '../../../widgets/filter_chip_row.dart';

/// 搜索页的筛选区：类型 / 方向 / 大小 / 评分 / URL 与备注 / 颜色 / 文件夹 / 标签。
///
/// 从 `SearchScreen.build`（原本 360+ 行）抽出。所有筛选都走同一个
/// `onChanged` 回调，页面只需刷新结果。
class SearchFilters extends StatelessWidget {
  const SearchFilters({
    super.key,
    required this.type,
    required this.orientation,
    required this.size,
    required this.rating,
    required this.urlPresence,
    required this.notePresence,
    required this.color,
    required this.folderId,
    required this.tag,
    required this.colors,
    required this.folders,
    required this.tags,
    required this.onTypeChanged,
    required this.onOrientationChanged,
    required this.onSizeChanged,
    required this.onRatingChanged,
    required this.onUrlPresenceChanged,
    required this.onNotePresenceChanged,
    required this.onColorChanged,
    required this.onFolderChanged,
    required this.onTagChanged,
  });

  final String type;
  final String orientation;
  final String size;
  final int? rating;
  final String urlPresence;
  final String notePresence;
  final String? color;
  final String? folderId;
  final String? tag;

  final List<String> colors;
  final List<MobileFolder> folders;
  final List<MobileTag> tags;

  final ValueChanged<String> onTypeChanged;
  final ValueChanged<String> onOrientationChanged;
  final ValueChanged<String> onSizeChanged;
  final ValueChanged<int?> onRatingChanged;
  final ValueChanged<String> onUrlPresenceChanged;
  final ValueChanged<String> onNotePresenceChanged;
  final ValueChanged<String?> onColorChanged;
  final ValueChanged<String?> onFolderChanged;
  final ValueChanged<String?> onTagChanged;

  static const typeOptions = [
    (label: '全部', value: ''),
    (label: '图片', value: 'image'),
    (label: '视频', value: 'video'),
    (label: '音频', value: 'audio'),
  ];

  static const orientationOptions = [
    (label: '全部', value: ''),
    (label: '横图', value: 'landscape'),
    (label: '竖图', value: 'portrait'),
    (label: '方形', value: 'square'),
  ];

  static const sizeOptions = [
    (label: '任意', value: ''),
    (label: '小 <1MB', value: 'small'),
    (label: '中 1-10MB', value: 'medium'),
    (label: '大 >10MB', value: 'large'),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(bottom: BorderSide(color: theme.dividerColor)),
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            FilterChipRow(
              options: typeOptions,
              selected: type,
              onSelected: onTypeChanged,
            ),
            const SizedBox(height: 6),
            FilterChipRow(
              options: orientationOptions,
              selected: orientation,
              onSelected: onOrientationChanged,
            ),
            const SizedBox(height: 6),
            FilterChipRow(
              options: sizeOptions,
              selected: size,
              onSelected: onSizeChanged,
              height: 32,
              fontSize: 11,
            ),
            const SizedBox(height: 6),
            _buildRatingRow(),
            const SizedBox(height: 6),
            _buildPresenceRow(),
            if (colors.isNotEmpty) ...[
              const SizedBox(height: 6),
              _buildColorRow(theme),
            ],
            if (folders.isNotEmpty) ...[
              const SizedBox(height: 6),
              _buildFolderRow(),
            ],
            if (tags.isNotEmpty) ...[
              const SizedBox(height: 6),
              _buildTagRow(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildRatingRow() {
    return SizedBox(
      height: 32,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: 6,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final value = i == 0 ? null : i;
          return ChoiceChip(
            label: Text(i == 0 ? 'Any Rating' : '$i★'),
            labelStyle: const TextStyle(fontSize: 11),
            selected: rating == value,
            visualDensity: VisualDensity.compact,
            onSelected: (_) => onRatingChanged(value),
          );
        },
      ),
    );
  }

  Widget _buildPresenceRow() {
    const options = [
      (label: 'Has URL', value: 'has', note: false),
      (label: 'No URL', value: 'empty', note: false),
      (label: 'Has Note', value: 'has', note: true),
      (label: 'No Note', value: 'empty', note: true),
    ];
    return SizedBox(
      height: 32,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          for (final option in options)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(option.label),
                labelStyle: const TextStyle(fontSize: 11),
                selected: option.note
                    ? notePresence == option.value
                    : urlPresence == option.value,
                visualDensity: VisualDensity.compact,
                onSelected: (_) {
                  if (option.note) {
                    onNotePresenceChanged(
                      notePresence == option.value ? '' : option.value,
                    );
                  } else {
                    onUrlPresenceChanged(
                      urlPresence == option.value ? '' : option.value,
                    );
                  }
                },
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildColorRow(ThemeData theme) {
    return SizedBox(
      height: 32,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: colors.length + 1,
        separatorBuilder: (_, _) => const SizedBox(width: 6),
        itemBuilder: (context, i) {
          if (i == 0) {
            return ChoiceChip(
              label: const Text('All Colors'),
              labelStyle: const TextStyle(fontSize: 11),
              selected: color == null,
              visualDensity: VisualDensity.compact,
              onSelected: (_) => onColorChanged(null),
            );
          }
          final hex = colors[i - 1];
          final isSelected = color == hex;
          final swatch = parseHexColor(hex);
          return InkWell(
            onTap: () => onColorChanged(isSelected ? null : hex),
            borderRadius: BorderRadius.circular(16),
            child: Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: swatch,
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected ? theme.colorScheme.primary : Colors.white24,
                  width: isSelected ? 3 : 1,
                ),
                boxShadow: isSelected
                    ? [
                        BoxShadow(
                          color: theme.colorScheme.primary.withValues(alpha: 0.4),
                          blurRadius: 4,
                          spreadRadius: 1,
                        ),
                      ]
                    : null,
              ),
              child: isSelected
                  ? Icon(
                      Icons.check,
                      size: 14,
                      color: swatch.computeLuminance() > 0.5 ? Colors.black : Colors.white,
                    )
                  : null,
            ),
          );
        },
      ),
    );
  }

  Widget _buildFolderRow() {
    return SizedBox(
      height: 32,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: folders.length + 1,
        separatorBuilder: (_, _) => const SizedBox(width: 6),
        itemBuilder: (context, i) {
          if (i == 0) {
            return ChoiceChip(
              avatar: const Icon(Icons.folder, size: 14),
              label: const Text('All Folders'),
              labelStyle: const TextStyle(fontSize: 11),
              selected: folderId == null,
              visualDensity: VisualDensity.compact,
              onSelected: (_) => onFolderChanged(null),
            );
          }
          final folder = folders[i - 1];
          return ChoiceChip(
            avatar: const Icon(Icons.folder_outlined, size: 14),
            label: Text('${folder.name} (${folder.itemCount})'),
            labelStyle: const TextStyle(fontSize: 11),
            selected: folderId == folder.id,
            visualDensity: VisualDensity.compact,
            onSelected: (val) => onFolderChanged(val ? folder.id : null),
          );
        },
      ),
    );
  }

  Widget _buildTagRow() {
    return SizedBox(
      height: 32,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: tags.length + 1,
        separatorBuilder: (_, _) => const SizedBox(width: 6),
        itemBuilder: (context, i) {
          if (i == 0) {
            return ChoiceChip(
              avatar: const Icon(Icons.tag, size: 14),
              label: const Text('All Tags'),
              labelStyle: const TextStyle(fontSize: 11),
              selected: tag == null,
              visualDensity: VisualDensity.compact,
              onSelected: (_) => onTagChanged(null),
            );
          }
          final t = tags[i - 1];
          return ChoiceChip(
            avatar: const Icon(Icons.label_outline, size: 14),
            label: Text('${t.name} (${t.itemCount})'),
            labelStyle: const TextStyle(fontSize: 11),
            selected: tag == t.name,
            visualDensity: VisualDensity.compact,
            onSelected: (val) => onTagChanged(val ? t.name : null),
          );
        },
      ),
    );
  }
}

/// `#RRGGBB` / `RRGGBB` / `AARRGGBB` → [Color]。
Color parseHexColor(String hex) {
  var value = hex.replaceAll('#', '').trim();
  if (value.length == 6) value = 'FF$value';
  return Color(int.tryParse(value, radix: 16) ?? 0xFF888888);
}
