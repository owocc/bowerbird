import '../models/item.dart';

/// 把素材关键信息拼成可粘贴的文本（详情页"复制信息"用）。
String formatItemInfo(MobileItem item, ItemDetail? detail) {
  return [
    '名称: ${item.name.isNotEmpty ? item.name : item.filename}',
    '文件名: ${item.filename}',
    if (detail != null && detail.url.isNotEmpty) '来源链接: ${detail.url}',
    '尺寸: ${item.width} x ${item.height}',
    '大小: ${item.formattedSize}',
    '格式: ${item.extension.toUpperCase()}',
    if (item.tags.isNotEmpty) '标签: ${item.tags.join(", ")}',
    if (detail != null && detail.note.isNotEmpty) '备注: ${detail.note}',
  ].join('\n');
}
