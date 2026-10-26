import 'package:flutter/material.dart';

/// 6 位配对码输入对话框。
///
/// 与 `ConnectScreen` 的状态解耦：输入内容、错误提示、提交流程都在内部处理，
/// 只通过 [onSubmit] 把结果交回页面。
class PairingCodeDialog extends StatefulWidget {
  const PairingCodeDialog({
    super.key,
    required this.libraryName,
    required this.onSubmit,
  });

  final String libraryName;

  /// 返回 null 表示成功（对话框会自行关闭），返回错误文案则展示在输入框下方。
  final Future<String?> Function(String code) onSubmit;

  @override
  State<PairingCodeDialog> createState() => _PairingCodeDialogState();
}

class _PairingCodeDialogState extends State<PairingCodeDialog> {
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
      setState(() => _error = 'Please enter a 6-digit code');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.onSubmit(code);
    if (!mounted) return;
    if (error == null) {
      Navigator.pop(context);
    } else {
      setState(() {
        _busy = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Pair with Desktop'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Enter the 6-digit pairing code displayed in Bowerbird desktop settings '
            'on "${widget.libraryName}":',
            style: Theme.of(context).textTheme.bodyMedium,
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
            onSubmitted: (_) => _submit(),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Pair & Connect'),
        ),
      ],
    );
  }
}
