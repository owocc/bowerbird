import 'package:flutter/material.dart';
import '../models/item.dart';

class FolderDrawer extends StatefulWidget {
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
  State<FolderDrawer> createState() => _FolderDrawerState();
}

class _VisibleRow {
  const _VisibleRow({required this.folder, required this.depth});
  final MobileFolder folder;
  final int depth;
}

class _FolderDrawerState extends State<FolderDrawer> {
  final Set<String> _expandedIds = {};

  @override
  void initState() {
    super.initState();
    _expandAncestorsOfSelected();
  }

  @override
  void didUpdateWidget(covariant FolderDrawer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedFolderId != widget.selectedFolderId ||
        !identical(oldWidget.folders, widget.folders)) {
      _expandAncestorsOfSelected();
    }
  }

  void _expandAncestorsOfSelected() {
    final selectedId = widget.selectedFolderId;
    if (selectedId == null) return;
    bool walk(MobileFolder node, List<String> ancestors) {
      if (node.id == selectedId) {
        _expandedIds.addAll(ancestors);
        return true;
      }
      for (final child in node.children) {
        if (walk(child, [...ancestors, node.id])) return true;
      }
      return false;
    }

    for (final root in widget.folders) {
      if (walk(root, const [])) break;
    }
  }

  List<_VisibleRow> _visibleRows() {
    final rows = <_VisibleRow>[];
    void visit(MobileFolder folder, int depth) {
      rows.add(_VisibleRow(folder: folder, depth: depth));
      if (folder.children.isEmpty || !_expandedIds.contains(folder.id)) return;
      for (final child in folder.children) {
        visit(child, depth + 1);
      }
    }

    for (final root in widget.folders) {
      visit(root, 0);
    }
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rows = _visibleRows();
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
                      child: InkWell(
                        borderRadius: BorderRadius.circular(10),
                        onTap: widget.onSwitchLibrary,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                          child: Row(
                            children: [
                              Flexible(
                                child: Text(
                                  widget.libraryName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.titleMedium,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Icon(
                                Icons.keyboard_arrow_down,
                                color: theme.colorScheme.onSurface,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: '搜索',
                      onPressed: widget.onSearch,
                      icon: const Icon(Icons.search),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
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
                trailing: Text('${widget.totalCount}'),
                selected: widget.selectedFolderId == null,
                onTap: () => widget.onSelect(null),
              ),
              Expanded(
                child: widget.folders.isEmpty
                    ? const Center(child: Text('暂无文件夹'))
                    : ListView.builder(
                        padding: const EdgeInsets.only(bottom: 16),
                        itemCount: rows.length,
                        itemExtent: 48,
                        itemBuilder: (context, index) {
                          final row = rows[index];
                          final folder = row.folder;
                          final selected = widget.selectedFolderId == folder.id;
                          final hasChildren = folder.children.isNotEmpty;
                          final expanded = _expandedIds.contains(folder.id);
                          return Padding(
                            padding: EdgeInsets.only(left: row.depth * 16.0),
                            child: ListTile(
                              dense: true,
                              visualDensity: VisualDensity.compact,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                              leading: Icon(
                                selected ? Icons.folder : Icons.folder_outlined,
                                size: 20,
                              ),
                              title: Text(
                                folder.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              selected: selected,
                              trailing: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text('${folder.itemCount}'),
                                  if (hasChildren)
                                    IconButton(
                                      visualDensity: VisualDensity.compact,
                                      tooltip: expanded ? '折叠' : '展开',
                                      onPressed: () {
                                        setState(() {
                                          if (expanded) {
                                            _expandedIds.remove(folder.id);
                                          } else {
                                            _expandedIds.add(folder.id);
                                          }
                                        });
                                      },
                                      icon: Icon(
                                        expanded ? Icons.expand_more : Icons.chevron_right,
                                        size: 20,
                                      ),
                                    ),
                                ],
                              ),
                              onTap: () => widget.onSelect(folder.id),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
