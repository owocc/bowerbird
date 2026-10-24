import 'package:flutter/material.dart';
import '../models/item.dart';

class FolderDrawer extends StatelessWidget {
  const FolderDrawer({
    super.key,
    required this.folders,
    required this.selectedFolderId,
    required this.totalCount,
    required this.onSelect,
  });

  final List<MobileFolder> folders;
  final String? selectedFolderId;
  final int totalCount;
  final ValueChanged<String?> onSelect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surfaceContainerLow,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text(
                '文件夹',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('全部素材'),
              trailing: Text('$totalCount'),
              selected: selectedFolderId == null,
              onTap: () => onSelect(null),
            ),
            const Divider(height: 1),
            Expanded(
              child: folders.isEmpty
                  ? const Center(child: Text('暂无文件夹'))
                  : ListView(
                      children: [
                        for (final folder in folders) ..._tiles(folder, 0, theme),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _tiles(MobileFolder folder, int depth, ThemeData theme) {
    final selected = selectedFolderId == folder.id;
    return [
      ListTile(
        contentPadding: EdgeInsets.only(left: 16.0 + depth * 16, right: 16),
        leading: Icon(selected ? Icons.folder : Icons.folder_outlined),
        title: Text(folder.name),
        trailing: Text('${folder.itemCount}'),
        selected: selected,
        onTap: () => onSelect(folder.id),
      ),
      for (final child in folder.children) ..._tiles(child, depth + 1, theme),
    ];
  }
}
