import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../models/item.dart';

class ApiService {
  static final ApiService instance = ApiService._internal();
  ApiService._internal();

  final _storage = const FlutterSecureStorage();
  static const _keyBaseUrl = 'bowerbird_base_url';
  static const _keyToken = 'bowerbird_token';
  static const _keyLibraryName = 'bowerbird_library_name';

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

  Future<void> pair({
    required String host,
    required String code,
    String? deviceName,
  }) async {
    final cleanHost = host.endsWith('/') ? host.substring(0, host.length - 1) : host;
    final uri = Uri.parse('$cleanHost/api/v1/pair');

    final payload = {
      'code': code.trim(),
      'deviceName': deviceName ?? 'Flutter Mobile',
    };

    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    ).timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      final json = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      final data = json['data'] as Map<String, dynamic>? ?? json;
      final receivedToken = data['token'] as String?;
      if (receivedToken == null || receivedToken.isEmpty) {
        throw Exception('Server did not return a valid authentication token');
      }

      baseUrl = cleanHost;
      token = receivedToken;

      await _storage.write(key: _keyBaseUrl, value: baseUrl);
      await _storage.write(key: _keyToken, value: token);
    } else if (response.statusCode == 401) {
      throw Exception('Invalid or expired pairing code. Please check your desktop.');
    } else {
      throw Exception('Pairing failed: HTTP ${response.statusCode} - ${response.body}');
    }
  }

  Future<({int total, List<MobileItem> items})> getItems({
    int limit = 60,
    int offset = 0,
    String? q,
    String? tag,
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

  Future<void> disconnect() async {
    baseUrl = null;
    token = null;
    libraryName = null;
    await _storage.delete(key: _keyBaseUrl);
    await _storage.delete(key: _keyToken);
    await _storage.delete(key: _keyLibraryName);
  }
}
