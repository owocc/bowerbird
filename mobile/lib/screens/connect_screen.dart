import 'package:flutter/material.dart';
import '../models/item.dart';
import '../services/api_service.dart';
import '../services/discovery_service.dart';
import 'connect/widgets/connect_lists.dart';
import 'connect/widgets/pairing_code_dialog.dart';
import 'home_screen.dart';
import 'scan_screen.dart';
class ConnectScreen extends StatefulWidget {
  const ConnectScreen({super.key});

  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  final _ipController = TextEditingController(text: '192.168.');
  final _portController = TextEditingController(text: '17878');

  List<DiscoveredServer> _discoveredServers = [];
  List<HistoryConnection> _historyConnections = [];
  bool _isScanning = false;
  bool _isConnecting = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _startScan();
    _loadHistory();
  }

  @override
  void dispose() {
    _ipController.dispose();
    _portController.dispose();
    super.dispose();
  }

  Future<void> _loadHistory() async {
    final list = await ApiService.instance.getHistoryConnections();
    if (mounted) setState(() => _historyConnections = list);
  }

  Future<void> _reconnect(HistoryConnection conn) async {
    setState(() {
      _isConnecting = true;
      _errorMessage = null;
    });
    try {
      final success = await ApiService.instance.reconnect(conn);
      if (!mounted) return;
      setState(() => _isConnecting = false);
      if (success) {
        _navigateToHome();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('重连失败：候选 IP (${conn.ips.join(", ")}) 均无法连通电脑，请确认设备在同一网络'),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isConnecting = false;
          _errorMessage = e.toString().replaceAll('Exception: ', '');
        });
      }
    }
  }

  Future<void> _removeHistory(String id) async {
    await ApiService.instance.removeHistoryConnection(id);
    _loadHistory();
  }
  Future<void> _startScan() async {
    if (_isScanning) return;
    setState(() {
      _isScanning = true;
      _errorMessage = null;
    });

    try {
      final servers = await DiscoveryService.discover();
      if (mounted) {
        setState(() {
          _discoveredServers = servers;
          _isScanning = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isScanning = false);
      }
    }
  }

  Future<void> _connectToServer(String hostUrl) async {
    setState(() {
      _isConnecting = true;
      _errorMessage = null;
    });

    try {
      final status = await ApiService.instance.getStatus(targetHost: hostUrl);
      if (!mounted) return;

      setState(() => _isConnecting = false);

      if (status.pairingRequired) {
        _showPairingDialog(hostUrl, status.name);
      } else {
        ApiService.instance.baseUrl = hostUrl;
        _navigateToHome();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isConnecting = false;
          _errorMessage = e.toString().replaceAll('Exception: ', '');
        });
      }
    }
  }

  Future<void> _showPairingDialog(String hostUrl, String libraryName) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => PairingCodeDialog(
        libraryName: libraryName,
        onSubmit: (code) => _pair(hostUrl, code),
      ),
    );
  }

  /// 返回 null 表示配对成功；否则返回错误提示文案。
  Future<String?> _pair(String hostUrl, String code) async {
    try {
      await ApiService.instance.pair(host: hostUrl, code: code);
      if (mounted) _navigateToHome();
      return null;
    } catch (e) {
      if (e is PairingException) return e.message;
      if (e.toString().contains('invalid_code') || e.toString().contains('401')) {
        return '连接码错误，请重新核对桌面端显示的 6 位配对码';
      }
      return e.toString().replaceAll('Exception: ', '');
    }
  }

  void _navigateToHome() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const HomeScreen()),
    );
  }

  void _connectManual() {
    final ip = _ipController.text.trim();
    final port = _portController.text.trim();
    if (ip.isEmpty) {
      setState(() => _errorMessage = 'Please enter desktop IP address');
      return;
    }
    final url = 'http://$ip:${port.isNotEmpty ? port : '17878'}';
    _connectToServer(url);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Connect to Bowerbird'),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.qr_code_scanner),
            tooltip: 'Scan QR Code',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ScanScreen()),
              );
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Hero card
            Card(
              elevation: 0,
              color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Icon(Icons.wifi_tethering, size: 40, color: theme.colorScheme.primary),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Local Material Library',
                            style: theme.textTheme.titleMedium,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Connect phone and computer to the same Wi-Fi network.',
                            style: theme.textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Quick QR Scan Button Card
            FilledButton.icon(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ScanScreen()),
                );
              },
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scan Desktop QR Code'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
            const SizedBox(height: 20),
            const SizedBox(height: 24),

            ConnectLists(
              history: _historyConnections,
              discovered: _discoveredServers,
              scanning: _isScanning,
              connecting: _isConnecting,
              onReconnect: (conn) => _reconnect(conn),
              onRemoveHistory: _removeHistory,
              onConnect: (url) => _connectToServer(url),
              onScan: _startScan,
            ),

            const SizedBox(height: 28),

            // Manual Connect Section
            Text(
              'MANUAL IP CONNECTION',
              style: theme.textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.bold,
                color: theme.colorScheme.primary,
              ),
            ),
            const SizedBox(height: 12),

            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 3,
                  child: TextField(
                    controller: _ipController,
                    keyboardType: TextInputType.url,
                    decoration: const InputDecoration(
                      labelText: 'IP Address',
                      hintText: '192.168.1.100',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.lan_outlined),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 1,
                  child: TextField(
                    controller: _portController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Port',
                      hintText: '17878',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            if (_errorMessage != null)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: theme.colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.error_outline, color: theme.colorScheme.error),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _errorMessage!,
                        style: TextStyle(color: theme.colorScheme.onErrorContainer),
                      ),
                    ),
                  ],
                ),
              ),

            FilledButton.icon(
              onPressed: _isConnecting ? null : _connectManual,
              icon: _isConnecting
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.arrow_forward),
              label: Text(_isConnecting ? 'Connecting...' : 'Connect to Desktop'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
