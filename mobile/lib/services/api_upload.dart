import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import '../models/upload_result.dart';
import 'api_service.dart';

/// 上传到桌面端与保存到本机相册（依赖原生 MethodChannel）。
extension ApiUpload on ApiService {
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
      final List<dynamic>? paths = await nativeBridgeInvoke<List<dynamic>>('pickMediaFiles');
      return paths?.map((e) => e.toString()).toList() ?? [];
    } catch (e) {
      return [];
    }
  }

  Future<String> saveMediaToGallery(Uint8List bytes, String filename, String mimeType) async {
    try {
      final String? uri = await nativeBridgeInvoke<String>('saveMediaToGallery', {
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
