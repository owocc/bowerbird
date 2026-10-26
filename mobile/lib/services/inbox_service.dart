import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'inbox_store.dart';

import '../models/inbox_entry.dart';
import 'api_service.dart';
import 'share_tag_service.dart';
import 'api_upload.dart';

class IngestFailure {
  IngestFailure(this.name, this.reason);

  final String name;
  final String reason;
}

class IngestOutcome {
  IngestOutcome({required this.added, required this.failures});

  final List<InboxEntry> added;
  final List<IngestFailure> failures;

  bool get isEmpty => added.isEmpty && failures.isEmpty;
  int get receivedCount => added.length;
}

class UploadFailure {
  UploadFailure(this.entry, this.reason);

  final InboxEntry entry;
  final String reason;
}

class UploadOutcome {
  UploadOutcome({required this.uploaded, required this.failures});

  final int uploaded;
  final List<UploadFailure> failures;

  int get failed => failures.length;
}

/// Persistent "receive before upload" inbox.
///
/// Files shared into the app are copied by the native bridge into a private
/// staging directory; this service moves them into the documents inbox, keeps
/// an index, and uploads through [ApiService] so pairing/token/base URL logic
/// stays in one place.
class InboxService extends ChangeNotifier {
  InboxService._();

  static final InboxService instance = InboxService._();

  static const _channel = MethodChannel('com.bowerbird.mobile/share');
  static const _maxProcessedEvents = 300;

  final List<InboxEntry> _entries = [];
  final List<String> _processedEventIds = [];

  final InboxStore _store = InboxStore();
  bool _initialized = false;
  bool _ingesting = false;

  bool get isInitialized => _initialized;

  int get count => _entries.length;

  List<InboxEntry> get entries => List.unmodifiable(_entries);

  List<InboxEntry> get textEntries =>
      _entries.where((entry) => entry.isText).toList();

  Future<void> init() async {
    if (_initialized) return;
    final loaded = await _store.load();
    for (final entry in loaded.entries) {
      if (!entry.isText) {
        final file = fileFor(entry);
        if (file == null) continue;
      }
      _entries.add(entry);
    }
    _processedEventIds.addAll(loaded.processedEvents);
    _entries.sort((a, b) => b.receivedAt.compareTo(a.receivedAt));
    _initialized = true;
    notifyListeners();
  }

  File? fileFor(InboxEntry entry) => _store.fileFor(entry);

  /// Reads every event queued by the native share bridge and moves its payload
  /// into the persistent inbox. Safe to call repeatedly: native events and
  /// entries are tracked by id.
  Future<IngestOutcome> consumeNativeShares() async {
    final empty = IngestOutcome(added: const [], failures: const []);
    if (!_initialized || _ingesting) return empty;
    _ingesting = true;
    try {
      String? raw;
      try {
        raw = await _channel.invokeMethod<String>('consumePendingShares');
      } on MissingPluginException {
        return empty;
      } catch (_) {
        return empty;
      }
      if (raw == null || raw.isEmpty) return empty;

      dynamic decoded;
      try {
        decoded = jsonDecode(raw);
      } catch (_) {
        return empty;
      }
      if (decoded is! List || decoded.isEmpty) return empty;

      final added = <InboxEntry>[];
      final failures = <IngestFailure>[];
      var changed = false;

      for (final rawEvent in decoded) {
        if (rawEvent is! Map) continue;
        final event = Map<String, dynamic>.from(rawEvent);
        final eventId = event['eventId']?.toString() ?? '';
        if (eventId.isEmpty || _processedEventIds.contains(eventId)) continue;
        final receivedAt =
            (event['receivedAt'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch;

        final rawErrors = event['errors'];
        if (rawErrors is List) {
          for (final rawError in rawErrors) {
            if (rawError is! Map) continue;
            failures.add(IngestFailure(
              rawError['name']?.toString() ?? '未知文件',
              rawError['reason']?.toString() ?? '无法读取分享内容',
            ));
          }
        }

        final rawItems = event['items'];
        if (rawItems is List) {
          for (var index = 0; index < rawItems.length; index++) {
            final rawItem = rawItems[index];
            if (rawItem is! Map) continue;
            final item = Map<String, dynamic>.from(rawItem);
            final kind = item['kind']?.toString();
            if (kind == 'text') {
              final text = item['text']?.toString() ?? '';
              if (text.trim().isEmpty) continue;
              final id = '${eventId}_t$index';
              if (_entries.any((entry) => entry.id == id)) continue;
              final entry = InboxEntry(
                id: id,
                kind: InboxEntryKind.text,
                fileName: sanitizeInboxFileName(
                  item['name']?.toString() ?? '分享文本',
                  fallback: '分享文本',
                ),
                mimeType: 'text/plain',
                size: utf8.encode(text).length,
                receivedAt: receivedAt,
                text: text,
              );
              _entries.add(entry);
              added.add(entry);
              changed = true;
              continue;
            }

            if (kind != 'file') continue;
            final sourcePath = item['path']?.toString() ?? '';
            if (sourcePath.isEmpty) {
              failures.add(IngestFailure(
                item['name']?.toString() ?? '未知文件',
                '分享的文件路径无效',
              ));
              continue;
            }
            final source = File(sourcePath);
            if (!await source.exists()) {
              failures.add(IngestFailure(
                item['name']?.toString() ?? sourcePath.split('/').last,
                '分享暂存文件已不存在',
              ));
              continue;
            }
            final id = '${eventId}_f$index';
            if (_entries.any((entry) => entry.id == id)) continue;

            final originalName = sanitizeInboxFileName(
              item['name']?.toString() ?? source.path.split('/').last,
              fallback: 'shared_$index',
            );
            final relative = 'files/$id/$originalName';
            final root = _store.root;
            if (root == null) throw StateError('inbox not initialized');
            final destination = File('${root.path}/$relative');
            try {
              await destination.parent.create(recursive: true);
              try {
                await source.rename(destination.path);
              } on FileSystemException {
                await source.copy(destination.path);
                try {
                  await source.delete();
                } catch (_) {}
              }
              final entry = InboxEntry(
                id: id,
                kind: InboxEntryKind.file,
                fileName: originalName,
                mimeType: item['mimeType']?.toString() ??
                    'application/octet-stream',
                size: await destination.length(),
                receivedAt: receivedAt,
                storedPath: relative,
              );
              _entries.add(entry);
              added.add(entry);
              changed = true;
            } catch (error) {
              failures.add(IngestFailure(
                originalName,
                '无法保存到收件箱：${_cleanError(error)}',
              ));
            }
          }
        }

        _processedEventIds.add(eventId);
        changed = true;
      }

      if (changed) {
        if (_processedEventIds.length > _maxProcessedEvents) {
          _processedEventIds.removeRange(
            0,
            _processedEventIds.length - _maxProcessedEvents,
          );
        }
        _entries.sort((a, b) => b.receivedAt.compareTo(a.receivedAt));
        await _save();
        notifyListeners();
      }

      return IngestOutcome(added: added, failures: failures);
    } finally {
      _ingesting = false;
    }
  }

  /// Uploads entries one by one so success/failure can be reported per item.
  /// Successful entries leave the inbox; failures keep their local copy.
  Future<UploadOutcome> uploadEntries(
    Iterable<InboxEntry> source, {
    void Function(int done, int total)? onProgress,
  }) async {
    final targets = source
        .where((entry) => _entries.any((candidate) => candidate.id == entry.id))
        .toList();
    final failures = <UploadFailure>[];
    if (targets.isEmpty) return UploadOutcome(uploaded: 0, failures: failures);

    if (!ApiService.instance.isConfigured ||
        !ApiService.instance.isAuthenticated) {
      for (final entry in targets) {
        failures.add(UploadFailure(entry, '尚未连接 Bowerbird 桌面端'));
      }
      return UploadOutcome(uploaded: 0, failures: failures);
    }

    var uploaded = 0;
    var done = 0;
    for (final entry in targets) {
      File? temporary;
      try {
        final path = entry.isText
            ? (temporary = await _writeTextFile(entry)).path
            : fileFor(entry)?.path;
        if (path == null) {
          throw Exception('收件箱文件已不存在');
        }
        if (!await File(path).exists()) {
          throw Exception('收件箱文件已不存在');
        }
        final result = await ApiService.instance.uploadFiles([path]);
        final itemId = result.itemIds.isNotEmpty
            ? result.itemIds.first
            : await ShareTagService.hashFile(path);
        if (itemId != null && itemId.isNotEmpty) {
          await ShareTagService.instance.mark(itemId);
        }
        uploaded++;
        await _removeEntry(entry);
      } catch (error) {
        failures.add(UploadFailure(entry, _cleanError(error)));
      } finally {
        if (temporary != null) {
          try {
            if (await temporary.exists()) await temporary.delete();
          } catch (_) {}
        }
        done++;
        onProgress?.call(done, targets.length);
      }
    }

    if (uploaded > 0) {
      await _save();
      notifyListeners();
    }
    return UploadOutcome(uploaded: uploaded, failures: failures);
  }

  Future<void> deleteEntry(InboxEntry entry) async {
    final removed = await _removeEntry(entry);
    if (removed) {
      await _save();
      notifyListeners();
    }
  }

  Future<File> _writeTextFile(InboxEntry entry) =>
      _store.writeTextFile(entry, sanitizeInboxFileName);

  Future<bool> _removeEntry(InboxEntry entry) async {
    final index = _entries.indexWhere((candidate) => candidate.id == entry.id);
    if (index < 0) return false;
    _entries.removeAt(index);
    await _store.deleteFileFor(entry);
    return true;
  }

  Future<void> _save() => _store.save(_entries, _processedEventIds.toSet());

  String _cleanError(Object error) =>
      error.toString().replaceFirst('Exception: ', '');
}
