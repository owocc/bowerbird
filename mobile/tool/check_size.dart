// 检查 Dart 文件行数是否超过规范上限。
//
// 用法：dart run tool/check_size.dart [--max=400] [--strict]
//   --max=400   行数上限（默认 400，见 CODE_STYLE.md）
//   --strict    把超限视为错误（退出码 1），否则只警告
//
// 只统计 lib/ 与 test/ 下的 .dart 文件，跳过生成代码。
import 'dart:io';

const _defaultMaxLines = 400;
const _roots = ['lib', 'test'];
const _skipMarkers = ['.g.dart', '.freezed.dart', '.gen.dart'];

void main(List<String> args) {
  var maxLines = _defaultMaxLines;
  var strict = false;
  for (final arg in args) {
    if (arg.startsWith('--max=')) {
      maxLines = int.tryParse(arg.substring('--max='.length)) ?? maxLines;
    } else if (arg == '--strict') {
      strict = true;
    }
  }

  final offenders = <({String path, int lines})>[];
  for (final root in _roots) {
    final dir = Directory(root);
    if (!dir.existsSync()) continue;
    for (final entity in dir.listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      if (_skipMarkers.any(entity.path.endsWith)) continue;
      final lines = entity.readAsLinesSync().length;
      if (lines > maxLines) {
        offenders.add((path: entity.path, lines: lines));
      }
    }
  }

  if (offenders.isEmpty) {
    stdout.writeln('OK: 所有文件均 ≤ $maxLines 行');
    return;
  }

  offenders.sort((a, b) => b.lines.compareTo(a.lines));
  stdout.writeln('以下文件超过 $maxLines 行上限：');
  for (final o in offenders) {
    stdout.writeln('  ${o.lines.toString().padLeft(5)}  ${o.path}');
  }
  stdout.writeln('\n共 ${offenders.length} 个文件。参见 mobile/CODE_STYLE.md');

  if (strict) exitCode = 1;
}
