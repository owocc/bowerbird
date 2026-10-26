import 'package:intl/intl.dart';

import '../models/item.dart';

/// 按「月份 yyyy」把素材分组，保持输入顺序。
///
/// 单独抽出来的原因：分组规则只和数据结构有关，与 UI 无关，
/// 也方便单测（见 test/group_items_test.dart）。
Map<String, List<MobileItem>> groupItemsByMonth(
  List<MobileItem> items, {
  DateFormat? formatter,
}) {
  final format = formatter ?? DateFormat('MMMM yyyy');
  final groups = <String, List<MobileItem>>{};
  for (final item in items) {
    final key = format.format(item.dateTime);
    (groups[key] ??= <MobileItem>[]).add(item);
  }
  return groups;
}
