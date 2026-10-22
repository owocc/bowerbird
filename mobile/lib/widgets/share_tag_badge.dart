import 'package:flutter/material.dart';

/// Small provenance chip shown on shared items.
///
/// Placed bottom-left in the grids so it never overlaps the GIF (top-left) or
/// video/audio (top-right) badges.
class ShareTagBadge extends StatelessWidget {
  const ShareTagBadge({
    super.key,
    this.label = '分享',
    this.fontSize = 9,
    this.iconSize = 10,
    this.background = Colors.black54,
  });

  final String label;
  final double fontSize;
  final double iconSize;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.ios_share, color: Colors.white, size: iconSize),
          const SizedBox(width: 2),
          Text(
            label,
            style: TextStyle(
              color: Colors.white,
              fontSize: fontSize,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}
