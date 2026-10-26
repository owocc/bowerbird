import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../models/item.dart';
import '../../../services/share_tag_service.dart';
import '../../../widgets/share_tag_badge.dart';

/// 详情页顶部工具条（返回 / 计数 / 复制 / 下载 / 分享 / 更多）。
class DetailTopBar extends StatelessWidget {
  const DetailTopBar({
    super.key,
    required this.index,
    required this.total,
    required this.isCopying,
    required this.copyProgress,
    required this.isDownloading,
    required this.isSharing,
    required this.isDeleting,
    required this.onBack,
    required this.onCopyContent,
    required this.onDownload,
    required this.onShare,
    required this.onMenuSelected,
  });

  final int index;
  final int total;
  final bool isCopying;
  final double? copyProgress;
  final bool isDownloading;
  final bool isSharing;
  final bool isDeleting;

  final VoidCallback onBack;
  final VoidCallback onCopyContent;
  final VoidCallback onDownload;
  final VoidCallback onShare;
  final ValueChanged<String> onMenuSelected;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: EdgeInsets.only(
        top: MediaQuery.paddingOf(context).top + 8,
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
            onPressed: onBack,
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              '${index + 1} / $total',
              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w500),
            ),
          ),
          if (isCopying)
            _CopyProgress(progress: copyProgress)
          else
            IconButton(
              icon: const Icon(Icons.content_copy, color: Colors.white),
              tooltip: '复制素材内容',
              onPressed: onCopyContent,
            ),
          _ActionSlot(
            busy: isDownloading,
            icon: Icons.download_rounded,
            tooltip: '下载原图',
            onPressed: onDownload,
          ),
          _ActionSlot(
            busy: isSharing,
            icon: Icons.share,
            tooltip: 'Share',
            onPressed: onShare,
          ),
          PopupMenuButton<String>(
            icon: isDeleting
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                  )
                : const Icon(Icons.more_vert, color: Colors.white),
            enabled: !isDeleting,
            tooltip: '更多',
            color: theme.colorScheme.surface,
            onSelected: onMenuSelected,
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
    );
  }
}

class _ActionSlot extends StatelessWidget {
  const _ActionSlot({
    required this.busy,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final bool busy;
  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    if (busy) {
      return const Padding(
        padding: EdgeInsets.symmetric(horizontal: 10),
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
        ),
      );
    }
    return IconButton(icon: Icon(icon, color: Colors.white), tooltip: tooltip, onPressed: onPressed);
  }
}

class _CopyProgress extends StatelessWidget {
  const _CopyProgress({required this.progress});

  final double? progress;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: Row(
        children: [
          SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              color: Colors.white,
              strokeWidth: 2,
              value: progress,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            progress == null ? '' : '${(progress! * 100).round()}%',
            style: const TextStyle(color: Colors.white, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

/// 详情页底部信息条。
class DetailBottomBar extends StatelessWidget {
  const DetailBottomBar({super.key, required this.item, required this.onTap});

  final MobileItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.only(
          top: 16,
          bottom: MediaQuery.paddingOf(context).bottom + 16,
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
              item.filename,
              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              '${item.width} × ${item.height} • ${item.formattedSize} • '
              '${DateFormat('yyyy-MM-dd').format(item.dateTime)}',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 13),
            ),
            if (ShareTagService.instance.isMarked(item.id)) ...[
              const SizedBox(height: 8),
              const ShareTagBadge(
                label: '手机分享',
                fontSize: 11,
                iconSize: 12,
                background: Colors.white24,
              ),
            ],
            if (item.tags.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 4,
                children: item.tags.take(4).map((t) {
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
    );
  }
}
