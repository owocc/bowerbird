import 'package:flutter/material.dart';

import '../../models/item.dart';
import '../../services/api_service.dart';
import '../../services/item_query.dart';
import '../../theme/app_theme.dart';
import '../../widgets/filter_sheet.dart';

/// 主界面的各类弹窗。
///
/// 全部是静态方法，只负责"弹出并返回结果"，不含业务逻辑；
/// 这样 `HomeScreen` 不必为了几个对话框膨胀几百行。
class HomeDialogs {
  const HomeDialogs._();

  /// 筛选面板。返回用户应用的查询，取消时返回 null。
  static Future<ItemQuery?> showFilterSheet(
    BuildContext context, {
    required ItemQuery initial,
    required List<MobileTag> tags,
    required List<MobileFolder> folders,
    required List<String> colors,
  }) {
    return showModalBottomSheet<ItemQuery>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => FilterSheet(
        initial: initial,
        tags: tags,
        folders: folders,
        colors: colors,
        onApply: (q) => Navigator.of(context).pop(q),
      ),
    );
  }

  /// 选择一个目标文件夹。
  static Future<MobileFolder?> pickFolder(
    BuildContext context,
    List<MobileFolder> folders,
  ) async {
    final flat = folders.expand((f) => f.flatten()).toList();
    if (flat.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('还没有文件夹')));
      return null;
    }
    return showModalBottomSheet<MobileFolder>(
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(
          children: [
            const ListTile(title: Text('添加到文件夹')),
            for (final f in flat)
              ListTile(
                title: Text(f.name),
                onTap: () => Navigator.of(ctx).pop(f),
              ),
          ],
        ),
      ),
    );
  }

  /// 选择或新建一个标签。返回标签名，取消时返回 null。
  static Future<String?> pickTag(BuildContext context, List<MobileTag> tags) async {
    String? chosen;
    if (tags.isNotEmpty) {
      chosen = await showModalBottomSheet<String>(
        context: context,
        builder: (ctx) => SafeArea(
          child: ListView(
            children: [
              const ListTile(title: Text('添加标签')),
              for (final t in tags)
                ListTile(
                  title: Text(t.name),
                  onTap: () => Navigator.of(ctx).pop(t.name),
                ),
              ListTile(
                leading: const Icon(Icons.add),
                title: const Text('新建标签…'),
                onTap: () => Navigator.of(ctx).pop('__new__'),
              ),
            ],
          ),
        ),
      );
    }
    if (chosen == '__new__' || tags.isEmpty) {
      if (!context.mounted) return null;
      chosen = await showDialog<String>(
        context: context,
        builder: (ctx) => _NewTagDialog(),
      );
    }
    return chosen;
  }

  /// 清空废纸篓的二次确认。
  static Future<bool?> confirmEmptyTrash(BuildContext context) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('清空废纸篓？'),
        content: const Text('废纸篓中的素材将被永久删除，此操作无法撤销。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error),
            child: const Text('清空'),
          ),
        ],
      ),
    );
  }

  static Future<bool> confirmDisconnect(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('断开连接'),
        content: const Text('断开后需要重新配对才能继续使用。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('断开')),
        ],
      ),
    );
    return ok ?? false;
  }

  static void showPairingRevoked(BuildContext context, {required VoidCallback onConfirm}) {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('授权已撤销'),
        content: const Text('桌面端已撤销此设备的连接授权，请重新配对。'),
        actions: [
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              onConfirm();
            },
            child: const Text('确定'),
          ),
        ],
      ),
    );
  }

  static void showUploadProgress(BuildContext context, {required int count}) {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        content: Row(
          children: [
            const CircularProgressIndicator(),
            const SizedBox(width: 20),
            Expanded(child: Text('正在上传 $count 个素材到当前资源库...')),
          ],
        ),
      ),
    );
  }

  /// 切换资源库。返回是否发生了切换。
  static Future<bool?> showLibraryPicker(BuildContext context) async {
    List<MobileLibrary> libraries = const [];
    try {
      libraries = await ApiService.instance.getLibraries();
    } catch (_) {}
    if (!context.mounted) return null;

    return showModalBottomSheet<bool>(
      context: context,
      backgroundColor: elevatedSurfaceColor(Theme.of(context)),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.sheet)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
              child: Row(
                children: [
                  const Text(
                    '切换资源库',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
            ),
            if (libraries.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: Text('未发现其他资源库')),
              )
            else
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: libraries.length,
                  itemBuilder: (_, i) {
                    final lib = libraries[i];
                    return ListTile(
                      leading: Icon(lib.isActive ? Icons.check_circle : Icons.folder_outlined),
                      title: Text(lib.name),
                      subtitle: lib.isActive ? const Text('当前') : null,
                      onTap: lib.isActive
                          ? () => Navigator.pop(ctx, false)
                          : () async {
                              try {
                                await ApiService.instance.switchLibrary(lib.path);
                                if (ctx.mounted) Navigator.pop(ctx, true);
                              } catch (e) {
                                if (!ctx.mounted) return;
                                ScaffoldMessenger.of(ctx).showSnackBar(
                                  SnackBar(content: Text('切换失败: $e')),
                                );
                              }
                            },
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// 让用户选择目标文件夹后执行回调（页面不必写两段 try/await）。
  static Future<void> pickFolderAnd(
    BuildContext context,
    List<MobileFolder> folders,
    Future<void> Function(MobileFolder) onPicked,
  ) async {
    final folder = await pickFolder(context, folders);
    if (folder != null) await onPicked(folder);
  }

  /// 让用户选择/新建标签后执行回调。
  static Future<void> pickTagAnd(
    BuildContext context,
    List<MobileTag> tags,
    Future<void> Function(String) onPicked,
  ) async {
    final tag = await pickTag(context, tags);
    if (tag != null && tag.isNotEmpty) await onPicked(tag);
  }
}


/// 新建标签的输入弹窗。
class _NewTagDialog extends StatefulWidget {
  const _NewTagDialog();

  @override
  State<_NewTagDialog> createState() => _NewTagDialogState();
}

class _NewTagDialogState extends State<_NewTagDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('新建标签'),
      content: TextField(
        controller: _controller,
        autofocus: true,
        decoration: const InputDecoration(hintText: '标签名称'),
        onSubmitted: (value) => Navigator.pop(context, value.trim()),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
        FilledButton(
          onPressed: () => Navigator.pop(context, _controller.text.trim()),
          child: const Text('确定'),
        ),
      ],
    );
  }
}
