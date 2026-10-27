import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../models/inbox_entry.dart';

/// 收件箱的索引与文件持久化。
///
/// 从 `InboxService` 抽出：这里只做"读写 index.json + 落盘/删除文件"，
/// 不含业务判断，便于单独测试原子写入行为。
class InboxStore {
  InboxStore();

  static const int indexVersion = 1;
  static const String indexFileName = 'index.json';

  Directory? _root;
  Future<void> _saveChain = Future.value();

  Directory? get root => _root;

  /// 载入索引；首次运行会创建目录。
  Future<({List<InboxEntry> entries, Set<String> processedEvents})> load() async {
    _root = await _resolveRoot();
    final indexFile = File('${_root!.path}/$indexFileName');
    if (!await indexFile.exists()) {
      return (entries: <InboxEntry>[], processedEvents: <String>{});
    }
    try {
      final raw = await indexFile.readAsString();
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final entries = <InboxEntry>[];
      for (final raw in (json['entries'] as List<dynamic>? ?? [])) {
        if (raw is! Map) continue;
        final entry = InboxEntry.fromJson(Map<String, dynamic>.from(raw));
        if (entry != null) entries.add(entry);
      }
      final processed = (json['processedEvents'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toSet();
      return (entries: entries, processedEvents: processed);
    } catch (_) {
      // 索引损坏时不阻塞启动，按空收件箱处理。
      return (entries: <InboxEntry>[], processedEvents: <String>{});
    }
  }

  /// 解析某个条目的文件路径（仅当仍存在）。
  /// 条目的落盘文件（`storedPath` 相对于收件箱根目录）。
  File? fileFor(InboxEntry entry) {
    final root = _root;
    final relative = entry.storedPath;
    if (root == null || relative == null || relative.isEmpty) return null;
    return File('${root.path}/$relative');
  }

  /// 原子写入索引：先写 .tmp 再 rename，失败则退回直接写。
  Future<void> save(List<InboxEntry> entries, Set<String> processedEvents) {
    final root = _root;
    if (root == null) return Future.value();
    final payload = jsonEncode({
      'version': indexVersion,
      'entries': entries.map((e) => e.toJson()).toList(),
      'processedEvents': processedEvents.toList(),
    });
    final indexFile = File('${root.path}/$indexFileName');
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

  /// 为文本分享写一个 .txt 文件到上传目录，返回该文件。
  Future<File> writeTextFile(
    InboxEntry entry,
    String Function(String name, {String fallback}) sanitize,
  ) async {
    final tempDir = await getTemporaryDirectory();
    final directory = Directory('${tempDir.path}/share_inbox_upload');
    await directory.create(recursive: true);
    var name = sanitize(entry.fileName, fallback: '分享文本');
    if (!name.toLowerCase().endsWith('.txt')) name = '$name.txt';
    var file = File('${directory.path}/$name');
    if (await file.exists()) {
      file = File('${directory.path}/${entry.id}_$name');
    }
    return file.writeAsString(entry.text ?? '', encoding: utf8);
  }

  /// 删除条目对应的文件（若存在），并顺手清掉空目录。
  Future<void> deleteFileFor(InboxEntry entry) async {
    final file = fileFor(entry);
    if (file == null || !await file.exists()) return;
    try {
      await file.delete();
    } catch (_) {}
    try {
      final parent = file.parent;
      if (await parent.exists() && await parent.list().isEmpty) {
        await parent.delete();
      }
    } catch (_) {}
  }

  Future<Directory> _resolveRoot() async {
    try {
      final dir = await getApplicationSupportDirectory();
      final root = Directory('${dir.path}/share_inbox');
      await root.create(recursive: true);
      return root;
    } catch (_) {
      final temp = await getTemporaryDirectory();
      final root = Directory('${temp.path}/share_inbox');
      await root.create(recursive: true);
      return root;
    }
  }
}
