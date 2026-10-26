import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// 复刻缩放状态机的核心换档逻辑，验证离散步进与边界钳制。
class _PinchModel {
  _PinchModel({this.count = 3, this.min = 2, this.max = 5, this.threshold = 0.08});

  int count;
  final int min;
  final int max;
  final double threshold;
  static const double epsilon = 1e-6;
  double accumulated = 1.0;

  /// 返回本次 feed 是否发生了换档。
  bool feed(double scale) {
    accumulated = scale;
    final raw = (accumulated - 1) / threshold;
    final sign = raw >= 0 ? 1 : -1;
    final steps = (raw.abs() + epsilon).floor() * sign;
    if (steps == 0) return false;
    final next = (count - steps).clamp(min, max);
    if (next == count) return false;
    count = next;
    accumulated = 1.0; // 换档后重置基准
    return true;
  }
}

void main() {
  test('张开手指（scale > 1）减少列数，即放大', () {
    final m = _PinchModel(count: 3);
    expect(m.feed(1.10), isTrue);
    expect(m.count, 2);
  });

  test('收拢手指（scale < 1）增加列数，即缩小', () {
    final m = _PinchModel(count: 3);
    expect(m.feed(0.90), isTrue);
    expect(m.count, 4);
  });

  test('小于 8% 的变化不换档（滞回，避免抖动）', () {
    final m = _PinchModel(count: 3);
    expect(m.feed(1.05), isFalse);
    expect(m.count, 3);
    expect(m.feed(0.95), isFalse);
    expect(m.count, 3);
  });

  test('换档后重置基准，可连续换多档', () {
    final m = _PinchModel(count: 3);
    expect(m.feed(1.10), isTrue);
    expect(m.count, 2);
    // 基准已重置，再给 1.10 会继续换档（但已到下限）
    expect(m.feed(1.10), isFalse);
    expect(m.count, 2);
  });

  test('列数被钳制在 2~5 之间', () {
    final m = _PinchModel(count: 5);
    m.feed(0.80);
    expect(m.count, 5, reason: '已到上限不能再缩小');
    final m2 = _PinchModel(count: 2);
    m2.feed(1.30);
    expect(m2.count, 2, reason: '已到下限不能再放大');
  });

  test('大幅捏合一次可跨多档', () {
    final m = _PinchModel(count: 4);
    m.feed(1.25); // steps = 3
    expect(m.count, 2);
  });

  test('浮点边界：恰好 8% 的收拢也能换档（0.92 不被截断为 0）', () {
    final m = _PinchModel(count: 3);
    expect(m.feed(0.92), isTrue);
    expect(m.count, 4);

    final up = _PinchModel(count: 3);
    expect(up.feed(1.08), isTrue);
    expect(up.count, 2);
  });

  testWidgets('捏合期间列表滚动被冻结', (tester) async {
    var locked = false;
    Widget build() => MaterialApp(
          home: Scaffold(
            body: ListView.builder(
              physics: locked
                  ? const NeverScrollableScrollPhysics()
                  : const AlwaysScrollableScrollPhysics(),
              itemCount: 30,
              itemBuilder: (_, i) => SizedBox(height: 100, child: Text('$i')),
            ),
          ),
        );

    await tester.pumpWidget(build());
    // 未冻结时可滚动
    await tester.drag(find.byType(ListView), const Offset(0, -200));
    await tester.pumpAndSettle();
    expect(tester.widget<ListView>(find.byType(ListView)).physics, isA<AlwaysScrollableScrollPhysics>());

    locked = true;
    await tester.pumpWidget(build());
    expect(tester.widget<ListView>(find.byType(ListView)).physics, isA<NeverScrollableScrollPhysics>());
  });
}
