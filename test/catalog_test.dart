import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('the catalog has the approved 15 unique species', () {
    final data = jsonDecode(File('assets/species.json').readAsStringSync())
        as Map<String, dynamic>;
    final frogs = (data['species'] as List).cast<Map<String, dynamic>>();
    expect(frogs, hasLength(15));
    expect(frogs.map((f) => f['id']).toSet(), hasLength(15));
    expect(frogs.where((f) => f['tier'] == 'common'), hasLength(6));
    expect(frogs.where((f) => f['tier'] == 'uncommon'), hasLength(5));
    expect(frogs.where((f) => f['tier'] == 'rare'), hasLength(3));
    expect(frogs.where((f) => f['tier'] == 'special'), hasLength(1));
  });
}
