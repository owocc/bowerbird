import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/item.dart';
import 'api_items.dart';
import 'api_service.dart';
import 'item_query.dart';

/// 素材详情、侧边栏统计、以及标签 / 文件夹 / 颜色等元数据接口。
extension ApiMetadata on ApiService {
  Future<ItemDetail> getItemDetail(String id) async {
    if (baseUrl == null) {
      throw Exception('Base URL is not configured');
    }

    final uri = Uri.parse('$baseUrl/api/v1/items/$id');
    final response = await http.get(uri, headers: authHeaders).timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      final data = json['data'] as Map<String, dynamic>? ?? json;
      return ItemDetail.fromJson(data);
    } else {
      throw Exception('Failed to load item detail: HTTP ${response.statusCode}');
    }
  }

  /// Sidebar aggregates: total / untagged / uncategorized / trash counts.
  ///
  /// Falls back to counting via queries when the desktop build does not expose
  /// `/api/v1/stats`, so older desktop versions keep working.
  Future<LibraryStats> getStats() async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    final uri = Uri.parse('$baseUrl/api/v1/stats');
    try {
      final response = await http.get(uri, headers: authHeaders).timeout(const Duration(seconds: 15));
      if (response.statusCode == 200) {
        final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
        return LibraryStats.fromJson(json);
      }
      if (response.statusCode == 401) {
        throw Exception('Unauthorized: please reconnect or re-pair with desktop');
      }
    } catch (_) {
      // fall through to the query-based fallback
    }

    final results = await Future.wait([
      queryItems(query: const ItemQuery(), limit: 1),
      queryItems(query: const ItemQuery(uncategorized: true), limit: 1),
      queryItems(query: const ItemQuery(untagged: true), limit: 1),
    ]);
    return LibraryStats(
      total: results[0].total,
      uncategorizedCount: results[1].total,
      untaggedCount: results[2].total,
      trashCount: 0,
    );
  }

  /// Loads one page of a virtual collection (`trash` / `untagged` /
  /// `uncategorized`). Trash is served by a dedicated endpoint because those
  /// items live outside the query engine.
  Future<({int total, List<MobileItem> items})> getCollectionItems({
    required LibraryCollection collection,
    int limit = 60,
    int offset = 0,
  }) async {
    if (collection == LibraryCollection.trash) {
      if (baseUrl == null) throw Exception('Base URL is not configured');
      final uri = Uri.parse('$baseUrl/api/v1/items/collection').replace(
        queryParameters: {
          'name': collection.slug,
          'limit': limit.toString(),
          'offset': offset.toString(),
        },
      );
      final response = await http.get(uri, headers: authHeaders).timeout(const Duration(seconds: 15));
      if (response.statusCode == 200) {
        return decodeItemsPage(response);
      }
      if (response.statusCode == 401) {
        throw Exception('Unauthorized: please reconnect or re-pair with desktop');
      }
      throw Exception('Failed to load collection: HTTP ${response.statusCode}');
    }

    return queryItems(
      query: ItemQuery(
        untagged: collection == LibraryCollection.untagged,
        uncategorized: collection == LibraryCollection.uncategorized,
      ),
      limit: limit,
      offset: offset,
    );
  }

  Future<List<MobileTag>> getTags() async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    final uri = Uri.parse('$baseUrl/api/v1/tags');
    final response = await http.get(uri, headers: authHeaders).timeout(const Duration(seconds: 10));
    if (response.statusCode == 200) {
      final list = jsonDecode(utf8.decode(response.bodyBytes)) as List<dynamic>? ?? [];
      return list.map((e) => MobileTag.fromJson(e as Map<String, dynamic>)).toList();
    }
    return [];
  }

  Future<void> addTagToItem(String itemId, String tag) async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    final uri = Uri.parse('$baseUrl/api/v1/items/$itemId/tags');
    final response = await http
        .post(uri, headers: authHeaders, body: jsonEncode({'tag': tag}))
        .timeout(const Duration(seconds: 10));
    if (response.statusCode != 200) {
      throw Exception('添加标签失败: HTTP ${response.statusCode}');
    }
  }

  Future<void> addItemToFolder(String itemId, String folderId) async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    final uri = Uri.parse('$baseUrl/api/v1/items/$itemId/folders');
    final response = await http
        .post(uri, headers: authHeaders, body: jsonEncode({'folderId': folderId}))
        .timeout(const Duration(seconds: 10));
    if (response.statusCode != 200) {
      throw Exception('添加到文件夹失败: HTTP ${response.statusCode}');
    }
  }

  Future<List<MobileFolder>> getFolders() async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    final uri = Uri.parse('$baseUrl/api/v1/folders');
    final response = await http.get(uri, headers: authHeaders).timeout(const Duration(seconds: 10));
    if (response.statusCode == 200) {
      final list = jsonDecode(utf8.decode(response.bodyBytes)) as List<dynamic>? ?? [];
      return list.map((e) => MobileFolder.fromJson(e as Map<String, dynamic>)).toList();
    }
    return [];
  }

  Future<List<String>> getColors() async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    final uri = Uri.parse('$baseUrl/api/v1/colors');
    final response = await http.get(uri, headers: authHeaders).timeout(const Duration(seconds: 10));
    if (response.statusCode == 200) {
      final list = jsonDecode(utf8.decode(response.bodyBytes)) as List<dynamic>? ?? [];
      return list.map((e) => e.toString()).toList();
    }
    return [];
  }
}
