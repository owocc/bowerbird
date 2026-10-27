import 'dart:async';

import 'package:flutter/widgets.dart';

import '../services/api_service.dart';
import '../services/websocket_service.dart';

/// WebSocket 订阅的集中管理。
///
/// 三个事件（资料库切换 / 条目更新 / 授权撤销）各自只做一件事，
/// 从 `HomeScreen` 抽出来后可读性更好，也方便以后加新事件。
class HomeSocketBindings {
  HomeSocketBindings({
    required this.onLibraryChanged,
    required this.onItemsUpdated,
    required this.onPairingRevoked,
  });

  final void Function(String? newName, Map<String, dynamic> payload) onLibraryChanged;
  final VoidCallback onItemsUpdated;
  final VoidCallback onPairingRevoked;

  StreamSubscription<Map<String, dynamic>>? _libSub;
  StreamSubscription<Map<String, dynamic>>? _itemsSub;
  StreamSubscription<void>? _revokedSub;

  /// 最近一次本地修改时间，用于忽略自身操作引起的回声刷新。
  DateTime lastLocalMutation = DateTime.fromMillisecondsSinceEpoch(0);

  void markLocalMutation() => lastLocalMutation = DateTime.now();

  bool get _recentlyMutated =>
      DateTime.now().difference(lastLocalMutation) < const Duration(milliseconds: 900);

  void connect() {
    WebSocketService.instance.connect();
    _libSub = WebSocketService.instance.onLibraryChanged.listen((event) {
      final data = event['data'] as Map<String, dynamic>? ?? event;
      final name = data['name'] as String?;
      if (name != null && name.isNotEmpty) {
        ApiService.instance.libraryName = name;
      }
      onLibraryChanged(name, data);
    });
    _itemsSub = WebSocketService.instance.onItemsUpdated.listen((_) {
      if (_recentlyMutated) return;
      onItemsUpdated();
    });
    _revokedSub = WebSocketService.instance.onPairingRevoked.listen((_) {
      onPairingRevoked();
    });
  }

  void dispose() {
    _libSub?.cancel();
    _itemsSub?.cancel();
    _revokedSub?.cancel();
    _libSub = null;
    _itemsSub = null;
    _revokedSub = null;
  }
}
