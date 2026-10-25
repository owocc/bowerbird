import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import '../models/item.dart';
import 'item_query.dart';

class ApiService {
  static final ApiService instance = ApiService._internal();
  ApiService._internal();

  static const _nativeBridge = MethodChannel('com.bowerbird.mobile/native_bridge');
  final _storage = const FlutterSecureStorage();
  static const _keyBaseUrl = 'bowerbird_base_url';
  static const _keyToken = 'bowerbird_token';
  static const _keyLibraryName = 'bowerbird_library_name';
  static const _keyHistory = 'bowerbird_history_connections';
  String? baseUrl;
  String? token;
  String? libraryName;

  /// null = not probed yet, false = desktop lacks /api/v1/query.
  bool? _querySupported;
  bool get queryApiSupported => _querySupported != false;

  /// Re-probes the capability after pairing or reconnecting.
  void resetQueryCapability() {
    _querySupported = null;
  }

  bool get isConfigured => baseUrl != null && baseUrl!.isNotEmpty;
  bool get isAuthenticated => token != null && token!.isNotEmpty;

  Future<void> init() async {
    baseUrl = await _storage.read(key: _keyBaseUrl);
    token = await _storage.read(key: _keyToken);
    libraryName = await _storage.read(key: _keyLibraryName);
  }

  Map<String, String> get authHeaders {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token != null && token!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  /// Headers for media streams (video/original bytes). No JSON content type so
  /// ExoPlayer and image decoders do not misread the request.
  Map<String, String> get mediaHeaders {
    final headers = <String, String>{'Accept': '*/*'};
    if (token != null && token!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  String formatMediaUrl(String path) {
    if (baseUrl == null) return '';
    final cleanPath = path.startsWith('/') ? path : '/$path';
    final uri = Uri.parse('$baseUrl$cleanPath');
    if (token != null && token!.isNotEmpty) {
      final queryParams = Map<String, String>.from(uri.queryParameters);
      queryParams['token'] = token!;
      return uri.replace(queryParameters: queryParams).toString();
    }
    return uri.toString();
  }

  String getThumbnailUrl(String itemId) {
    return formatMediaUrl('/api/v1/thumbs/$itemId');
  }

  String getOriginalUrl(String itemId) {
    return formatMediaUrl('/api/v1/originals/$itemId');
  }

  Future<MobileStatus> getStatus({String? targetHost}) async {
    final host = targetHost ?? baseUrl;
    if (host == null || host.isEmpty) {
      throw Exception('Target host is not configured');
    }

    final cleanHost = host.endsWith('/') ? host.substring(0, host.length - 1) : host;
    final uri = Uri.parse('$cleanHost/api/v1/status');
    final response = await http.get(uri).timeout(const Duration(seconds: 5));

    if (response.statusCode == 200) {
      final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      final status = MobileStatus.fromJson(json);
      libraryName = status.name;
      await _storage.write(key: _keyLibraryName, value: status.name);
      return status;
    } else {
      throw Exception('Failed to get status: HTTP ${response.statusCode}');
    }
  }

  Future<String> pair({
    required String host,
    required String code,
    String? deviceName,
    List<String>? candidateIps,
    int? port,
  }) async {
    final cleanHost = host.endsWith('/') ? host.substring(0, host.length - 1) : host;
    final uri = Uri.parse('$cleanHost/api/v1/pair');

    final payload = {
      'code': code.trim(),
      'deviceName': deviceName ?? 'Flutter Mobile',
    };

    http.Response response;
    try {
      response = await http.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      ).timeout(const Duration(seconds: 10));
    } on SocketException {
      throw PairingException(PairingErrorType.networkError, '网络连接失败，请检查手机与电脑是否在同一 Wi-Fi 或 Tailscale 网络');
    } on TimeoutException {
      throw PairingException(PairingErrorType.networkError, '连接电脑超时，请检查网络设置或防火墙');
    } catch (e) {
      throw PairingException(PairingErrorType.networkError, '网络请求异常: $e');
    }

    if (response.statusCode == 200) {
      final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      final data = json['data'] as Map<String, dynamic>? ?? json;
      final receivedToken = data['token'] as String?;
      if (receivedToken == null || receivedToken.isEmpty) {
        throw PairingException(PairingErrorType.unknown, '服务端未返回有效认证 Token');
      }

      baseUrl = cleanHost;
      token = receivedToken;
      resetQueryCapability();

      await _storage.write(key: _keyBaseUrl, value: baseUrl);
      await _storage.write(key: _keyToken, value: token);

      // Fetch and save active library name
      try {
        final status = await getStatus(targetHost: cleanHost);
        libraryName = status.name;
        await _storage.write(key: _keyLibraryName, value: status.name);
      } catch (_) {}

      // Save to history connections
      final parsedUri = Uri.parse(cleanHost);
      final hostPort = port ?? parsedUri.port;
      final hostIps = candidateIps ?? [parsedUri.host];
      await saveHistoryConnection(HistoryConnection(
        id: '${libraryName ?? 'Desktop'}-$hostPort',
        name: libraryName ?? 'Bowerbird Desktop',
        ips: hostIps,
        port: hostPort,
        token: receivedToken,
        lastConnectedAt: DateTime.now().millisecondsSinceEpoch,
      ));

      return receivedToken;
    } else if (response.statusCode == 401) {
      try {
        final json = jsonDecode(utf8.decode(response.bodyBytes));
        if (json is Map && (json['error'] == 'invalid_code' || json['code'] == 'invalid_code')) {
          throw PairingException(PairingErrorType.invalidCode, '连接码错误，请重新核对桌面端显示的 6 位配对码');
        }
      } catch (e) {
        if (e is PairingException) rethrow;
      }
      throw PairingException(PairingErrorType.invalidCode, '连接码错误或已过期，请重新核对');
    } else {
      throw PairingException(PairingErrorType.unknown, '配对失败: HTTP ${response.statusCode}');
    }
  }

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

    if (_querySupported != false) {
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
        _querySupported = true;
        return _decodeItemsPage(response);
      }
      if (response.statusCode == 404 || response.statusCode == 405) {
        _querySupported = false;
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

  ({int total, List<MobileItem> items}) _decodeItemsPage(http.Response response) {
    final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    final total = (json['total'] as num?)?.toInt() ?? 0;
    final rawItems = json['items'] as List<dynamic>? ?? [];
    final items = rawItems.map((e) => MobileItem.fromJson(e as Map<String, dynamic>)).toList();
    return (total: total, items: items);
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
      return _decodeItemsPage(response);
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

  /// 从废纸篓恢复一个素材（对应桌面端的「恢复」）。
  Future<void> restoreItem(String id) async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    final uri = Uri.parse('$baseUrl/api/v1/items/$id/restore');
    final response = await http.post(uri, headers: authHeaders).timeout(const Duration(seconds: 15));
    if (response.statusCode == 200) return;
    if (response.statusCode == 401) {
      throw Exception('授权失效，请重新配对');
    }
    throw Exception('恢复失败: HTTP ${response.statusCode}');
  }

  /// 清空废纸篓（对应桌面端的「清空废纸篓」）。
  Future<void> emptyTrash() async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    final uri = Uri.parse('$baseUrl/api/v1/items/collection?name=trash');
    final response = await http.delete(uri, headers: authHeaders).timeout(const Duration(seconds: 30));
    if (response.statusCode == 200) return;
    if (response.statusCode == 401) {
      throw Exception('授权失效，请重新配对');
    }
    throw Exception('清空废纸篓失败: HTTP ${response.statusCode}');
  }

  static const int maxClipboardFileBytes = 500 * 1024 * 1024;

  /// Downloads the original file into `cache/clipboard/` so it can be handed to
  /// the Android FileProvider. Streams to disk; never buffers the whole file.
  Future<File> downloadOriginalToCache(
    MobileItem item, {
    void Function(int received, int total)? onProgress,
  }) async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    if (item.size > maxClipboardFileBytes) {
      throw Exception('文件过大（${item.formattedSize}），请使用分享或下载');
    }

    final tempDir = await getTemporaryDirectory();
    final clipboardDir = Directory('${tempDir.path}/clipboard');
    if (!await clipboardDir.exists()) {
      await clipboardDir.create(recursive: true);
    }
    await _pruneClipboardCache(clipboardDir);

    final filename = _clipboardFileName(item);
    final file = File('${clipboardDir.path}/$filename');
    final partial = File('${file.path}.part');
    final client = http.Client();
    try {
      final request = http.Request(
        'GET',
        Uri.parse(getOriginalUrl(item.id)),
      )..headers.addAll(mediaHeaders);
      final response = await client.send(request).timeout(
            const Duration(seconds: 30),
          );
      if (response.statusCode != 200) {
        throw Exception('下载失败: HTTP ${response.statusCode}');
      }

      final total = response.contentLength ?? item.size;
      var received = 0;
      final sink = partial.openWrite();
      try {
        await for (final chunk in response.stream) {
          sink.add(chunk);
          received += chunk.length;
          onProgress?.call(received, total);
        }
        await sink.flush();
      } finally {
        await sink.close();
      }

      if (await file.exists()) await file.delete();
      await partial.rename(file.path);
      return file;
    } catch (e) {
      if (await partial.exists()) {
        try {
          await partial.delete();
        } catch (_) {}
      }
      rethrow;
    } finally {
      client.close();
    }
  }

  Future<void> _pruneClipboardCache(Directory dir) async {
    try {
      final cutoff = DateTime.now().subtract(const Duration(hours: 24));
      await for (final entry in dir.list()) {
        if (entry is File && entry.path.endsWith('.part')) continue;
        try {
          final stat = await entry.stat();
          if (stat.modified.isBefore(cutoff)) {
            await entry.delete();
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  String _clipboardFileName(MobileItem item) {
    var name = item.filename.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    if (name.isEmpty) name = item.id;
    final ext = item.extension.trim();
    if (ext.isNotEmpty && !name.toLowerCase().endsWith('.${ext.toLowerCase()}')) {
      name = '$name.$ext';
    }
    return name;
  }

  /// Places a cached file URI on the Android clipboard (ClipData + FileProvider).
  Future<void> copyFileToClipboard({
    required String path,
    required String mimeType,
    required String displayName,
  }) async {
    try {
      await _nativeBridge.invokeMethod('copyFileToClipboard', {
        'path': path,
        'mimeType': mimeType.isNotEmpty ? mimeType : 'application/octet-stream',
        'displayName': displayName,
      });
    } on PlatformException catch (e) {
      throw Exception('复制失败: ${e.message ?? e.code}');
    }
  }

  /// Downloads [item] to the clipboard cache and hands it to the system
  /// clipboard. Shared by the detail screen and the grid long-press menu.
  Future<void> copyItemContent(
    MobileItem item, {
    void Function(int received, int total)? onProgress,
  }) async {
    final file = await downloadOriginalToCache(item, onProgress: onProgress);
    final displayName = file.uri.pathSegments.isNotEmpty
        ? file.uri.pathSegments.last
        : item.filename;
    await copyFileToClipboard(
      path: file.path,
      mimeType: item.mimeType,
      displayName: displayName,
    );
  }

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
        return _decodeItemsPage(response);
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

  Future<void> disconnect() async {
    baseUrl = null;
    token = null;
    resetQueryCapability();
    libraryName = null;
    await _storage.delete(key: _keyBaseUrl);
    await _storage.delete(key: _keyToken);
    await _storage.delete(key: _keyLibraryName);
  }
  // --- History Connections ---

  Future<List<HistoryConnection>> getHistoryConnections() async {
    final raw = await _storage.read(key: _keyHistory);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.map((e) => HistoryConnection.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> saveHistoryConnection(HistoryConnection conn) async {
    final history = await getHistoryConnections();
    history.removeWhere((e) => e.id == conn.id || (e.name == conn.name && e.port == conn.port));
    history.insert(0, conn);
    if (history.length > 10) {
      history.removeRange(10, history.length);
    }
    await _storage.write(key: _keyHistory, value: jsonEncode(history.map((e) => e.toJson()).toList()));
  }

  Future<void> removeHistoryConnection(String id) async {
    final history = await getHistoryConnections();
    history.removeWhere((e) => e.id == id);
    await _storage.write(key: _keyHistory, value: jsonEncode(history.map((e) => e.toJson()).toList()));
  }

  Future<bool> reconnect(HistoryConnection conn) async {
    for (final ip in conn.ips) {
      final candidateHost = 'http://$ip:${conn.port}';
      try {
        final statusUri = Uri.parse('$candidateHost/api/v1/status');
        final res = await http.get(statusUri).timeout(const Duration(seconds: 3));
        if (res.statusCode == 200) {
          final itemsUri = Uri.parse('$candidateHost/api/v1/items?limit=1');
          final itemsRes = await http.get(
            itemsUri,
            headers: {'Authorization': 'Bearer ${conn.token}'},
          ).timeout(const Duration(seconds: 3));

          if (itemsRes.statusCode == 200) {
            baseUrl = candidateHost;
            token = conn.token;
            resetQueryCapability();
            libraryName = conn.name;
            await _storage.write(key: _keyBaseUrl, value: baseUrl);
            await _storage.write(key: _keyToken, value: token);
            await _storage.write(key: _keyLibraryName, value: libraryName);
            await saveHistoryConnection(HistoryConnection(
              id: conn.id,
              name: conn.name,
              ips: conn.ips,
              port: conn.port,
              token: conn.token,
              lastConnectedAt: DateTime.now().millisecondsSinceEpoch,
            ));
            return true;
          }
        }
      } catch (_) {
        continue;
      }
    }
    return false;
  }

  // --- Libraries ---

  Future<List<MobileLibrary>> getLibraries() async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    final uri = Uri.parse('$baseUrl/api/v1/libraries');
    final response = await http.get(uri, headers: authHeaders).timeout(const Duration(seconds: 10));
    if (response.statusCode == 200) {
      final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      final list = json['libraries'] as List<dynamic>? ?? [];
      return list.map((e) => MobileLibrary.fromJson(e as Map<String, dynamic>)).toList();
    }
    return [];
  }

  Future<MobileLibrary> switchLibrary(String pathOrId) async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    final uri = Uri.parse('$baseUrl/api/v1/libraries/switch');
    final response = await http.post(
      uri,
      headers: authHeaders,
      body: jsonEncode({'path': pathOrId, 'id': pathOrId}),
    ).timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      final libJson = json['library'] as Map<String, dynamic>? ?? {};
      final switched = MobileLibrary.fromJson(libJson);
      libraryName = switched.name;
      await _storage.write(key: _keyLibraryName, value: switched.name);
      return switched;
    } else {
      throw Exception('Failed to switch library: HTTP ${response.statusCode} - ${response.body}');
    }
  }

  // --- Upload ---

  /// Returns the server-side count plus the created (or deduplicated) item IDs.
  ///
  /// The desktop response already carries the imported items
  /// (`core/mobile_api.go`), which is the authoritative mapping between the
  /// uploaded file and its content-addressed item ID. IDs are empty when an
  /// older desktop build omits the `items` array; callers may then fall back
  /// to hashing the uploaded file locally.
  Future<UploadResult> uploadFiles(List<String> filePaths) async {
    if (baseUrl == null) throw Exception('Base URL is not configured');
    final uri = Uri.parse('$baseUrl/api/v1/upload');
    final request = http.MultipartRequest('POST', uri);
    if (token != null && token!.isNotEmpty) {
      request.headers['Authorization'] = 'Bearer $token';
    }

    for (final path in filePaths) {
      final file = File(path);
      if (await file.exists()) {
        final multipartFile = await http.MultipartFile.fromPath('file', path);
        request.files.add(multipartFile);
      }
    }

    if (request.files.isEmpty) {
      throw Exception('No valid files to upload');
    }

    final streamedResponse = await request.send().timeout(const Duration(minutes: 5));
    final response = await http.Response.fromStream(streamedResponse);

    if (response.statusCode == 200) {
      try {
        final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
        final count = (json['count'] as num?)?.toInt() ?? request.files.length;
        final itemIds = <String>[];
        final rawItems = json['items'];
        if (rawItems is List) {
          for (final rawItem in rawItems) {
            if (rawItem is! Map) continue;
            final id = rawItem['id']?.toString() ?? '';
            if (id.isNotEmpty) itemIds.add(id);
          }
        }
        return UploadResult(count: count, itemIds: itemIds);
      } catch (_) {
        // Upload succeeded even if the body cannot be parsed.
        return UploadResult(count: request.files.length);
      }
    } else {
      throw Exception('Upload failed: HTTP ${response.statusCode} - ${response.body}');
    }
  }

  // --- Native Bridge (File Picker & Gallery Save) ---

  Future<List<String>> pickMediaFiles() async {
    try {
      final List<dynamic>? paths = await _nativeBridge.invokeMethod('pickMediaFiles');
      return paths?.map((e) => e.toString()).toList() ?? [];
    } catch (e) {
      return [];
    }
  }

  Future<String> saveMediaToGallery(Uint8List bytes, String filename, String mimeType) async {
    try {
      final String? uri = await _nativeBridge.invokeMethod('saveMediaToGallery', {
        'bytes': bytes,
        'filename': filename,
        'mimeType': mimeType,
      });
      return uri ?? '';
    } catch (e) {
      throw Exception('Failed to save to gallery: $e');
    }
  }
}

class UploadResult {
  const UploadResult({required this.count, this.itemIds = const []});

  final int count;
  final List<String> itemIds;
}
