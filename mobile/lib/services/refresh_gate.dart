import 'dart:async';

/// Coalesces bursts of change notifications into a single refresh.
class RefreshGate {
  RefreshGate({this.duration = const Duration(milliseconds: 350)});

  final Duration duration;
  Timer? _timer;

  void schedule(void Function() action) {
    _timer?.cancel();
    _timer = Timer(duration, action);
  }

  void cancel() {
    _timer?.cancel();
    _timer = null;
  }

  bool get isPending => _timer?.isActive ?? false;
}
