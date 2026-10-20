import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_keys.dart';
import '../models/inbox_entry.dart';
import '../screens/inbox_screen.dart';
import 'api_service.dart';
import 'inbox_service.dart';

/// Bridges native share events into the inbox and, when a desktop library is
/// connected, uploads newly received items immediately.
class ShareIntentHandler {
  ShareIntentHandler._();

  static final ShareIntentHandler instance = ShareIntentHandler._();

  static const _channel = MethodChannel('com.bowerbird.mobile/share');

  bool _attached = false;
  bool _busy = false;
  bool _again = false;

  void attach() {
    if (_attached) return;
    _attached = true;
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'onShareAvailable') {
        unawaited(processPending());
      }
    });
  }

  /// Drains the native queue. Called after the first frame (cold start), on
  /// resume, and whenever the native bridge reports a new share.
  Future<void> processPending() async {
    if (!InboxService.instance.isInitialized) return;
    if (_busy) {
      _again = true;
      return;
    }
    _busy = true;
    try {
      do {
        _again = false;
        await _processOnce();
      } while (_again);
    } catch (_) {
      // A malformed payload or a detached UI must not wedge future shares.
    } finally {
      _busy = false;
    }
  }

  Future<void> _processOnce() async {
    final ingest = await InboxService.instance.consumeNativeShares();
    if (ingest.isEmpty) return;

    final connected = ApiService.instance.isConfigured &&
        ApiService.instance.isAuthenticated;

    if (!connected) {
      if (ingest.added.isNotEmpty) {
        _showSnack(
          '已收到 ${ingest.added.length} 个分享，已存入收件箱。请先连接桌面端再上传。',
        );
        _openInbox();
      }
      if (ingest.failures.isNotEmpty) {
        await _showFailures(
          title: '部分分享接收失败',
          lines: ingest.failures
              .map((failure) => '${failure.name}：${failure.reason}')
              .toList(),
        );
      }
      return;
    }

    if (ingest.added.isNotEmpty) {
      final outcome = await _uploadWithProgress(ingest.added);
      await _showUploadResult(outcome, ingest.failures);
      return;
    }

    if (ingest.failures.isNotEmpty) {
      await _showFailures(
        title: '分享接收失败',
        lines: ingest.failures
            .map((failure) => '${failure.name}：${failure.reason}')
            .toList(),
      );
    }
  }

  Future<UploadOutcome> _uploadWithProgress(List<InboxEntry> entries) async {
    final navigator = navigatorKey.currentState;
    if (navigator == null) {
      return InboxService.instance.uploadEntries(entries);
    }
    final route = DialogRoute<void>(
      context: navigator.context,
      barrierDismissible: false,
      builder: (_) => PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(
            children: [
              const CircularProgressIndicator(),
              const SizedBox(width: 20),
              Expanded(
                child: Text(
                  entries.length == 1
                      ? '正在上传「${entries.first.fileName}」到素材库...'
                      : '正在上传 ${entries.length} 个分享到素材库...',
                ),
              ),
            ],
          ),
        ),
      ),
    );
    navigator.push(route);
    // Let the dialog attach before a very fast upload tears it down again.
    await Future<void>.delayed(const Duration(milliseconds: 120));
    try {
      return await InboxService.instance.uploadEntries(entries);
    } finally {
      if (route.isActive) navigator.removeRoute(route);
    }
  }

  Future<void> _showUploadResult(
    UploadOutcome outcome,
    List<IngestFailure> ingestFailures,
  ) async {
    final lines = <String>[
      ...ingestFailures.map((failure) => '${failure.name}：${failure.reason}'),
      ...outcome.failures.map(
        (failure) => '${failure.entry.fileName}：${failure.reason}',
      ),
    ];

    if (lines.isEmpty) {
      _showSnack('已存入素材库：${outcome.uploaded} 个');
      return;
    }
    final kept = outcome.failed + ingestFailures.length;
    await _showFailures(
      title: outcome.uploaded > 0 ? '已存入素材库' : '上传未完成',
      summary: '成功 ${outcome.uploaded} 个，失败 $kept 个。'
          '${outcome.failed > 0 ? '失败的内容已保留在收件箱，可稍后重试。' : ''}',
      lines: lines,
    );
  }

  Future<void> _showFailures({
    required String title,
    String? summary,
    required List<String> lines,
  }) async {
    final navigator = navigatorKey.currentState;
    if (navigator == null || lines.isEmpty) return;
    await showDialog<void>(
      context: navigator.context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SizedBox(
          width: double.maxFinite,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (summary != null) ...[
                Text(summary),
                const SizedBox(height: 12),
              ],
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 280),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final line in lines)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text(
                            line,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('完成'),
          ),
        ],
      ),
    );
  }

  void _openInbox() {
    if (InboxScreen.isOpen) return;
    final navigator = navigatorKey.currentState;
    if (navigator == null) return;
    navigator.push(
      MaterialPageRoute(builder: (_) => const InboxScreen()),
    );
  }

  void _showSnack(String message) {
    scaffoldMessengerKey.currentState?.showSnackBar(
      SnackBar(content: Text(message)),
    );
  }
}
