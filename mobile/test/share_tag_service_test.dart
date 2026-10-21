import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:bowerbird_mobile/widgets/share_tag_badge.dart';
import 'package:bowerbird_mobile/services/share_tag_service.dart';

void main() {
  const helloHash =
      '2CF24DBA5FB0A30E26E83B2AC5B9E29E1B161E5C1FA7425E73043362938B9824';
  final idA = 'A' * 64;
  final idB = 'B' * 64;
  final idC = 'C' * 64;

  group('share item hashing', () {
    test('matches the known SHA-256 vector in uppercase hex', () {
      expect(ShareTagService.hashBytes(utf8.encode('hello')), helloHash);
    });

    test('streams a file and returns null for missing files', () async {
      final root = await Directory.systemTemp.createTemp('share_hash_');
      addTearDown(() => root.delete(recursive: true));
      final file = File('${root.path}/sample.bin');
      await file.writeAsBytes(utf8.encode('hello'));

      expect(await ShareTagService.hashFile(file.path), helloHash);
      expect(
        await ShareTagService.hashFile('${root.path}/missing.bin'),
        isNull,
      );
    });
  });

  group('ShareTagStore', () {
    late Directory root;

    setUp(() async {
      root = await Directory.systemTemp.createTemp('share_tags_');
    });

    tearDown(() async {
      if (await root.exists()) await root.delete(recursive: true);
    });

    test('persists markers and isolates them by library', () async {
      final store = ShareTagStore(root: root);
      await store.load();

      expect(await store.add(idA, 'library-a', sharedAt: 100), isTrue);
      expect(store.contains(idA, 'library-a'), isTrue);
      expect(store.contains(idA.toLowerCase(), 'library-a'), isTrue);
      expect(store.contains(idA, 'library-b'), isFalse);

      final reloaded = ShareTagStore(root: root);
      await reloaded.load();
      expect(reloaded.contains(idA, 'library-a'), isTrue);
      expect(reloaded.marks.single.sharedAt, 100);

      expect(await reloaded.remove(idA, 'library-a'), isTrue);
      expect(reloaded.contains(idA, 'library-a'), isFalse);

      final empty = ShareTagStore(root: root);
      await empty.load();
      expect(empty.marks, isEmpty);
    });

    test('rejects malformed IDs and deduplicates records', () async {
      final store = ShareTagStore(root: root);
      await store.load();

      expect(await store.add('not-a-hash', 'library-a'), isFalse);
      expect(await store.add('G' * 64, 'library-a'), isFalse);
      expect(await store.add(idA, ''), isFalse);

      await store.add(idA, 'library-a', sharedAt: 100);
      await store.add(idA, 'library-a', sharedAt: 200);
      expect(store.marks, hasLength(1));
      expect(store.marks.single.sharedAt, 200);
    });

    test('keeps only the newest markers when the cap is exceeded', () async {
      final store = ShareTagStore(root: root, maxMarks: 2);
      await store.load();

      await store.add(idA, 'library-a', sharedAt: 100);
      await store.add(idB, 'library-a', sharedAt: 200);
      await store.add(idC, 'library-a', sharedAt: 300);

      expect(store.marks, hasLength(2));
      expect(store.contains(idA, 'library-a'), isFalse);
      expect(store.contains(idB, 'library-a'), isTrue);
      expect(store.contains(idC, 'library-a'), isTrue);
    });

    test('starts empty when the marker file is corrupt', () async {
      await File('${root.path}/share_tags.json').writeAsString('{oops');
      final store = ShareTagStore(root: root);
      await store.load();
      expect(store.marks, isEmpty);

      expect(await store.add(idA, 'library-a'), isTrue);
      final reloaded = ShareTagStore(root: root);
      await reloaded.load();
      expect(reloaded.contains(idA, 'library-a'), isTrue);
    });

    test('drops invalid rows while loading a hand-edited file', () async {
      await File('${root.path}/share_tags.json').writeAsString(
        jsonEncode({
          'version': 1,
          'marks': [
            {'id': 'short', 'library': 'library-a', 'sharedAt': 1},
            {'id': idA, 'library': '', 'sharedAt': 1},
            {'id': idA, 'library': 'library-a', 'sharedAt': 1},
            {'id': idA, 'library': 'library-a', 'sharedAt': 2},
          ],
        }),
      );

      final store = ShareTagStore(root: root);
      await store.load();
      expect(store.marks, hasLength(1));
      expect(store.marks.single.itemId, idA);
    });
  });

  testWidgets('share badge renders its icon and label', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: Center(child: ShareTagBadge())),
      ),
    );

    expect(find.text('分享'), findsOneWidget);
    expect(find.byIcon(Icons.ios_share), findsOneWidget);
  });
}
