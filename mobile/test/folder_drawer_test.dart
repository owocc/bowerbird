import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:bowerbird_mobile/models/item.dart';
import 'package:bowerbird_mobile/widgets/folder_drawer.dart';
import 'package:bowerbird_mobile/theme/app_theme.dart';
import 'package:bowerbird_mobile/widgets/tabler_icons.dart';

MobileFolder _folder(String id, String name, int count, [List<MobileFolder> children = const []]) {
  return MobileFolder(id: id, name: name, parentId: '', itemCount: count, children: children);
}

Widget _host({
  required SidebarView view,
  String? selectedFolderId,
  List<MobileFolder> folders = const [],
  ValueChanged<SidebarView>? onCollection,
  ValueChanged<String?>? onFolder,
}) {
  return MaterialApp(
    home: Scaffold(
      body: SizedBox(
        width: 360,
        height: 720,
        child: FolderDrawer(
          folders: folders,
          view: view,
          selectedFolderId: selectedFolderId,
          stats: const LibraryStats(
            total: 12,
            untaggedCount: 3,
            uncategorizedCount: 4,
            trashCount: 5,
          ),
          historyCount: 2,
          onSelectCollection: onCollection ?? (_) {},
          onSelectFolder: onFolder ?? (_) {},
          libraryName: 'Demo Library',
          onSwitchLibrary: () {},
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('通用集合不带分组标题，且文件夹标题紧跟文件夹列表', (tester) async {
    await tester.pumpWidget(_host(
      view: SidebarView.all,
      folders: [_folder('f1', '项目', 2)],
    ));
    await tester.pumpAndSettle();

    // 五个通用集合
    for (final label in ['全部素材', '未打标签', '未分类', '使用历史', '废纸篓']) {
      expect(find.text(label), findsOneWidget, reason: '缺少 $label');
    }
    // 集合区之前不应出现「文件夹」分组标题 —— 它只属于文件夹列表
    final folderLabel = tester.getTopLeft(find.text('文件夹'));
    final allLabel = tester.getTopLeft(find.text('全部素材'));
    final folderRow = tester.getTopLeft(find.text('项目'));
    expect(folderLabel.dy, greaterThan(allLabel.dy));
    expect(folderRow.dy, greaterThan(folderLabel.dy));

    // 集合图标使用 Tabler 矢量图标
    expect(find.byType(TablerIcon), findsNWidgets(5));
  });

  testWidgets('计数来自 stats', (tester) async {
    await tester.pumpWidget(_host(view: SidebarView.all));
    await tester.pumpAndSettle();

    expect(find.text('12'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.text('5'), findsOneWidget);
    expect(find.text('2'), findsOneWidget); // 使用历史
  });

  testWidgets('点击通用集合与文件夹分别回调', (tester) async {
    SidebarView? collection;
    String? folderId;
    await tester.pumpWidget(_host(
      view: SidebarView.all,
      folders: [_folder('f1', '项目', 2)],
      onCollection: (v) => collection = v,
      onFolder: (id) => folderId = id,
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('废纸篓'));
    expect(collection, SidebarView.trash);

    await tester.tap(find.text('项目'));
    expect(folderId, 'f1');
  });

  testWidgets('文件夹视图高亮当前文件夹而不是集合', (tester) async {
    await tester.pumpWidget(_host(
      view: SidebarView.folder,
      selectedFolderId: 'f1',
      folders: [_folder('f1', '项目', 2)],
    ));
    await tester.pumpAndSettle();

    final allTile = tester.widget<ListTile>(
      find.ancestor(of: find.text('全部素材'), matching: find.byType(ListTile)),
    );
    final folderTile = tester.widget<ListTile>(
      find.ancestor(of: find.text('项目'), matching: find.byType(ListTile)),
    );
    expect(allTile.selected, isFalse);
    expect(folderTile.selected, isTrue);
  });

  testWidgets('侧边栏保持页面原色（不使用浮层次级色）', (tester) async {
    for (final theme in [AppTheme.light(), AppTheme.dark()]) {
      await tester.pumpWidget(MaterialApp(
        theme: theme,
        home: Scaffold(
          body: SizedBox(
            width: 360,
            height: 720,
            child: FolderDrawer(
              folders: const [],
              view: SidebarView.all,
              selectedFolderId: null,
              stats: const LibraryStats(),
              historyCount: 0,
              onSelectCollection: (_) {},
              onSelectFolder: (_) {},
              libraryName: 'Demo',
              onSwitchLibrary: () {},
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      // 抽屉自身是 FolderDrawer 下第一层 Material
      final drawerMaterial = tester.widget<Material>(
        find.descendant(
          of: find.byType(FolderDrawer),
          matching: find.byType(Material),
        ).first,
      );
      expect(drawerMaterial.color, theme.colorScheme.surface);
    }
  });
}
