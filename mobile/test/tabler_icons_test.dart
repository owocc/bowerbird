import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/widgets.dart';
import 'package:bowerbird_mobile/widgets/tabler_icons.dart';

void main() {
  test('all tabler paths parse into non-empty paths inside 24x24', () {
    for (final name in TablerIconName.values) {
      final strings = tablerPathData(name);
      expect(strings, isNotEmpty, reason: '$name has no data');
      var bounds = Rect.zero;
      for (final d in strings) {
        final path = parseSvgPath(d);
        final b = path.getBounds();
        expect(b.isEmpty, isFalse, reason: '$name produced empty path for "$d"');
        bounds = bounds == Rect.zero ? b : bounds.expandToInclude(b);
      }
      expect(bounds.left, greaterThanOrEqualTo(-0.5), reason: '$name left ${bounds.left}');
      expect(bounds.top, greaterThanOrEqualTo(-0.5), reason: '$name top ${bounds.top}');
      expect(bounds.right, lessThanOrEqualTo(24.5), reason: '$name right ${bounds.right}');
      expect(bounds.bottom, lessThanOrEqualTo(24.5), reason: '$name bottom ${bounds.bottom}');
    }
  });
}
