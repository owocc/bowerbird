import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:bowerbird_mobile/services/api_service.dart';
import 'package:bowerbird_mobile/services/item_query.dart';
import 'package:bowerbird_mobile/services/api_items.dart';

void main() {
  test('falls back to the legacy endpoint when /query is missing', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final paths = <String>[];
    server.listen((request) async {
      paths.add(request.uri.toString());
      if (request.uri.path == '/api/v1/query') {
        request.response.statusCode = HttpStatus.notFound;
        await request.response.close();
        return;
      }
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({
        'total': 1,
        'items': [
          {
            'id': 'item-1',
            'name': 'Legacy Item',
            'filename': 'legacy.jpg',
            'extension': 'jpg',
            'size': 10,
            'mimeType': 'image/jpeg',
            'importedAt': 1000,
          }
        ],
      }));
      await request.response.close();
    });

    final api = ApiService.instance;
    api.baseUrl = 'http://127.0.0.1:${server.port}';
    api.token = 'test-token';
    api.resetQueryCapability();

    try {
      final first = await api.queryItems(
        query: const ItemQuery(text: 'cat', tag: 'red', type: 'image'),
        limit: 50,
        offset: 0,
      );
      expect(first.total, 1);
      expect(first.items.single.name, 'Legacy Item');
      expect(paths.first, '/api/v1/query');
      expect(paths.last, contains('/api/v1/items'));
      expect(paths.last, contains('q=cat'));
      expect(paths.last, contains('tag=red'));
      expect(paths.last, contains('type=image'));

      final second = await api.queryItems(query: const ItemQuery(), limit: 10);
      expect(second.total, 1);
      expect(api.queryApiSupported, isFalse);
      expect(paths.where((p) => p.startsWith('/api/v1/query')).length, 1);
      expect(paths.last, startsWith('/api/v1/items'));
    } finally {
      api.baseUrl = null;
      api.token = null;
      api.resetQueryCapability();
      await server.close(force: true);
    }
  });
}
