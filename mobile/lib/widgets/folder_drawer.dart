import 'package:flutter/material.dart';

import '../models/item.dart';
import 'tabler_icons.dart';

/// 侧边栏（抽屉）当前浏览的位置。
///
/// 与桌面端 `SidebarDirectoryTree` 对齐：顶部是一组「通用集合」（全部素材 /
/// 未打标签 / 未分类 / 使用历史 / 废纸篓），下方是「文件夹」列表。
enum SidebarView {
  all,
  untagged,
  uncategorized,
  history,
  trash,
  folder;

  bool get isCollection => this != SidebarView.folder;
}

class FolderDrawer extends StatefulWidget {
  const FolderDrawer({
    super.key,
    required this.folders,
    required this.view,
    required this.selectedFolderId,
    required this.stats,
    required this.historyCount,
    required this.onSelectCollection,
    required this.onSelectFolder,
    required this.libraryName,
    required this.onSwitchLibrary,
    this.onSearch,
  });

  final List<MobileFolder> folders;
  final SidebarView view;
  final String? selectedFolderId;
  final LibraryStats stats;
  final int historyCount;
  final ValueChanged<SidebarView> onSelectCollection;
  final ValueChanged<String?> onSelectFolder;
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
      // 侧边栏保持页面本身的颜色，不使用浮层的次级色
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
              // 通用集合：不分组、不带分组标题，与桌面端一致
              _collectionRow(
                theme,
                name: TablerIconName.inbox,
                label: '全部素材',
                selected: widget.view == SidebarView.all,
                count: widget.stats.total,
                onTap: () => widget.onSelectCollection(SidebarView.all),
              ),
              _collectionRow(
                theme,
                name: TablerIconName.bookmarkQuestion,
                label: '未打标签',
                selected: widget.view == SidebarView.untagged,
                count: widget.stats.untaggedCount,
                onTap: () => widget.onSelectCollection(SidebarView.untagged),
              ),
              _collectionRow(
                theme,
                name: TablerIconName.folderQuestion,
                label: '未分类',
                selected: widget.view == SidebarView.uncategorized,
                count: widget.stats.uncategorizedCount,
                onTap: () => widget.onSelectCollection(SidebarView.uncategorized),
              ),
              _collectionRow(
                theme,
                name: TablerIconName.clock,
                label: '使用历史',
                selected: widget.view == SidebarView.history,
                count: widget.historyCount,
                onTap: () => widget.onSelectCollection(SidebarView.history),
              ),
              _collectionRow(
                theme,
                name: TablerIconName.trash,
                label: '废纸篓',
                selected: widget.view == SidebarView.trash,
                count: widget.stats.trashCount,
                onTap: () => widget.onSelectCollection(SidebarView.trash),
              ),
              // 「文件夹」标题与文件夹列表放在一起，只作用于文件夹这一组
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 14, 4, 4),
                child: Row(
                  children: [
                    Text(
                      '文件夹',
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: theme.colorScheme.outline,
                      ),
                    ),
                    if (widget.folders.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      Text(
                        '${widget.folders.length}',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.outline,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Expanded(
                child: widget.folders.isEmpty
                    ? Center(
                        child: Text(
                          '暂无文件夹',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.outline,
                          ),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.only(bottom: 16),
                        itemCount: rows.length,
                        itemExtent: 48,
                        itemBuilder: (context, index) {
                          final row = rows[index];
                          final folder = row.folder;
                          final selected =
                              widget.view == SidebarView.folder && widget.selectedFolderId == folder.id;
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
                              onTap: () => widget.onSelectFolder(folder.id),
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

  Widget _collectionRow(
    ThemeData theme, {
    required TablerIconName name,
    required String label,
    required bool selected,
    required int count,
    required VoidCallback onTap,
  }) {
    return ListTile(
      dense: true,
      visualDensity: VisualDensity.compact,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
      leading: TablerIcon(
        name,
        size: 20,
        color: selected ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant,
      ),
      title: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: Text(
        '$count',
        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
      ),
      selected: selected,
      onTap: onTap,
    );
  }
}
