import 'dart:io';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/item.dart';
import 'api_service.dart';
import 'usage_history_service.dart';
import '../widgets/item_preview_overlay.dart';
import 'api_clipboard.dart';
import 'api_upload.dart';
import 'media_limits.dart';

/// 把「一次性动作失败」统一成可展示的消息。
class MediaActionResult {
  const MediaActionResult.success(this.message, {this.markedUsed = false})
      : error = false;
  const MediaActionResult.failure(this.message)
      : error = true,
        markedUsed = false;

  final String message;
  final bool error;

  /// 分享等价于「使用」，需要写入使用历史。
  final bool markedUsed;
}

/// 素材的分享 / 下载 / 复制到剪贴板。
///
/// 从 `HomeScreen` 抽出：这些只依赖 [MobileItem] 与 ApiService，
/// 不关心 UI 结构，也便于单独测试错误分支。
class MediaActions {
  const MediaActions._();

  /// 下载原图字节；失败抛 [Exception]。
  static Future<Uint8List> _fetchOriginal(String itemId) async {
    final url = ApiService.instance.getOriginalUrl(itemId);
    final response = await http
        .get(Uri.parse(url), headers: ApiService.instance.authHeaders)
        .timeout(const Duration(seconds: 30));
    if (response.statusCode != 200) {
      throw Exception('HTTP ${response.statusCode}');
    }
    return response.bodyBytes;
  }

  static String _filenameOf(MobileItem item) =>
      item.filename.isNotEmpty ? item.filename : '${item.id}.${item.extension}';

  /// 下载到系统相册/下载目录。
  static Future<MediaActionResult> download(MobileItem item) async {
    try {
      final bytes = await _fetchOriginal(item.id);
      final filename = _filenameOf(item);
      await ApiService.instance.saveMediaToGallery(bytes, filename, item.mimeType);
      return MediaActionResult.success('已保存至手机相册/下载目录: $filename');
    } catch (e) {
      return MediaActionResult.failure(
        '下载失败: ${e.toString().replaceAll('Exception: ', '')}',
      );
    }
  }

  /// 复制素材内容到剪贴板（大文件拒绝）。
  static Future<MediaActionResult> copy(MobileItem item) async {
    if (item.size > maxClipboardFileBytes) {
      return MediaActionResult.failure('文件过大（${item.formattedSize}），请使用分享或下载');
    }
    try {
      await ApiService.instance.copyItemContent(item);
      return const MediaActionResult.success('已复制素材内容，可粘贴到微信等应用');
    } catch (e) {
      return MediaActionResult.failure(
        '复制失败: ${e.toString().replaceAll('Exception: ', '')}',
      );
    }
  }

  /// 通过系统分享面板分享；成功即记入使用历史。
  static Future<MediaActionResult> share(MobileItem item) async {
    try {
      final bytes = await _fetchOriginal(item.id);
      final tempDir = await getTemporaryDirectory();
      final filename = _filenameOf(item);
      final file = File('${tempDir.path}/$filename');
      await file.writeAsBytes(bytes);

      // 分享即「使用」，等价于桌面端的拖出记录
      await UsageHistoryService.instance.record(item.id);

      final text = item.name.isNotEmpty ? item.name : item.filename;
      await Share.shareXFiles([XFile(file.path, mimeType: item.mimeType)], text: text);
      return const MediaActionResult.success('已分享', markedUsed: true);
    } catch (e) {
      return MediaActionResult.failure('分享失败: $e');
    }
  }

  /// 复制文本（URL / note）到剪贴板。
  static Future<void> copyText(String text) =>
      Clipboard.setData(ClipboardData(text: text));

  /// 把预览层返回的动作映射到具体实现；`null` 表示由调用方处理（详情/删除）。
  static Future<MediaActionResult?> fromPreview(
    ItemPreviewAction action,
    MobileItem item,
  ) {
    switch (action) {
      case ItemPreviewAction.copyContent:
        return copy(item);
      case ItemPreviewAction.download:
        return download(item);
      case ItemPreviewAction.share:
        return share(item);
      case ItemPreviewAction.viewDetail:
      case ItemPreviewAction.delete:
        return Future.value();
    }
  }
}
