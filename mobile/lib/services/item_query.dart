/// Structured mobile query mapped to the desktop query-string grammar.
///
/// The query string is the wire contract; this class is the single place that
/// builds it so browse, search and fallback stay consistent.
class ItemQuery {
  const ItemQuery({
    this.text = '',
    this.type = '',
    this.orientation = '',
    this.tag,
    this.folder,
    this.color,
    this.size = '',
    this.rating,
    this.hasUrl = '',
    this.hasNote = '',
    this.untagged = false,
    this.uncategorized = false,
  });

  final String text;
  final String type;
  final String orientation;
  final String? tag;
  final String? folder;
  final String? color;
  final String size;
  final int? rating;

  /// '', 'has' or 'empty'.
  final String hasUrl;
  final String hasNote;

  /// Virtual collections from the desktop sidebar (`is:untagged` / `is:uncategorized`).
  final bool untagged;
  final bool uncategorized;

  String toQueryString() {
    final parts = <String>[];
    final trimmed = text.trim();
    if (trimmed.isNotEmpty) {
      // Always quote free text so a literal "tag:foo" typed in the search box
      // cannot turn into a filter.
      parts.add(quoteQueryValue(trimmed));
    }
    if (type.isNotEmpty) parts.add('type:${_value(type)}');
    if (orientation.isNotEmpty) parts.add('orientation:${_value(orientation)}');
    if (untagged) parts.add('is:untagged');
    if (uncategorized) parts.add('is:uncategorized');
    if (tag != null && tag!.trim().isNotEmpty) parts.add('tag:${_value(tag!)}');
    if (folder != null && folder!.trim().isNotEmpty) parts.add('folder:${_value(folder!)}');
    if (color != null && color!.trim().isNotEmpty) parts.add('color:${_value(color!)}');
    if (size.isNotEmpty) parts.add('size:${_value(size)}');
    if (rating != null) parts.add('rating:$rating');
    switch (hasUrl) {
      case 'has':
        parts.add('has:url');
      case 'empty':
        parts.add('no:url');
    }
    switch (hasNote) {
      case 'has':
        parts.add('has:note');
      case 'empty':
        parts.add('no:note');
    }
    return parts.join(' ');
  }

  static String _value(String value) => quoteQueryValue(value.trim());

  /// Quotes a value when it contains spaces, quotes, backslashes or a colon.
  /// Plain values stay readable (`type:image`).
  static String quoteQueryValue(String value) {
    final escaped = value.replaceAll(r'\', r'\\').replaceAll('"', r'\"');
    if (RegExp(r'[\s:"]').hasMatch(value)) {
      return '"$escaped"';
    }
    return escaped;
  }
}
