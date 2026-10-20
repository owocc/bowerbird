import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../models/item.dart';

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
      final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      final total = (json['total'] as num?)?.toInt() ?? 0;
      final rawItems = json['items'] as List<dynamic>? ?? [];
      final items = rawItems.map((e) => MobileItem.fromJson(e as Map<String, dynamic>)).toList();
      return (total: total, items: items);
    } else if (response.statusCode == 401) {
      throw Exception('Unauthorized: please reconnect or re-pair with desktop');
    } else {
      throw Exception('Failed to load items: HTTP ${response.statusCode}');
    }
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

  Future<int> uploadFiles(List<String> filePaths) async {
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
      final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      return (json['count'] as num?)?.toInt() ?? request.files.length;
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
