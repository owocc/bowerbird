import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../models/inbox_entry.dart';
import 'api_service.dart';

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
  static const _indexVersion = 1;
  static const _maxProcessedEvents = 300;

  final List<InboxEntry> _entries = [];
  final List<String> _processedEventIds = [];

  Directory? _root;
  bool _initialized = false;
  bool _ingesting = false;

  bool get isInitialized => _initialized;

  int get count => _entries.length;

  List<InboxEntry> get entries => List.unmodifiable(_entries);

  List<InboxEntry> get textEntries =>
      _entries.where((entry) => entry.isText).toList();

  Future<void> init() async {
    if (_initialized) return;
    final documents = await getApplicationDocumentsDirectory();
    _root = Directory('${documents.path}/share_inbox');
    await _root!.create(recursive: true);
    await Directory('${_root!.path}/files').create(recursive: true);

    final indexFile = _indexFile;
    if (await indexFile.exists()) {
      try {
        final decoded = jsonDecode(await indexFile.readAsString());
        if (decoded is Map<String, dynamic>) {
          final rawEntries = decoded['entries'];
          if (rawEntries is List) {
            for (final raw in rawEntries) {
              if (raw is! Map) continue;
              final entry = InboxEntry.fromJson(Map<String, dynamic>.from(raw));
              if (entry == null) continue;
              if (!entry.isText) {
                final file = fileFor(entry);
                if (file == null || !await file.exists()) continue;
              }
              _entries.add(entry);
            }
          }
          final processed = decoded['processedEvents'];
          if (processed is List) {
            _processedEventIds.addAll(
              processed.map((value) => value.toString()).where((id) => id.isNotEmpty),
            );
          }
        }
      } catch (_) {
        // A corrupt index must not hide newly shared files: start empty and let
        // the next save rewrite it.
      }
    }

    _entries.sort((a, b) => b.receivedAt.compareTo(a.receivedAt));
    _initialized = true;
    notifyListeners();
  }

  File? fileFor(InboxEntry entry) {
    final relative = entry.storedPath;
    final root = _root;
    if (relative == null || relative.isEmpty || root == null) return null;
    return File('${root.path}/$relative');
  }

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
            final destination = File('${_root!.path}/$relative');
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
        await ApiService.instance.uploadFiles([path]);
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

  Future<File> _writeTextFile(InboxEntry entry) async {
    final tempDir = await getTemporaryDirectory();
    final directory = Directory('${tempDir.path}/share_inbox_upload');
    await directory.create(recursive: true);
    var name = sanitizeInboxFileName(entry.fileName, fallback: '分享文本');
    if (!name.toLowerCase().endsWith('.txt')) name = '$name.txt';
    var file = File('${directory.path}/$name');
    if (await file.exists()) {
      file = File('${directory.path}/${entry.id}_$name');
    }
    return file.writeAsString(entry.text ?? '', encoding: utf8);
  }

  Future<bool> _removeEntry(InboxEntry entry) async {
    final index = _entries.indexWhere((candidate) => candidate.id == entry.id);
    if (index < 0) return false;
    final file = fileFor(entry);
    _entries.removeAt(index);
    if (file != null && await file.exists()) {
      try {
        await file.delete();
      } catch (_) {}
      final parent = file.parent;
      try {
        if (await parent.exists() &&
            await parent.list().isEmpty) {
          await parent.delete();
        }
      } catch (_) {}
    }
    return true;
  }

  Future<void> _saveChain = Future.value();

  Future<void> _save() {
    if (_root == null) return Future.value();
    final payload = jsonEncode({
      'version': _indexVersion,
      'entries': _entries.map((entry) => entry.toJson()).toList(),
      'processedEvents': _processedEventIds,
    });
    final indexFile = _indexFile;
    _saveChain = _saveChain.then((_) => _writeIndex(indexFile, payload));
    return _saveChain;
  }

  Future<void> _writeIndex(File indexFile, String payload) async {
    final temp = File('${indexFile.path}.tmp');
    try {
      await temp.writeAsString(payload, flush: true);
      await temp.rename(indexFile.path);
    } catch (_) {
      try {
        await indexFile.writeAsString(payload, flush: true);
        if (await temp.exists()) await temp.delete();
      } catch (_) {}
    }
  }
  File get _indexFile => File('${_root!.path}/index.json');

  String _cleanError(Object error) =>
      error.toString().replaceFirst('Exception: ', '');
}
