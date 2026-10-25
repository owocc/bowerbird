import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../models/item.dart';
import '../services/item_query.dart';

class FilterSheet extends StatefulWidget {
  const FilterSheet({
    super.key,
    required this.initial,
    required this.tags,
    required this.folders,
    required this.colors,
    required this.onApply,
  });

  final ItemQuery initial;
  final List<MobileTag> tags;
  final List<MobileFolder> folders;
  final List<String> colors;
  final ValueChanged<ItemQuery> onApply;

  @override
  State<FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<FilterSheet> {
  late String _type = widget.initial.type;
  late String _orientation = widget.initial.orientation;
  late String _size = widget.initial.size;
  late int? _rating = widget.initial.rating;
  late String _hasUrl = widget.initial.hasUrl;
  late String _hasNote = widget.initial.hasNote;
  late String? _tag = widget.initial.tag;
  late String? _color = widget.initial.color;

  ItemQuery get _query => ItemQuery(
        text: widget.initial.text,
        type: _type,
        orientation: _orientation,
        size: _size,
        rating: _rating,
        hasUrl: _hasUrl,
        hasNote: _hasNote,
        tag: _tag,
        folder: widget.initial.folder,
        color: _color,
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.55,
      minChildSize: 0.35,
      maxChildSize: 0.95,
      builder: (context, controller) {
        return Material(
          // 底部下拉弹层与 header 按钮同层次：使用统一的次级色
          color: elevatedSurfaceColor(theme),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          child: Column(
            children: [
              const SizedBox(height: 8),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.colorScheme.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
                child: Row(
                  children: [
                    Text('筛选', style: theme.textTheme.titleMedium),
                    const Spacer(),
                    TextButton(
                      onPressed: () {
                        setState(() {
                          _type = '';
                          _orientation = '';
                          _size = '';
                          _rating = null;
                          _hasUrl = '';
                          _hasNote = '';
                          _tag = null;
                          _color = null;
                        });
                      },
                      child: const Text('重置'),
                    ),
                    FilledButton(
                      onPressed: () {
                        widget.onApply(_query);
                        Navigator.pop(context);
                      },
                      child: const Text('应用'),
                    ),
                    const SizedBox(width: 8),
                  ],
                ),
              ),
              // 标题栏与内容区之间不画分隔线，靠留白区分
              Expanded(
                child: ListView(
                  controller: controller,
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                  children: [
                    _section('类型', [
                      ('全部', ''),
                      ('图片', 'image'),
                      ('视频', 'video'),
                      ('音频', 'audio'),
                    ], _type, (v) => setState(() => _type = v)),
                    _section('方向', [
                      ('全部', ''),
                      ('横图', 'landscape'),
                      ('竖图', 'portrait'),
                      ('方形', 'square'),
                    ], _orientation, (v) => setState(() => _orientation = v)),
                    _section('大小', [
                      ('任意', ''),
                      ('小 <1MB', 'small'),
                      ('中 1-10MB', 'medium'),
                      ('大 >10MB', 'large'),
                    ], _size, (v) => setState(() => _size = v)),
                    if (widget.tags.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text('标签', style: theme.textTheme.labelLarge),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ChoiceChip(
                            label: const Text('全部'),
                            selected: _tag == null,
                            onSelected: (_) => setState(() => _tag = null),
                          ),
                          for (final tag in widget.tags)
                            ChoiceChip(
                              label: Text('${tag.name} (${tag.itemCount})'),
                              selected: _tag == tag.name,
                              onSelected: (sel) => setState(() => _tag = sel ? tag.name : null),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _section(
    String title,
    List<(String, String)> options,
    String value,
    ValueChanged<String> onChanged,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final opt in options)
                ChoiceChip(
                  label: Text(opt.$1),
                  selected: value == opt.$2,
                  onSelected: (_) => onChanged(opt.$2),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
