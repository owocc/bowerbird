import 'package:flutter/widgets.dart';

/// Tabler Icons（24×24 描边风格）的少量移植，让移动端与桌面端使用同一套图标。
///
/// 桌面端通过 `~icons/tabler/<name>` 引入这些 SVG，这里用 [Path] 还原同样的
/// 几何数据，因此两边视觉一致。描边颜色取 [color] 或 [IconTheme]，
/// 描边宽度按 24dp = 2px 等比缩放（与 SVG 的 stroke-width 一致）。
enum TablerIconName {
  /// `tabler/inbox`：全部素材
  inbox,

  /// `tabler/bookmark-question`：未打标签
  bookmarkQuestion,

  /// `tabler/bookmark`：标签
  bookmark,

  /// `tabler/folder-question`：未分类
  folderQuestion,

  /// `tabler/clock`：使用历史
  clock,

  /// `tabler/trash`：废纸篓
  trash,

  /// `tabler/plus`：新建
  plus,
}

class TablerIcon extends StatelessWidget {
  const TablerIcon(
    this.name, {
    super.key,
    this.size = 24,
    this.color,
    this.strokeWidth = 2,
  });

  final TablerIconName name;
  final double size;
  final Color? color;

  /// 以 24dp 为基准的描边宽度。
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    final resolved = color ?? IconTheme.of(context).color ?? const Color(0xFF000000);
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _TablerIconPainter(
          name: name,
          color: resolved,
          strokeWidth: strokeWidth * size / 24,
        ),
      ),
    );
  }
}

class _TablerIconPainter extends CustomPainter {
  const _TablerIconPainter({
    required this.name,
    required this.color,
    required this.strokeWidth,
  });

  final TablerIconName name;
  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 24.0;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth / scale
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..color = color;

    canvas.save();
    canvas.scale(scale);
    for (final d in _paths[name]!) {
      canvas.drawPath(parseSvgPath(d), paint);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_TablerIconPainter old) =>
      old.name != name || old.color != color || old.strokeWidth != strokeWidth;
}

/// 各图标的路径数据直接取自 @iconify-json/tabler（与桌面端同一份数据）。
const Map<TablerIconName, List<String>> _paths = {
  TablerIconName.inbox: [
    'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
    'M4 13h3l3 3h4l3-3h3',
  ],
  TablerIconName.bookmarkQuestion: [
    'm15 19l-3-2l-6 4V7a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v4m1 11v.01M19 19a2.003 2.003 0 0 0 .914-3.782a1.98 1.98 0 0 0-2.414.483',
  ],
  TablerIconName.bookmark: [
    'M18 7v14l-6-4l-6 4V7a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4',
  ],
  TablerIconName.folderQuestion: [
    'M15 19H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v2.5M19 22v.01',
    'M19 19a2.003 2.003 0 0 0 .914-3.782a1.98 1.98 0 0 0-2.414.483',
  ],
  TablerIconName.clock: [
    'M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0',
    'M12 7v5l3 3',
  ],
  TablerIconName.trash: [
    'M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3',
  ],
  TablerIconName.plus: ['M12 5v14m-7-7h14'],
};

/// 把 SVG path 的 `d` 字符串解析成 [Path]。
///
/// 支持 Tabler 图标实际使用的 M/L/H/V/C/A/Z 指令（含相对形式），其中 A
/// 用三次贝塞尔近似（图标里只出现在圆角矩形的 `a2 2 0 ...` 处）。
Path parseSvgPath(String d) {
  final tokens = RegExp(r'[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?')
      .allMatches(d)
      .map((m) => m.group(0)!)
      .toList();

  final path = Path();
  var i = 0;
  var current = Offset.zero;
  var start = Offset.zero;
  var command = '';

  double number() => double.parse(tokens[i++]);

  while (i < tokens.length) {
    final token = tokens[i];
    if (RegExp(r'^[MmLlHhVvCcSsQqTtAaZz]$').hasMatch(token)) {
      command = token;
      i++;
    }
    final absolute = command == command.toUpperCase();
    switch (command.toUpperCase()) {
      case 'M':
        final point = Offset(number(), number());
        current = absolute ? point : current + point;
        start = current;
        path.moveTo(current.dx, current.dy);
        command = absolute ? 'L' : 'l';
      case 'L':
        final point = Offset(number(), number());
        current = absolute ? point : current + point;
        path.lineTo(current.dx, current.dy);
      case 'H':
        final x = number();
        current = Offset(absolute ? x : current.dx + x, current.dy);
        path.lineTo(current.dx, current.dy);
      case 'V':
        final y = number();
        current = Offset(current.dx, absolute ? y : current.dy + y);
        path.lineTo(current.dx, current.dy);
      case 'C':
        final c1 = Offset(number(), number());
        final c2 = Offset(number(), number());
        final end = Offset(number(), number());
        final a1 = absolute ? c1 : current + c1;
        final a2 = absolute ? c2 : current + c2;
        final target = absolute ? end : current + end;
        path.cubicTo(a1.dx, a1.dy, a2.dx, a2.dy, target.dx, target.dy);
        current = target;
      case 'S':
        final c2 = Offset(number(), number());
        final end = Offset(number(), number());
        final a2 = absolute ? c2 : current + c2;
        final target = absolute ? end : current + end;
        path.quadraticBezierTo(a2.dx, a2.dy, target.dx, target.dy);
        current = target;
      case 'Q':
        final c = Offset(number(), number());
        final end = Offset(number(), number());
        final control = absolute ? c : current + c;
        final target = absolute ? end : current + end;
        path.quadraticBezierTo(control.dx, control.dy, target.dx, target.dy);
        current = target;
      case 'T':
        final point = Offset(number(), number());
        current = absolute ? point : current + point;
        path.lineTo(current.dx, current.dy);
      case 'A':
        // rx ry rotation large-arc sweep x y
        final rx = number();
        final ry = number();
        number(); // x-axis-rotation
        number(); // large-arc-flag
        number(); // sweep-flag
        final end = Offset(number(), number());
        final target = absolute ? end : current + end;
        path.arcToPoint(
          target,
          radius: Radius.elliptical(rx.abs(), ry.abs()),
        );
        current = target;
      case 'Z':
        path.close();
        current = start;
      default:
        i++;
    }
  }
  return path;
}

/// 某个图标的原始 SVG path 数据（供测试与自定义绘制复用）。
@visibleForTesting
List<String> tablerPathData(TablerIconName name) => _paths[name]!;
