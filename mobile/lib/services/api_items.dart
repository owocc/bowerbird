import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/item.dart';
import 'api_service.dart';
import 'item_query.dart';

/// 素材查询与分页（`/api/v1/query`、`/api/v1/items`）以及废纸篓操作。
///
/// 作为 `ApiService` 的 extension 拆分出来，避免单个文件无限增长；
/// 调用方写法不变：`ApiService.instance.queryItems(...)`。
extension ApiItems on ApiService {
  /// Executes a query through `POST /api/v1/query`, falling back to the legacy
  /// `/api/v1/items` endpoint when the desktop build does not expose it.
  Future<({int total, List<MobileItem> items})> queryItems({
    required ItemQuery query,
    String sort = 'desc',
    int limit = 100,
    int offset = 0,
  }) async {
    if (baseUrl == null) {
      throw Exception('Base URL is not configured');
    }

    if (querySupportedRaw) {
      final uri = Uri.parse('$baseUrl/api/v1/query');
      final response = await http
          .post(
            uri,
            headers: authHeaders,
            body: jsonEncode({
              'query': query.toQueryString(),
              'sort': sort,
              'offset': offset,
              'limit': limit,
            }),
          )
          .timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        querySupportedRaw = true;
        return decodeItemsPage(response);
      }
      if (response.statusCode == 404 || response.statusCode == 405) {
        querySupportedRaw = false;
      } else if (response.statusCode == 401) {
        throw Exception('Unauthorized: please reconnect or re-pair with desktop');
      } else {
        throw Exception('Query failed: HTTP ${response.statusCode}');
      }
    }

    return getItems(
      limit: limit,
      offset: offset,
      q: query.text,
      tag: query.tag,
      folder: query.folder,
      color: query.color,
      type: query.type,
      orientation: query.orientation,
    );
  }

  Future<({int total, List<MobileItem> items})> getItems({
    int limit = 60,
    int offset = 0,
    String? q,
    String? tag,
    String? folder,
    String? color,
    String? type,
    String? orientation,
  }) async {
    if (baseUrl == null) {
      throw Exception('Base URL is not configured');
    }

    final queryParams = <String, String>{
      'limit': limit.toString(),
      'offset': offset.toString(),
    };
    if (q != null && q.trim().isNotEmpty) {
      queryParams['q'] = q.trim();
    }
    if (tag != null && tag.trim().isNotEmpty) {
      queryParams['tag'] = tag.trim();
    }
    if (folder != null && folder.trim().isNotEmpty) {
      queryParams['folder'] = folder.trim();
    }
    if (color != null && color.trim().isNotEmpty) {
      queryParams['color'] = color.trim();
    }
    if (type != null && type.trim().isNotEmpty) {
      queryParams['type'] = type.trim();
    }
    if (orientation != null && orientation.trim().isNotEmpty) {
      queryParams['orientation'] = orientation.trim();
    }

    final uri = Uri.parse('$baseUrl/api/v1/items').replace(queryParameters: queryParams);
    final response = await http.get(uri, headers: authHeaders).timeout(const Duration(seconds: 15));

    if (response.statusCode == 200) {
      return decodeItemsPage(response);
    } else if (response.statusCode == 401) {
      throw Exception('Unauthorized: please reconnect or re-pair with desktop');
    } else {
      throw Exception('Failed to load items: HTTP ${response.statusCode}');
    }
  }

  /// Moves an item into the desktop recycle bin.
  Future<void> deleteItem(String id) async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    final uri = Uri.parse('$baseUrl/api/v1/items/$id');
    final response = await http
        .delete(uri, headers: authHeaders)
        .timeout(const Duration(seconds: 15));

    switch (response.statusCode) {
      case 200:
        return;
      case 401:
        throw Exception('授权失效，请重新配对');
      case 404:
        throw Exception('素材不存在或已被删除');
      case 409:
        throw Exception('该素材已在废纸篓');
      case 503:
        throw Exception('桌面端未打开资源库');
      default:
        throw Exception('删除失败: HTTP ${response.statusCode}');
    }
  }

  /// 拉取原图字节（详情页分享/下载复用）。
  Future<Uint8List> fetchOriginalBytes(String itemId) async {
    final url = getOriginalUrl(itemId);
    final response = await http
        .get(Uri.parse(url), headers: authHeaders)
        .timeout(const Duration(seconds: 30));
    if (response.statusCode != 200) {
      throw Exception('HTTP ${response.statusCode}');
    }
    return response.bodyBytes;
  }

  /// 分享已下载的字节内容（详情页用，避免重复实现文件落盘逻辑）。
  Future<void> shareBytes(Uint8List bytes, MobileItem item) async {
    final tempDir = await getTemporaryDirectory();
    final filename = item.filename.isNotEmpty ? item.filename : '${item.id}.${item.extension}';
    final file = File('${tempDir.path}/$filename');
    await file.writeAsBytes(bytes);
    await Share.shareXFiles(
      [XFile(file.path, mimeType: item.mimeType)],
      text: item.name.isNotEmpty ? item.name : item.filename,
    );
  }

}
