import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:http/http.dart' as http;
import '../models/item.dart';
import '../services/api_service.dart';
import 'home_screen.dart';

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final MobileScannerController _controller = MobileScannerController();
  bool _isProcessing = false;
  String? _statusText;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_isProcessing) return;
    final barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;

    final rawValue = barcodes.first.rawValue;
    if (rawValue == null || rawValue.isEmpty) return;

    _handleScannedData(rawValue);
  }

  Future<void> _handleScannedData(String raw) async {
    setState(() {
      _isProcessing = true;
      _statusText = 'Analyzing pairing data...';
    });

    try {
      Map<String, dynamic>? payload = parsePairingData(raw);
      if (payload == null) {
        throw Exception('Unrecognized QR code format. Expected Bowerbird pairing code.');
      }

      final ips = (payload['ips'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [];
      final port = (payload['port'] as num?)?.toInt() ?? 17878;
      final code = payload['code']?.toString() ?? '';

      if (ips.isEmpty) {
        throw Exception('No candidate IP addresses in pairing QR code.');
      }

      setState(() => _statusText = 'Probing candidate IPs (${ips.length})...');

      String? responsiveHost;
      for (final ip in ips) {
        final host = 'http://$ip:$port';
        setState(() => _statusText = 'Trying $ip:$port...');
        final isAlive = await _probeHost(host);
        if (isAlive) {
          responsiveHost = host;
          break;
        }
      }

      if (responsiveHost == null) {
        throw Exception('Cannot reach desktop on any candidate IP ($ips:$port). Ensure devices are on same Wi-Fi / Tailscale.');
      }

      setState(() => _statusText = 'Pairing with desktop...');
      await ApiService.instance.pair(
        host: responsiveHost,
        code: code,
        deviceName: 'Mobile Scanner',
        candidateIps: ips,
        port: port,
      );
      if (mounted) {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const HomeScreen()),
          (route) => false,
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isProcessing = false;
          _statusText = null;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e is PairingException
                  ? e.message
                  : '连接失败: ${e.toString().replaceAll('Exception: ', '')}',
            ),
            backgroundColor: Colors.red.shade700,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  static Map<String, dynamic>? parsePairingData(String input) {
    String text = input.trim();
    if (text.startsWith('bowerbird://pair')) {
      final uri = Uri.tryParse(text);
      if (uri != null) {
        final dataParam = uri.queryParameters['data'];
        if (dataParam != null && dataParam.isNotEmpty) {
          try {
            return jsonDecode(dataParam) as Map<String, dynamic>;
          } catch (_) {
            return null;
          }
        }
      }
    }

    // Also support raw JSON fallback
    if (text.startsWith('{') && text.endsWith('}')) {
      try {
        final json = jsonDecode(text) as Map<String, dynamic>;
        if (json.containsKey('ips') || json.containsKey('code')) {
          return json;
        }
      } catch (_) {}
    }

    return null;
  }

  Future<bool> _probeHost(String host) async {
    try {
      final uri = Uri.parse('$host/api/v1/status');
      final res = await http.get(uri).timeout(const Duration(seconds: 3));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan QR Code'),
        actions: [
          IconButton(
            icon: const Icon(Icons.flash_on),
            onPressed: () => _controller.toggleTorch(),
          ),
          IconButton(
            icon: const Icon(Icons.flip_camera_ios),
            onPressed: () => _controller.switchCamera(),
          ),
        ],
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error, child) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.videocam_off_outlined, color: Colors.amber, size: 52),
                      const SizedBox(height: 16),
                      Text(
                        '相机启动异常',
                        style: theme.textTheme.titleMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        error.errorCode == MobileScannerErrorCode.permissionDenied
                            ? '未授予相机使用权限，请在手机系统设置中允许 Bowerbird 访问相机'
                            : (error.errorDetails?.message ?? '无法调起相机硬件，请检查设备相机或重启 App 重试'),
                        style: const TextStyle(color: Colors.white70, fontSize: 13),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        icon: const Icon(Icons.refresh),
                        label: const Text('重试'),
                        onPressed: () => _controller.start(),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
          // Viewfinder overlay
          Center(
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                border: Border.all(color: theme.colorScheme.primary, width: 3),
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
          if (_isProcessing)
            Container(
              color: Colors.black54,
              child: Center(
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const CircularProgressIndicator(),
                        const SizedBox(height: 16),
                        Text(
                          _statusText ?? 'Connecting...',
                          style: theme.textTheme.bodyMedium,
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          Positioned(
            bottom: 32,
            left: 20,
            right: 20,
            child: Card(
              color: Colors.black87,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Text(
                  'Point camera at the QR code displayed in Bowerbird Desktop Settings -> Mobile Connection.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
