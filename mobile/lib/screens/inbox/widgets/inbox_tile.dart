import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../models/inbox_entry.dart';
import '../../../services/inbox_service.dart';

/// 收件箱列表的一项：缩略图 + 文件名 + 类型/大小/时间 + 上传/删除。
class InboxTile extends StatelessWidget {
  const InboxTile({
    super.key,
    required this.entry,
    required this.busy,
    required this.onUpload,
    required this.onDelete,
    required this.onShowText,
  });

  final InboxEntry entry;

  /// 正在上传时禁用按钮。
  final bool busy;
  final VoidCallback onUpload;
  final VoidCallback onDelete;
  final VoidCallback onShowText;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: InboxThumbnail(entry: entry),
      title: Text(
        entry.fileName,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        inboxSubtitle(entry),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      onTap: entry.isText ? onShowText : null,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: const Icon(Icons.upload_file_outlined),
            tooltip: entry.isText ? '上传为 .txt' : '上传',
            onPressed: busy ? null : onUpload,
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: '删除',
            onPressed: busy ? null : onDelete,
          ),
        ],
      ),
    );
  }
}

/// 收件箱条目的缩略图（图片预览或类型图标）。
class InboxThumbnail extends StatelessWidget {
  const InboxThumbnail({super.key, required this.entry});

  final InboxEntry entry;

  @override
  Widget build(BuildContext context) {
    final file = InboxService.instance.fileFor(entry);
    if (!entry.isText && entry.isImage && file != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Image.file(
          file,
          width: 52,
          height: 52,
          fit: BoxFit.cover,
          cacheWidth: 160,
          errorBuilder: (_, _, _) => _IconThumbnail(entry: entry),
        ),
      );
    }
    return _IconThumbnail(entry: entry);
  }
}

class _IconThumbnail extends StatelessWidget {
  const _IconThumbnail({required this.entry});

  final InboxEntry entry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final icon = entry.isText
        ? Icons.article_outlined
        : entry.isVideo
            ? Icons.videocam_outlined
            : entry.isImage
                ? Icons.image_outlined
                : Icons.insert_drive_file_outlined;
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Icon(icon, color: theme.colorScheme.primary),
          if (entry.isVideo)
            Positioned(
              right: 2,
              bottom: 2,
              child: Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(3),
                ),
                child: const Icon(Icons.play_arrow, size: 11, color: Colors.white),
              ),
            ),
        ],
      ),
    );
  }
}

/// 「类型 · 大小 · 时间 · 预览」的副标题文本。
String inboxSubtitle(InboxEntry entry) {
  final typeLabel = entry.isText
      ? '文本'
      : entry.isVideo
          ? '视频'
          : entry.isImage
              ? '图片'
              : '文件';
  final parts = <String>[
    '$typeLabel · ${entry.formattedSize}',
    DateFormat('MM-dd HH:mm').format(
      DateTime.fromMillisecondsSinceEpoch(entry.receivedAt),
    ),
    if (entry.isText && entry.preview.isNotEmpty) entry.preview,
  ];
  return parts.join(' · ');
}
