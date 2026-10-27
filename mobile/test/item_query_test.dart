import 'package:flutter_test/flutter_test.dart';
import 'package:bowerbird_mobile/services/item_query.dart';

void main() {
  test('未打标签 / 未分类使用 core 支持的 is: 语法', () {
    expect(const ItemQuery(untagged: true).toQueryString(), 'is:untagged');
    expect(const ItemQuery(uncategorized: true).toQueryString(), 'is:uncategorized');
  });

  test('集合条件可与筛选条件组合', () {
    final query = const ItemQuery(
      type: 'image',
      untagged: true,
      orientation: 'landscape',
    );
    expect(query.toQueryString(), 'type:image orientation:landscape is:untagged');
  });

  test('默认不含集合条件', () {
    expect(const ItemQuery().toQueryString(), '');
  });
}
