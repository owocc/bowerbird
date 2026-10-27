import 'package:flutter/material.dart';

import '../../../models/item.dart';
import '../../../services/discovery_service.dart';

/// 连接页的正文：Hero 卡片 + 历史连接 + 局域网发现 + 手动 IP 连接。
///
/// 从 `ConnectScreen.build`（250+ 行）整段抽出，页面只保留状态与动作。
class ConnectBody extends StatelessWidget {
  const ConnectBody({
    super.key,
    required this.history,
    required this.discovered,
    required this.isScanning,
    required this.isConnecting,
    required this.errorMessage,
    required this.ipController,
    required this.portController,
    required this.onScanQr,
    required this.onRescan,
    required this.onReconnect,
    required this.onRemoveHistory,
    required this.onSelectServer,
    required this.onManualConnect,
  });

  final List<HistoryConnection> history;
  final List<DiscoveredServer> discovered;
  final bool isScanning;
  final bool isConnecting;
  final String? errorMessage;
  final TextEditingController ipController;
  final TextEditingController portController;

  final VoidCallback onScanQr;
  final VoidCallback onRescan;
  final ValueChanged<HistoryConnection> onReconnect;
  final ValueChanged<String> onRemoveHistory;
  final ValueChanged<String> onSelectServer;
  final VoidCallback onManualConnect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _heroCard(theme),
          FilledButton.icon(
            onPressed: onScanQr,
            icon: const Icon(Icons.qr_code_scanner),
            label: const Text('扫描桌面端二维码'),
            style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
          ),
          const SizedBox(height: 24),
          if (history.isNotEmpty) ..._historySection(theme),
          _discoveredHeader(theme),
          const SizedBox(height: 8),
          if (discovered.isEmpty && !isScanning) _emptyDiscovery(theme) else ..._discoveredList(),
          const SizedBox(height: 28),
          _manualSection(theme),
        ],
      ),
    );
  }

  Widget _heroCard(ThemeData theme) {
    return Card(
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
                  Text('本地素材库', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    '手机与电脑需连接到同一个 Wi-Fi 网络。',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _historySection(ThemeData theme) {
    return [
      Text(
        '历史连接',
        style: theme.textTheme.labelMedium?.copyWith(
          fontWeight: FontWeight.bold,
          color: theme.colorScheme.primary,
        ),
      ),
      const SizedBox(height: 8),
      for (final conn in history)
        Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: const CircleAvatar(child: Icon(Icons.history_rounded)),
            title: Text(conn.name, style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text('${conn.ips.join(", ")} • 端口: ${conn.port}'),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                FilledButton.tonal(
                  onPressed: isConnecting ? null : () => onReconnect(conn),
                  child: const Text('重连'),
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline, size: 20),
                  tooltip: '删除此连接',
                  onPressed: () => onRemoveHistory(conn.id),
                ),
              ],
            ),
          ),
        ),
      const SizedBox(height: 16),
    ];
  }

  Widget _discoveredHeader(ThemeData theme) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          '发现附近的桌面端',
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w500,
            color: theme.colorScheme.outline,
          ),
        ),
        if (isScanning)
          const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
        else
          IconButton(
            icon: const Icon(Icons.refresh, size: 20),
            tooltip: '重新扫描',
            onPressed: onRescan,
          ),
      ],
    );
  }

  Widget _emptyDiscovery(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.dividerColor.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Icon(Icons.devices_other, size: 36, color: theme.colorScheme.outline),
          const SizedBox(height: 8),
          Text(
            '未通过 mDNS 发现桌面端。\n请确认电脑上的 Bowerbird 已打开。',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
          ),
        ],
      ),
    );
  }

  List<Widget> _discoveredList() {
    return [
      for (final server in discovered)
        Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: const CircleAvatar(child: Icon(Icons.computer)),
            title: Text(server.name, style: const TextStyle(fontWeight: FontWeight.w500)),
            subtitle: Text('${server.host}:${server.port} • v${server.version}'),
            trailing: const Icon(Icons.chevron_right),
            onTap: isConnecting ? null : () => onSelectServer(server.url),
          ),
        ),
    ];
  }

  Widget _manualSection(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '手动输入 IP',
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
                controller: ipController,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(
                  labelText: 'IP 地址',
                  hintText: '192.168.1.100',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.lan_outlined),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: portController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: '端口',
                  hintText: '17878',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (errorMessage != null) _errorBox(theme, errorMessage!),
        FilledButton.icon(
          onPressed: isConnecting ? null : onManualConnect,
          icon: isConnecting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Icon(Icons.arrow_forward),
          label: Text(isConnecting ? '连接中…' : '连接到桌面端'),
          style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
        ),
      ],
    );
  }

  Widget _errorBox(ThemeData theme, String message) {
    return Container(
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
              message,
              style: TextStyle(color: theme.colorScheme.onErrorContainer),
            ),
          ),
        ],
      ),
    );
  }
}
