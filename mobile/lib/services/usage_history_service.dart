import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 「使用历史」：记录从资料库里使用过（分享/导出）的素材，最近使用的在前。
///
/// 对应桌面端的 `drag-history`（拖出即记录），移动端没有拖拽，因此以
/// 「分享素材」作为使用动作。
class UsageHistoryService {
  UsageHistoryService._();
  static final UsageHistoryService instance = UsageHistoryService._();

  static const _key = 'bowerbird_usage_history';
  static const int _maxEntries = 500;
  final _storage = const FlutterSecureStorage();

  List<String>? _cache;

  Future<List<String>> ids() async {
    final cached = _cache;
    if (cached != null) return cached;
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null || raw.isEmpty) {
        _cache = const [];
        return _cache!;
      }
      final list = jsonDecode(raw) as List<dynamic>;
      _cache = list.map((e) => e.toString()).where((e) => e.isNotEmpty).toList();
    } catch (_) {
      _cache = const [];
    }
    return _cache!;
  }

  Future<void> record(String itemId) async {
    if (itemId.isEmpty) return;
    final current = List<String>.from(await ids());
    current
      ..remove(itemId)
      ..insert(0, itemId);
    if (current.length > _maxEntries) {
      current.removeRange(_maxEntries, current.length);
    }
    _cache = current;
    await _storage.write(key: _key, value: jsonEncode(current));
  }

  Future<void> clear() async {
    _cache = const [];
    await _storage.delete(key: _key);
  }
}
