import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/inbox_entry.dart';
import '../services/api_service.dart';
import '../services/inbox_service.dart';
import 'connect_screen.dart';
import 'inbox/widgets/inbox_tile.dart';

/// Local queue of shared items that have not reached the desktop library yet.
class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});

  static int _openInstances = 0;

  static bool get isOpen => _openInstances > 0;

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  bool _uploading = false;

  bool get _connected =>
      ApiService.instance.isConfigured && ApiService.instance.isAuthenticated;

  @override
  void initState() {
    super.initState();
    InboxScreen._openInstances++;
    InboxService.instance.addListener(_onInboxChanged);
  }

  @override
  void dispose() {
    InboxScreen._openInstances--;
    InboxService.instance.removeListener(_onInboxChanged);
    super.dispose();
  }

  void _onInboxChanged() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final entries = InboxService.instance.entries;

    return Scaffold(
      appBar: AppBar(
        title: Text(entries.isEmpty ? '收件箱' : '收件箱 (${entries.length})'),
        actions: [
          if (entries.isNotEmpty)
            IconButton(
              icon: _uploading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.cloud_upload_outlined),
              tooltip: '全部上传',
              onPressed: _uploading ? null : _uploadAll,
            ),
        ],
      ),
      body: Column(
        children: [
          if (!_connected)
            Card(
              margin: const EdgeInsets.fromLTRB(12, 12, 12, 4),
              color: theme.colorScheme.secondaryContainer,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
                child: Row(
                  children: [
                    Icon(Icons.link_off, color: theme.colorScheme.onSecondaryContainer),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        '尚未连接 Bowerbird 桌面端，分享已安全保存在手机收件箱。',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSecondaryContainer,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton.tonal(
                      onPressed: _goConnect,
                      child: const Text('去连接'),
                    ),
                  ],
                ),
              ),
            ),
          Expanded(
            child: entries.isEmpty ? _buildEmpty(theme) : _buildList(entries),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.inbox_outlined, size: 64, color: theme.colorScheme.outline),
            const SizedBox(height: 16),
            Text(
              '收件箱是空的',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              '从相册、浏览器、文件管理器或其他应用分享图片、视频、文件、文本到「保存到 Bowerbird」，内容会先出现在这里。',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.outline,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildList(List<InboxEntry> entries) {
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: entries.length,
      separatorBuilder: (_, _) => const Divider(height: 1, indent: 84),
      itemBuilder: (context, index) {
        final entry = entries[index];
        return InboxTile(
          entry: entry,
          busy: _uploading,
          onUpload: () => _uploadEntries([entry]),
          onDelete: () => _confirmDelete(entry),
          onShowText: () => _showText(entry),
        );
      },
    );
  }

  Future<void> _uploadAll() async {
    if (_uploading) return;
    final entries = InboxService.instance.entries;
    if (entries.isEmpty) return;
    await _uploadEntries(entries);
  }

  Future<void> _uploadEntries(List<InboxEntry> entries) async {
    if (_uploading || entries.isEmpty) return;
    if (!_connected) {
      _promptConnect();
      return;
    }

    setState(() => _uploading = true);
    final navigator = Navigator.of(context);
    final route = DialogRoute<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(
            children: [
              const CircularProgressIndicator(),
              const SizedBox(width: 20),
              Expanded(
                child: Text(
                  entries.length == 1
                      ? '正在上传「${entries.first.fileName}」...'
                      : '正在上传 ${entries.length} 个素材...',
                ),
              ),
            ],
          ),
        ),
      ),
    );
    navigator.push(route);
    await Future<void>.delayed(const Duration(milliseconds: 120));

    UploadOutcome? outcome;
    Object? failure;
    try {
      outcome = await InboxService.instance.uploadEntries(entries);
    } catch (error) {
      failure = error;
    } finally {
      if (route.isActive) navigator.removeRoute(route);
    }

    if (!mounted) return;
    setState(() => _uploading = false);

    if (failure != null) {
      _showSnack('上传失败：${failure.toString().replaceFirst('Exception: ', '')}');
      return;
    }
    _showOutcome(outcome!);
  }

  void _showOutcome(UploadOutcome outcome) {
    if (outcome.failed == 0) {
      _showSnack('已存入素材库：${outcome.uploaded} 个');
      return;
    }
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(outcome.uploaded > 0 ? '部分上传成功' : '上传失败'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('成功 ${outcome.uploaded} 个，失败 ${outcome.failed} 个。失败的内容仍保留在收件箱。'),
            const SizedBox(height: 12),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 280),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final item in outcome.failures)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          '${item.entry.fileName}：${item.reason}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('完成'),
          ),
        ],
      ),
    );
  }

  void _showText(InboxEntry entry) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(entry.fileName),
        content: SizedBox(
          width: double.maxFinite,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 360),
            child: SingleChildScrollView(
              child: SelectableText(entry.text ?? ''),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: entry.text ?? ''));
              if (!dialogContext.mounted) return;
              Navigator.of(dialogContext).pop();
              _showSnack('文本已复制');
            },
            child: const Text('复制'),
          ),
          FilledButton(
            onPressed: _uploading
                ? null
                : () {
                    Navigator.of(dialogContext).pop();
                    _uploadEntries([entry]);
                  },
            child: const Text('上传为 .txt'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('关闭'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDelete(InboxEntry entry) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除收件箱内容'),
        content: Text('确定删除「${entry.fileName}」？删除后无法恢复。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await InboxService.instance.deleteEntry(entry);
    }
  }

  void _promptConnect() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('请先连接 Bowerbird 桌面端再上传'),
        action: SnackBarAction(label: '去连接', onPressed: _goConnect),
      ),
    );
  }

  void _goConnect() {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const ConnectScreen()),
      (route) => false,
    );
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }
}
