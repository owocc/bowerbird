import 'package:flutter/material.dart';

import '../../inbox_screen.dart';

/// 「更多」菜单项的响应分发。
///
/// 菜单项由 `header_action_pill.dart` 的 `pageMenuItems` 生成，两者的
/// value 字符串必须保持一致；放在这里让页面少一个 switch。
class HomeMenuActions {
  const HomeMenuActions._();

  static void handle(
    String value, {
    required BuildContext context,
    required VoidCallback onRefresh,
    required VoidCallback onFilter,
    required VoidCallback onEmptyTrash,
    required VoidCallback onDisconnect,
  }) {
    switch (value) {
      case 'refresh':
        onRefresh();
      case 'filter':
        onFilter();
      case 'inbox':
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const InboxScreen()));
      case 'emptyTrash':
        onEmptyTrash();
      case 'disconnect':
        onDisconnect();
    }
  }
}
