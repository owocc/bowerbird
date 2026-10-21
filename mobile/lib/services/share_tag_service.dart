import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import 'api_service.dart';

/// One locally recorded "shared from the phone" marker.
///
/// [itemId] is the desktop item ID, which is the uppercase SHA-256 of the
/// uploaded bytes. [library] scopes the marker to the active desktop library.
class ShareMark {
  const ShareMark({
    required this.itemId,
    required this.library,
    required this.sharedAt,
  });

  final String itemId;
  final String library;
  final int sharedAt;

  Map<String, dynamic> toJson() => {
    'id': itemId,
    'library': library,
    'sharedAt': sharedAt,
  };

  static ShareMark? fromJson(Map<String, dynamic> json) {
    final id = json['id']?.toString().toUpperCase() ?? '';
    if (!ShareTagStore.isValidItemId(id)) return null;
    final library = json['library']?.toString() ?? '';
    if (library.isEmpty) return null;
    final sharedAt = (json['sharedAt'] as num?)?.toInt();
    if (sharedAt == null || sharedAt <= 0) return null;
    return ShareMark(itemId: id, library: library, sharedAt: sharedAt);
  }
}

/// Persistent marker collection stored next to the share inbox index.
///
/// Writes use the same temp-file-then-rename strategy as the inbox index so a
/// crash cannot leave a half-written JSON document.
class ShareTagStore {
  ShareTagStore({required this.root, this.maxMarks = 2000});

  static const int version = 1;
  static final RegExp _itemIdPattern = RegExp(r'^[0-9A-F]{64}$');

  final Directory root;
  final int maxMarks;
  final List<ShareMark> _marks = [];

  List<ShareMark> get marks => List.unmodifiable(_marks);

  File get _file => File('${root.path}/share_tags.json');

  static bool isValidItemId(String value) => _itemIdPattern.hasMatch(value);

  Future<void> load() async {
    _marks.clear();
    try {
      if (!await root.exists()) await root.create(recursive: true);
      final file = _file;
      if (!await file.exists()) return;
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! Map) return;
      final rawMarks = decoded['marks'];
      if (rawMarks is! List) return;
      final seen = <String>{};
      for (final raw in rawMarks) {
        if (raw is! Map) continue;
        final mark = ShareMark.fromJson(Map<String, dynamic>.from(raw));
        if (mark == null) continue;
        if (!seen.add('${mark.library}\u0000${mark.itemId}')) continue;
        _marks.add(mark);
      }
      _trim();
    } catch (_) {
      // A corrupt marker file must not block the grid or sharing.
      _marks.clear();
    }
  }

  bool contains(String itemId, String library) {
    final normalized = itemId.toUpperCase();
    return _marks.any(
      (mark) => mark.itemId == normalized && mark.library == library,
    );
  }

  Future<bool> add(String itemId, String library, {int? sharedAt}) async {
    final normalized = itemId.toUpperCase();
    if (!isValidItemId(normalized) || library.isEmpty) return false;
    final timestamp = sharedAt ?? DateTime.now().millisecondsSinceEpoch;
    final index = _marks.indexWhere(
      (mark) => mark.itemId == normalized && mark.library == library,
    );
    if (index >= 0) {
      _marks[index] = ShareMark(
        itemId: normalized,
        library: library,
        sharedAt: timestamp,
      );
    } else {
      _marks.add(
        ShareMark(itemId: normalized, library: library, sharedAt: timestamp),
      );
    }
    _trim();
    await _save();
    return true;
  }

  Future<bool> remove(String itemId, String library) async {
    final normalized = itemId.toUpperCase();
    final before = _marks.length;
    _marks.removeWhere(
      (mark) => mark.itemId == normalized && mark.library == library,
    );
    if (_marks.length == before) return false;
    await _save();
    return true;
  }

  void _trim() {
    if (_marks.length <= maxMarks) return;
    _marks.sort((a, b) => a.sharedAt.compareTo(b.sharedAt));
    _marks.removeRange(0, _marks.length - maxMarks);
  }

  Future<void> _save() async {
    try {
      await root.create(recursive: true);
      final payload = jsonEncode({
        'version': version,
        'marks': _marks.map((mark) => mark.toJson()).toList(),
      });
      final file = _file;
      final temp = File('${file.path}.tmp');
      try {
        await temp.writeAsString(payload, flush: true);
        await temp.rename(file.path);
      } catch (_) {
        await file.writeAsString(payload, flush: true);
        if (await temp.exists()) await temp.delete();
      }
    } catch (_) {
      // Markers are cosmetic; upload success must not be reported as failure.
    }
  }
}

/// App-wide access to the local share markers.
///
/// Markers are written only by [InboxService.uploadEntries] after a successful
/// upload, never by the plain home-screen upload path.
class ShareTagService extends ChangeNotifier {
  ShareTagService._();

  static final ShareTagService instance = ShareTagService._();

  ShareTagStore? _store;

  bool get isReady => _store != null;

  Future<void> init() async {
    if (_store != null) return;
    try {
      final documents = await getApplicationDocumentsDirectory();
      final store = ShareTagStore(
        root: Directory('${documents.path}/share_inbox'),
      );
      await store.load();
      _store = store;
      notifyListeners();
    } catch (_) {
      // Sharing and browsing stay usable without local markers.
    }
  }

  /// Active desktop library name. IP addresses are deliberately excluded so
  /// switching between Wi-Fi and Tailscale keeps the same marker scope.
  String get libraryKey {
    final name = ApiService.instance.libraryName?.trim() ?? '';
    return name.isEmpty ? 'default' : name;
  }

  bool isMarked(String itemId) => _store?.contains(itemId, libraryKey) ?? false;

  Future<bool> mark(String itemId, {int? sharedAt}) async {
    final store = _store;
    if (store == null) return false;
    final added = await store.add(
      itemId,
      libraryKey,
      sharedAt: sharedAt ?? DateTime.now().millisecondsSinceEpoch,
    );
    if (added) notifyListeners();
    return added;
  }

  Future<void> forget(String itemId) async {
    final store = _store;
    if (store == null) return;
    if (await store.remove(itemId, libraryKey)) notifyListeners();
  }

  /// Uppercase hex SHA-256 of [bytes], matching the desktop item ID.
  static String hashBytes(List<int> bytes) =>
      sha256.convert(bytes).toString().toUpperCase();

  /// Streaming SHA-256 of a file, so large shared videos are not loaded into
  /// memory. Returns null when the file is missing or unreadable.
  static Future<String?> hashFile(String path) async {
    try {
      final file = File(path);
      if (!await file.exists()) return null;
      final sink = _DigestSink();
      final input = sha256.startChunkedConversion(sink);
      await for (final chunk in file.openRead()) {
        input.add(chunk);
      }
      input.close();
      final digest = sink.value;
      return digest?.toString().toUpperCase();
    } catch (_) {
      return null;
    }
  }
}

class _DigestSink implements Sink<Digest> {
  Digest? _value;

  Digest? get value => _value;

  @override
  void add(Digest data) {
    _value = data;
  }

  @override
  void close() {}
}
