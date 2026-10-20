import 'package:flutter_test/flutter_test.dart';
import 'package:bowerbird_mobile/main.dart';

void main() {
  testWidgets('Bowerbird app smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const BowerbirdMobileApp());
    expect(find.byType(BowerbirdMobileApp), findsOneWidget);
  });
}
