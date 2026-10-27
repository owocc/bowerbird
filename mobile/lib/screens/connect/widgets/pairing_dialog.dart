import 'package:flutter/material.dart';

/// 配对弹窗：输入桌面端显示的 6 位连接码。
///
/// 从 `ConnectScreen` 抽出，同时修掉原实现里 "Pair & Connect" 按钮为空的问题。
class PairingDialog extends StatefulWidget {
  const PairingDialog({
    super.key,
    required this.hostUrl,
    required this.libraryName,
    required this.onPair,
  });

  final String hostUrl;
  final String libraryName;

  /// 执行配对；返回错误消息表示失败，null 表示成功。
  final Future<String?> Function(String code) onPair;

  @override
  State<PairingDialog> createState() => _PairingDialogState();
}

class _PairingDialogState extends State<PairingDialog> {
  final _controller = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _controller.text.trim();
    if (code.length != 6) {
      setState(() => _error = '请输入 6 位连接码');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.onPair(code);
    if (!mounted) return;
    if (error == null) {
      Navigator.pop(context);
      return;
    }
    setState(() {
      _busy = false;
      _error = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: const Text('配对桌面端'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '输入「${widget.libraryName}」在桌面端设置里显示的 6 位配对码：',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            keyboardType: TextInputType.number,
            maxLength: 6,
            autofocus: true,
            enabled: !_busy,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 28, letterSpacing: 8, fontWeight: FontWeight.bold),
            decoration: InputDecoration(
              hintText: '000000',
              errorText: _error,
              border: const OutlineInputBorder(),
            ),
            onSubmitted: (_) => _busy ? null : _submit(),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('配对并连接'),
        ),
      ],
    );
  }
}
