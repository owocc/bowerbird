import 'package:flutter/material.dart';
import '../models/item.dart';

class FolderDrawer extends StatelessWidget {
  const FolderDrawer({
    super.key,
    required this.folders,
    required this.selectedFolderId,
    required this.totalCount,
    required this.onSelect,
    required this.libraryName,
    required this.onSwitchLibrary,
    this.onSearch,
  });

  final List<MobileFolder> folders;
  final String? selectedFolderId;
  final int totalCount;
  final ValueChanged<String?> onSelect;
  final String libraryName;
  final VoidCallback onSwitchLibrary;
  final VoidCallback? onSearch;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface,
      child: SafeArea(
        top: true,
        bottom: true,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 8, 0, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'lib切换',
                        style: theme.textTheme.titleMedium,
                      ),
                    ),
                    IconButton(
                      tooltip: '搜索',
                      onPressed: onSearch,
                      icon: const Icon(Icons.search),
                    ),
                  ],
                ),
              ),
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                leading: const Icon(Icons.swap_horiz),
                title: Text(
                  libraryName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: const Text('点击切换资源库'),
                trailing: const Icon(Icons.keyboard_arrow_down),
                onTap: onSwitchLibrary,
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
                child: Text(
                  '文件夹',
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: theme.colorScheme.outline,
                  ),
                ),
              ),
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('全部素材'),
                trailing: Text('$totalCount'),
                selected: selectedFolderId == null,
                onTap: () => onSelect(null),
              ),
              Expanded(
                child: folders.isEmpty
                    ? const Center(child: Text('暂无文件夹'))
                    : ListView(
                        padding: const EdgeInsets.only(bottom: 16),
                        children: [
                          for (final folder in folders)
                            _FolderNode(
                              folder: folder,
                              selectedFolderId: selectedFolderId,
                              onSelect: onSelect,
                              depth: 0,
                            ),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FolderNode extends StatefulWidget {
  const _FolderNode({
    required this.folder,
    required this.selectedFolderId,
    required this.onSelect,
    required this.depth,
  });

  final MobileFolder folder;
  final String? selectedFolderId;
  final ValueChanged<String?> onSelect;
  final int depth;

  @override
  State<_FolderNode> createState() => _FolderNodeState();
}

class _FolderNodeState extends State<_FolderNode> {
  late bool _expanded;

  bool _containsSelected(MobileFolder node) {
    if (node.id == widget.selectedFolderId) return true;
    return node.children.any(_containsSelected);
  }

  @override
  void initState() {
    super.initState();
    _expanded = _containsSelected(widget.folder);
  }

  @override
  Widget build(BuildContext context) {
    final folder = widget.folder;
    final selected = widget.selectedFolderId == folder.id;
    final hasChildren = folder.children.isNotEmpty;

    return Padding(
      padding: EdgeInsets.only(left: widget.depth * 12.0),
      child: Column(
        children: [
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 12),
            leading: Icon(selected ? Icons.folder : Icons.folder_outlined),
            title: Text(folder.name),
            selected: selected,
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${folder.itemCount}'),
                if (hasChildren)
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: _expanded ? '折叠' : '展开',
                    onPressed: () => setState(() => _expanded = !_expanded),
                    icon: AnimatedRotation(
                      turns: _expanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 180),
                      child: const Icon(Icons.expand_more, size: 20),
                    ),
                  ),
              ],
            ),
            onTap: () => widget.onSelect(folder.id),
          ),
          if (hasChildren)
            AnimatedCrossFade(
              duration: const Duration(milliseconds: 180),
              crossFadeState:
                  _expanded ? CrossFadeState.showFirst : CrossFadeState.showSecond,
              firstChild: Column(
                children: [
                  for (final child in folder.children)
                    _FolderNode(
                      folder: child,
                      selectedFolderId: widget.selectedFolderId,
                      onSelect: widget.onSelect,
                      depth: 1,
                    ),
                ],
              ),
              secondChild: const SizedBox(width: double.infinity),
            ),
        ],
      ),
    );
  }
}
