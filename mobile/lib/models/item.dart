class MobileStatus {
  final String name;
  final String version;
  final int itemCount;
  final bool pairingRequired;

  MobileStatus({
    required this.name,
    required this.version,
    required this.itemCount,
    required this.pairingRequired,
  });

  factory MobileStatus.fromJson(Map<String, dynamic> json) {
    return MobileStatus(
      name: json['name'] as String? ?? 'Bowerbird',
      version: json['version'] as String? ?? '1.0.0',
      itemCount: (json['itemCount'] as num?)?.toInt() ?? 0,
      pairingRequired: json['pairingRequired'] as bool? ?? true,
    );
  }
}

class MobileItem {
  final String id;
  final String name;
  final String filename;
  final String extension;
  final int width;
  final int height;
  final int size;
  final String mimeType;
  final String thumbnailUrl;
  final String originalUrl;
  final int createdAt;
  final int importedAt;
  final int date;
  final String orientation;
  final List<String> tags;
  final List<String> folders;

  MobileItem({
    required this.id,
    required this.name,
    required this.filename,
    required this.extension,
    required this.width,
    required this.height,
    required this.size,
    required this.mimeType,
    required this.thumbnailUrl,
    required this.originalUrl,
    required this.createdAt,
    required this.importedAt,
    required this.date,
    required this.orientation,
    required this.tags,
    required this.folders,
  });

  factory MobileItem.fromJson(Map<String, dynamic> json) {
    return MobileItem(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      filename: json['filename'] as String? ?? '',
      extension: json['extension'] as String? ?? '',
      width: (json['width'] as num?)?.toInt() ?? 0,
      height: (json['height'] as num?)?.toInt() ?? 0,
      size: (json['size'] as num?)?.toInt() ?? 0,
      mimeType: json['mimeType'] as String? ?? '',
      thumbnailUrl: json['thumbnailUrl'] as String? ?? '',
      originalUrl: json['originalUrl'] as String? ?? '',
      createdAt: (json['createdAt'] as num?)?.toInt() ?? 0,
      importedAt: (json['importedAt'] as num?)?.toInt() ?? 0,
      date: (json['date'] as num?)?.toInt() ?? 0,
      orientation: json['orientation'] as String? ?? 'landscape',
      tags: (json['tags'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
      folders: (json['folders'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
    );
  }

  bool get isVideo =>
      mimeType.startsWith('video/') ||
      ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].contains(extension.toLowerCase());

  bool get isAudio =>
      mimeType.startsWith('audio/') ||
      ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].contains(extension.toLowerCase());

  DateTime get dateTime {
    if (date > 0) {
      return DateTime.fromMillisecondsSinceEpoch(date);
    }
    if (createdAt > 0) {
      return DateTime.fromMillisecondsSinceEpoch(createdAt);
    }
    return DateTime.fromMillisecondsSinceEpoch(importedAt);
  }

  String get formattedSize {
    if (size < 1024) return '$size B';
    if (size < 1024 * 1024) return '${(size / 1024).toStringAsFixed(1)} KB';
    if (size < 1024 * 1024 * 1024) return '${(size / (1024 * 1024)).toStringAsFixed(1)} MB';
    return '${(size / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
  }
}

class ItemDetail {
  final String id;
  final String name;
  final String filename;
  final String extension;
  final int size;
  final String mimeType;
  final int width;
  final int height;
  final String? dominantColor;
  final List<String> palette;
  final Map<String, dynamic>? meta;
  final String note;
  final String url;
  final int rating;
  final String prompt;
  final List<String> tags;
  final List<String> folders;
  final int createdAt;
  final int importedAt;

  ItemDetail({
    required this.id,
    required this.name,
    required this.filename,
    required this.extension,
    required this.size,
    required this.mimeType,
    required this.width,
    required this.height,
    this.dominantColor,
    required this.palette,
    this.meta,
    required this.note,
    required this.url,
    required this.rating,
    required this.prompt,
    required this.tags,
    required this.folders,
    required this.createdAt,
    required this.importedAt,
  });

  factory ItemDetail.fromJson(Map<String, dynamic> json) {
    return ItemDetail(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      filename: json['filename'] as String? ?? '',
      extension: json['extension'] as String? ?? '',
      size: (json['size'] as num?)?.toInt() ?? 0,
      mimeType: json['mimeType'] as String? ?? '',
      width: (json['width'] as num?)?.toInt() ?? 0,
      height: (json['height'] as num?)?.toInt() ?? 0,
      dominantColor: json['dominantColor'] as String?,
      palette: (json['palette'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
      meta: json['meta'] as Map<String, dynamic>?,
      note: json['note'] as String? ?? '',
      url: json['url'] as String? ?? '',
      rating: (json['rating'] as num?)?.toInt() ?? 0,
      prompt: json['prompt'] as String? ?? '',
      tags: (json['tags'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
      folders: (json['folders'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
      createdAt: (json['createdAt'] as num?)?.toInt() ?? 0,
      importedAt: (json['importedAt'] as num?)?.toInt() ?? 0,
    );
  }
}

class MobileTag {
  final String name;
  final int itemCount;

  MobileTag({
    required this.name,
    required this.itemCount,
  });

  factory MobileTag.fromJson(Map<String, dynamic> json) {
    return MobileTag(
      name: json['name'] as String? ?? '',
      itemCount: (json['itemCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class MobileFolder {
  final String id;
  final String name;
  final String parentId;
  final int itemCount;
  final List<MobileFolder> children;

  MobileFolder({
    required this.id,
    required this.name,
    required this.parentId,
    required this.itemCount,
    required this.children,
  });

  factory MobileFolder.fromJson(Map<String, dynamic> json) {
    final rawChildren = json['children'] as List<dynamic>? ?? [];
    return MobileFolder(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      parentId: json['parentId'] as String? ?? '',
      itemCount: (json['itemCount'] as num?)?.toInt() ?? 0,
      children: rawChildren
          .map((c) => MobileFolder.fromJson(c as Map<String, dynamic>))
          .toList(),
    );
  }
}
enum PairingErrorType {
  invalidCode,
  networkError,
  unauthorized,
  unknown,
}

class PairingException implements Exception {
  final PairingErrorType type;
  final String message;

  PairingException(this.type, this.message);

  @override
  String toString() => message;
}

class MobileLibrary {
  final String id;
  final String name;
  final String path;
  final int itemCount;
  final bool isActive;

  MobileLibrary({
    required this.id,
    required this.name,
    required this.path,
    required this.itemCount,
    required this.isActive,
  });

  factory MobileLibrary.fromJson(Map<String, dynamic> json) {
    return MobileLibrary(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      path: json['path'] as String? ?? '',
      itemCount: (json['itemCount'] as num?)?.toInt() ?? 0,
      isActive: json['isActive'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'path': path,
    'itemCount': itemCount,
    'isActive': isActive,
  };
}

class HistoryConnection {
  final String id;
  final String name;
  final List<String> ips;
  final int port;
  final String token;
  final int lastConnectedAt;

  HistoryConnection({
    required this.id,
    required this.name,
    required this.ips,
    required this.port,
    required this.token,
    required this.lastConnectedAt,
  });

  factory HistoryConnection.fromJson(Map<String, dynamic> json) {
    return HistoryConnection(
      id: json['id'] as String? ?? '${json['name']}-${json['port']}',
      name: json['name'] as String? ?? 'Bowerbird Desktop',
      ips: (json['ips'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
      port: (json['port'] as num?)?.toInt() ?? 17878,
      token: json['token'] as String? ?? '',
      lastConnectedAt: (json['lastConnectedAt'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'ips': ips,
    'port': port,
    'token': token,
    'lastConnectedAt': lastConnectedAt,
  };
}
