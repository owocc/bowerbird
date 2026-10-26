import 'package:flutter/material.dart';

import '../../dialogs/home_dialogs.dart';
import '../../search_screen.dart';

/// 主界面的页面跳转与弹层入口。
///
/// 集中在这一处，页面只写 `HomeNavigation.openSearch(context)`，
/// 也避免了每个文件各自 import 一堆 screen。
class HomeNavigation {
  const HomeNavigation._();

  static void openSearch(BuildContext context) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SearchScreen()));
  }

  /// 弹出资源库选择；发生切换时调用 [onSwitched]。
  static Future<void> pickLibrary(
    BuildContext context, {
    required VoidCallback onSwitched,
  }) async {
    final switched = await HomeDialogs.showLibraryPicker(context);
    if (switched == true && context.mounted) onSwitched();
  }
}
