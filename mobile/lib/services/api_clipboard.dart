import 'dart:io';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../models/item.dart';
import 'api_service.dart';
import 'media_limits.dart';

/// 剪贴板相关：把原图缓存到本地并交给 Android FileProvider。
///
/// 单次可复制的上限、缓存清理、下载到 cache 都集中在这里。
extension ApiClipboard on ApiService {
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
      await nativeBridgeInvoke<void>('copyFileToClipboard', {
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
}
