import 'package:flutter/material.dart';

import '../../../models/item.dart';
import '../../../services/discovery_service.dart';

/// 连接页的历史连接列表 + 局域网发现列表。
///
/// 纯展示：所有动作通过回调交回 `ConnectScreen`。
class ConnectLists extends StatelessWidget {
  const ConnectLists({
    super.key,
    required this.history,
    required this.discovered,
    required this.scanning,
    required this.connecting,
    required this.onReconnect,
    required this.onRemoveHistory,
    required this.onConnect,
    required this.onScan,
  });

  final List<HistoryConnection> history;
  final List<DiscoveredServer> discovered;
  final bool scanning;
  final bool connecting;

  final ValueChanged<HistoryConnection> onReconnect;
  final ValueChanged<String> onRemoveHistory;
  final ValueChanged<String> onConnect;
  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
      // History Connections
      if (history.isNotEmpty) ...[
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'HISTORICAL CONNECTIONS / 历史连接',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ...history.map((conn) {
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: const CircleAvatar(child: Icon(Icons.history_rounded)),
              title: Text(conn.name, style: const TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Text('${conn.ips.join(", ")} • 端口: ${conn.port}'),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  FilledButton.tonal(
                    onPressed: connecting ? null : () => onReconnect(conn),
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
          );
        }),
        const SizedBox(height: 16),
      ],
      // Discovered Servers Header
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            'DISCOVERED DESKTOPS',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w500,
              color: Theme.of(context).colorScheme.outline,
            ),
          ),
          if (scanning)
            const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            IconButton(
              icon: const Icon(Icons.refresh, size: 20),
              tooltip: 'Rescan LAN',
              onPressed: onScan,
            ),
        ],
      ),
      const SizedBox(height: 8),

      // Discovered list
      if (discovered.isEmpty && !scanning)
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: 0.3)),
          ),
          child: Column(
            children: [
              Icon(Icons.devices_other, size: 36, color: Theme.of(context).colorScheme.outline),
              const SizedBox(height: 8),
              Text(
                'No desktop found via mDNS.\nMake sure Bowerbird is open on your PC.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
              ),
            ],
          ),
        )
      else
        ...discovered.map((server) {
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: const CircleAvatar(child: Icon(Icons.computer)),
              title: Text(server.name, style: const TextStyle(fontWeight: FontWeight.w500)),
              subtitle: Text('${server.host}:${server.port} • v${server.version}'),
              trailing: const Icon(Icons.chevron_right),
              onTap: connecting ? null : () => onConnect(server.url),
            ),
          );
        }),
      ],
    );
  }
}
