enum InboxEntryKind { file, text }

/// One item waiting to be uploaded to the desktop library.
///
/// Files live under `<app documents>/share_inbox/`; [storedPath] is relative to
/// that root so the index survives app data restoration. Text shares keep their
/// content in the index and are materialised as `.txt` only on upload.
class InboxEntry {
  InboxEntry({
    required this.id,
    required this.kind,
    required this.fileName,
    required this.mimeType,
    required this.size,
    required this.receivedAt,
    this.storedPath,
    this.text,
  });

  final String id;
  final InboxEntryKind kind;
  final String fileName;
  final String mimeType;
  final int size;
  final int receivedAt;
  final String? storedPath;
  final String? text;

  bool get isText => kind == InboxEntryKind.text;

  String get extension {
    final dot = fileName.lastIndexOf('.');
    if (dot < 0 || dot == fileName.length - 1) return '';
    return fileName.substring(dot + 1).toLowerCase();
  }

  bool get isVideo =>
      mimeType.startsWith('video/') ||
      const {'mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'}.contains(extension);

  bool get isImage =>
      mimeType.startsWith('image/') ||
      const {'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'ico', 'heic'}
          .contains(extension);

  String get formattedSize {
    if (size < 1024) return '$size B';
    if (size < 1024 * 1024) return '${(size / 1024).toStringAsFixed(1)} KB';
    if (size < 1024 * 1024 * 1024) {
      return '${(size / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(size / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
  }

  String get preview {
    final value = text?.trim() ?? '';
    if (value.isEmpty) return '';
    final singleLine = value.replaceAll(RegExp(r'\s+'), ' ');
    return singleLine.length > 140
        ? '${singleLine.substring(0, 140)}…'
        : singleLine;
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind.name,
        'fileName': fileName,
        'mimeType': mimeType,
        'size': size,
        'receivedAt': receivedAt,
        'storedPath': storedPath,
        'text': text,
      };

  static InboxEntry? fromJson(Map<String, dynamic> json) {
    final id = json['id']?.toString() ?? '';
    final fileName = json['fileName']?.toString() ?? '';
    if (id.isEmpty || fileName.isEmpty) return null;
    final kind = json['kind'] == InboxEntryKind.text.name
        ? InboxEntryKind.text
        : InboxEntryKind.file;
    final text = json['text']?.toString();
    final storedPath = json['storedPath']?.toString();
    if (kind == InboxEntryKind.file && (storedPath == null || storedPath.isEmpty)) {
      return null;
    }
    return InboxEntry(
      id: id,
      kind: kind,
      fileName: fileName,
      mimeType: json['mimeType']?.toString() ?? 'application/octet-stream',
      size: (json['size'] as num?)?.toInt() ?? 0,
      receivedAt: (json['receivedAt'] as num?)?.toInt() ?? 0,
      storedPath: storedPath,
      text: text,
    );
  }
}

/// Keeps user-supplied names safe for the app-private inbox and for multipart
/// uploads. Path separators and control characters are never preserved.
String sanitizeInboxFileName(String raw, {String fallback = 'shared'}) {
  var name = raw
      .replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1f]'), '_')
      .trim()
      .replaceAll(RegExp(r'^\.+|\.+$'), '');
  if (name.isEmpty) name = fallback;
  if (name.length > 100) {
    final dot = name.lastIndexOf('.');
    name = dot > 0 && name.length - dot <= 12
        ? name.substring(0, 88) + name.substring(dot)
        : name.substring(0, 100);
  }
  return name;
}
