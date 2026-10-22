import 'package:flutter_test/flutter_test.dart';
import 'package:bowerbird_mobile/services/refresh_gate.dart';

void main() {
  test('coalesces a burst of change events into one refresh', () async {
    final gate = RefreshGate(duration: const Duration(milliseconds: 50));
    var calls = 0;
    gate.schedule(() => calls++);
    gate.schedule(() => calls++);
    gate.schedule(() => calls++);

    expect(gate.isPending, isTrue);
    await Future<void>.delayed(const Duration(milliseconds: 120));
    expect(calls, 1);
    expect(gate.isPending, isFalse);
  });

  test('cancel drops a pending refresh', () async {
    final gate = RefreshGate(duration: const Duration(milliseconds: 50));
    var calls = 0;
    gate.schedule(() => calls++);
    gate.cancel();
    await Future<void>.delayed(const Duration(milliseconds: 90));
    expect(calls, 0);
  });
}
