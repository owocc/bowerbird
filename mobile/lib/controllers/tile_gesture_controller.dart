import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';

/// 列表条目的手势判定状态机。
///
/// 规则（全部在**手指抬起**时判定，避免滚动时误触）：
///  · 点按             → 打开详情 / 废纸篓里点按 = 恢复
///  · 长按后不动松手   → 进入多选
///  · 长按后上滑松手   → 打开快速操作
///
/// 只维护状态，具体动作由页面在 [end] 的返回值上执行。
class TileGestureController extends ChangeNotifier {
  TileGestureController({this.swipeThreshold = 16});

  /// 判定为上滑所需的最小位移（逻辑像素）。
  final double swipeThreshold;

  String? _pressedItemId;
  Offset? _origin;
  bool _active = false;
  bool _swipedUp = false;

  final Set<String> _selectedIds = {};
  bool _previewOpening = false;

  /// 当前多选的条目 id。
  Set<String> get selectedIds => _selectedIds;
  bool get hasSelection => _selectedIds.isNotEmpty;

  /// 快速操作预览是否正在打开（防重入）。
  bool get previewOpening => _previewOpening;

  /// 切换某条目的选中状态。
  void toggleSelected(String itemId) {
    if (!_selectedIds.remove(itemId)) _selectedIds.add(itemId);
    notifyListeners();
  }

  void clearSelection() {
    if (_selectedIds.isEmpty) return;
    _selectedIds.clear();
    notifyListeners();
  }

  /// 开始/结束预览，返回是否成功占用（用于防重入）。
  bool beginPreview() {
    if (_previewOpening) return false;
    _previewOpening = true;
    return true;
  }

  void endPreview() {
    _previewOpening = false;
  }

  /// 正在长按的条目 id（用于在格子上叠加半透明高亮）。
  String? get pressedItemId => _pressedItemId;

  /// 长按期间是否已上滑越过阈值（用于高亮反馈）。
  bool get swipedUp => _swipedUp;

  bool get isActive => _active;

  void start(String itemId, Offset localPosition) {
    _active = true;
    _pressedItemId = itemId;
    _origin = localPosition;
    _swipedUp = false;
    notifyListeners();
  }

  /// 只记录是否上滑，不在此触发任何动作。
  void move(Offset localPosition) {
    final origin = _origin;
    if (!_active || origin == null) return;
    final next = localPosition.dy - origin.dy < -swipeThreshold;
    if (next == _swipedUp) return;
    _swipedUp = next;
    notifyListeners();
  }

  /// 松手：返回本次手势应执行的动作。
  TileGestureResult end() {
    if (!_active) return TileGestureResult.none;
    final result = _swipedUp ? TileGestureResult.quickAction : TileGestureResult.select;
    reset();
    return result;
  }

  void cancel() => reset();

  void reset() {
    if (!_active && _pressedItemId == null) return;
    _active = false;
    _swipedUp = false;
    _origin = null;
    _pressedItemId = null;
    notifyListeners();
  }
}

enum TileGestureResult {
  /// 长按后上滑：打开快速操作。
  quickAction,

  /// 长按后不动：进入多选。
  select,

  /// 未构成有效手势。
  none,
}
