import 'package:flutter/material.dart';

/// 一行可横向滚动的筛选 Chip（`(label, value)` 选项）。
///
/// 搜索页有 5 组结构相同的筛选项，抽成一个组件后每组的差异只剩数据与回调。
class FilterChipRow extends StatelessWidget {
  const FilterChipRow({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
    this.height = 34,
    this.fontSize = 12,
    this.spacing = 8,
  });

  /// 可选项：`(label, value)`；value 为 `''` 表示"全部"。
  final List<({String label, String value})> options;

  /// 当前选中的 value。
  final String selected;

  final ValueChanged<String> onSelected;
  final double height;
  final double fontSize;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: options.length,
        separatorBuilder: (context, index) => SizedBox(width: spacing),
        itemBuilder: (context, i) {
          final option = options[i];
          final isSelected = option.value == selected;
          return ChoiceChip(
            label: Text(option.label),
            labelStyle: TextStyle(
              fontSize: fontSize,
              fontWeight: isSelected ? FontWeight.w500 : FontWeight.w400,
            ),
            selected: isSelected,
            visualDensity: VisualDensity.compact,
            onSelected: (_) => onSelected(option.value),
          );
        },
      ),
    );
  }
}
