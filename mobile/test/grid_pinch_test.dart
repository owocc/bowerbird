import 'package:flutter/gestures.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:bowerbird_mobile/controllers/pinch_zoom_controller.dart';

/// 构造一个指定坐标的 down 事件。
PointerDownEvent _down(int id, Offset pos) =>
    PointerDownEvent(pointer: id, position: pos);

PointerMoveEvent _move(int id, Offset pos) =>
    PointerMoveEvent(pointer: id, position: pos);

PointerUpEvent _up(int id, Offset pos) =>
    PointerUpEvent(pointer: id, position: pos);

void main() {
  group('档位换算', () {
    test('张开手指（ratio > 1）返回正步数，即放大', () {
      final c = PinchZoomController();
      expect(c.stepsForRatio(1.10), 1);
      expect(c.stepsForRatio(1.25), 3);
    });

    test('收拢手指（ratio < 1）返回负步数，即缩小', () {
      final c = PinchZoomController();
      expect(c.stepsForRatio(0.90), -1);
      expect(c.stepsForRatio(0.80), -2);
    });

    test('小于 8% 的变化不换档（滞回，避免抖动）', () {
      final c = PinchZoomController();
      expect(c.stepsForRatio(1.05), 0);
      expect(c.stepsForRatio(0.95), 0);
    });

    test('浮点边界：恰好 8% 也能换档（0.92 不被截断为 0）', () {
      final c = PinchZoomController();
      expect(c.stepsForRatio(0.92), -1);
      expect(c.stepsForRatio(1.08), 1);
    });

    test('countForSpanRatio 给出期望列数', () {
      final c = PinchZoomController(); // 默认 3 列
      expect(c.countForSpanRatio(1.10), 2); // 放大 -> 列数减少
      expect(c.countForSpanRatio(0.90), 4); // 缩小 -> 列数增加
    });
  });

  group('指针手势', () {
    test('单指不会进入缩放', () {
      final c = PinchZoomController();
      c.handlePointerDown(_down(1, const Offset(100, 100)));
      expect(c.isPinching, isFalse);
      c.handlePointerUp(_up(1, const Offset(100, 100)));
      expect(c.isPinching, isFalse);
    });

    test('第二根手指落下立即进入缩放', () {
      final c = PinchZoomController();
      c.handlePointerDown(_down(1, const Offset(100, 100)));
      c.handlePointerDown(_down(2, const Offset(200, 100)));
      expect(c.isPinching, isTrue);
      expect(c.debugCurrentSpan, closeTo(100, 0.01));
    });

    test('张开双指减少列数（放大）', () {
      final c = PinchZoomController(); // 3 列
      c.handlePointerDown(_down(1, const Offset(100, 100)));
      c.handlePointerDown(_down(2, const Offset(200, 100)));
      // 间距从 100 拉到 120 => ratio 1.2 => 2 档
      c.handlePointerMove(_move(1, const Offset(90, 100)));
      c.handlePointerMove(_move(2, const Offset(210, 100)));
      expect(c.crossAxisCount, 2);
    });

    test('收拢双指增加列数（缩小）', () {
      final c = PinchZoomController(); // 3 列
      c.handlePointerDown(_down(1, const Offset(100, 100)));
      c.handlePointerDown(_down(2, const Offset(200, 100)));
      // 间距从 100 收到 80 => ratio 0.8 => -2 档
      c.handlePointerMove(_move(1, const Offset(110, 100)));
      c.handlePointerMove(_move(2, const Offset(190, 100)));
      expect(c.crossAxisCount, 5);
    });

    test('抬起一根手指即结束缩放', () {
      final c = PinchZoomController();
      c.handlePointerDown(_down(1, const Offset(100, 100)));
      c.handlePointerDown(_down(2, const Offset(200, 100)));
      expect(c.isPinching, isTrue);
      c.handlePointerUp(_up(2, const Offset(200, 100)));
      expect(c.isPinching, isFalse);
    });

    test('列数被钳制在 2~5', () {
      final c = PinchZoomController();
      c.handlePointerDown(_down(1, const Offset(100, 100)));
      c.handlePointerDown(_down(2, const Offset(200, 100)));
      // 极端张开也不会小于 2
      c.handlePointerMove(_move(1, const Offset(0, 100)));
      c.handlePointerMove(_move(2, const Offset(400, 100)));
      expect(c.crossAxisCount, 2);
      expect(c.atMin, isTrue);
    });

    test('状态变化会通知监听者', () {
      final c = PinchZoomController();
      var calls = 0;
      c.addListener(() => calls++);
      c.handlePointerDown(_down(1, const Offset(100, 100)));
      c.handlePointerDown(_down(2, const Offset(200, 100)));
      expect(calls, greaterThan(0));
      c.dispose();
    });
  });
}
