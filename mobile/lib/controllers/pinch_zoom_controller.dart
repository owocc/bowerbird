import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';

/// 双指缩放（网格密度）手势控制器。
///
/// 在**指针层**接管而不是用 `GestureDetector.onScale*`：后者需要赢下手势
/// 竞技场，而滚动列表往往先赢，导致捏合很难触发。这里只要数到两根手指就
/// 立即接管，与相册类应用一致（缩放优先于滚动）。
///
/// 逻辑与 UI 解耦：只维护列数与"是否正在捏合"，
/// 由外层 `WidgetsBindingObserver` 无关的 widget 监听 [notifyListeners] 重绘。
class PinchZoomController extends ChangeNotifier {
  PinchZoomController({
    int initialCrossAxisCount = 3,
    this.minCrossAxisCount = 2,
    this.maxCrossAxisCount = 5,
    this.stepThreshold = 0.08,
  }) : _crossAxisCount = initialCrossAxisCount {
    assert(minCrossAxisCount >= 2 && maxCrossAxisCount >= minCrossAxisCount);
  }

  final int minCrossAxisCount;
  final int maxCrossAxisCount;

  /// 触发换档所需的比例变化（8%），配合离散档位形成滞回。
  final double stepThreshold;

  /// 浮点误差容差：避免 0.92 被算成 -0.9999 而截断为 0 档。
  static const double _epsilon = 1e-6;

  int _crossAxisCount;
  int get crossAxisCount => _crossAxisCount;

  final Set<int> _activePointers = {};
  final Map<int, Offset> _pointerPositions = {};
  double? _pinchStartSpan;
  int _pinchAppliedSteps = 0;

  bool _isPinching = false;

  /// 捏合进行中为 true。外层据此冻结列表滚动。
  bool get isPinching => _isPinching;

  void handlePointerDown(PointerDownEvent event) {
    _activePointers.add(event.pointer);
    _pointerPositions[event.pointer] = event.position;
    // 第二根手指一落下就进入缩放
    if (_activePointers.length >= 2) _beginPinch();
  }

  void handlePointerMove(PointerMoveEvent event) {
    _pointerPositions[event.pointer] = event.position;
    if (!_isPinching || _activePointers.length < 2) return;

    final startSpan = _pinchStartSpan;
    if (startSpan == null || startSpan <= 0) return;
    final span = _currentPointerSpan();
    if (span <= 0) return;

    // 张开（span 变大）=> 放大 => 列数减少；收拢 => 列数增加
    final steps = stepsForRatio(span / startSpan);
    if (steps == _pinchAppliedSteps) return;
    _pinchAppliedSteps = steps;

    final next =
        (_crossAxisCount - steps).clamp(minCrossAxisCount, maxCrossAxisCount).toInt();
    if (next != _crossAxisCount) {
      _crossAxisCount = next;
      notifyListeners();
    }
  }

  void handlePointerUp(PointerEvent event) {
    _activePointers.remove(event.pointer);
    _pointerPositions.remove(event.pointer);
    if (_activePointers.length < 2) _endPinch();
  }

  /// 供测试直接注入列数。
  void setCrossAxisCount(int value) {
    final next = value.clamp(minCrossAxisCount, maxCrossAxisCount).toInt();
    if (next == _crossAxisCount) return;
    _crossAxisCount = next;
    notifyListeners();
  }

  /// 把比例换算成档位步数（正数表示放大）。
  int stepsForRatio(double ratio) {
    final raw = (ratio - 1) / stepThreshold;
    final sign = raw >= 0 ? 1 : -1;
    return (raw.abs() + _epsilon).floor() * sign;
  }

  void _beginPinch() {
    if (_isPinching) return;
    _isPinching = true;
    _pinchAppliedSteps = 0;
    _pinchStartSpan = _currentPointerSpan();
    notifyListeners();
  }

  void _endPinch() {
    if (!_isPinching) return;
    _isPinching = false;
    _pinchStartSpan = null;
    _pinchAppliedSteps = 0;
    notifyListeners();
  }

  double _currentPointerSpan() {
    final positions = _activePointers
        .map((id) => _pointerPositions[id])
        .whereType<Offset>()
        .toList();
    if (positions.length < 2) return 0;
    return (positions[0] - positions[1]).distance;
  }

  /// 当前双指间距（测试用）。
  double get debugCurrentSpan => _currentPointerSpan();

  /// 已应用的档位步数（测试用）。
  int get debugAppliedSteps => _pinchAppliedSteps;

  /// 缩放下限/上限的便利判断。
  bool get atMin => _crossAxisCount <= minCrossAxisCount;
  bool get atMax => _crossAxisCount >= maxCrossAxisCount;

  /// 把两指距离比例换算成期望列数，便于测试与调试。
  int countForSpanRatio(double ratio) =>
      (_crossAxisCount - stepsForRatio(ratio))
          .clamp(minCrossAxisCount, maxCrossAxisCount)
          .toInt();

  @override
  String toString() =>
      'PinchZoomController(crossAxis: $_crossAxisCount, pinching: $_isPinching)';
}

/// 便于在测试里构造一个只含两点的距离。
double spanBetween(Offset a, Offset b) => math.sqrt(
      math.pow(a.dx - b.dx, 2) + math.pow(a.dy - b.dy, 2),
    );
