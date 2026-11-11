import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pererecario/main.dart';

void main() {
  testWidgets('the visual catalog shows the app title', (tester) async {
    await tester.pumpWidget(const VisualDemo());
    expect(find.text('Pererecário • coleção visual'), findsOneWidget);
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
