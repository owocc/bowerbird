import 'dart:async';
import 'package:multicast_dns/multicast_dns.dart';

class DiscoveredServer {
  final String name;
  final String host;
  final int port;
  final String version;
  final bool pairingRequired;

  DiscoveredServer({
    required this.name,
    required this.host,
    required this.port,
    required this.version,
    required this.pairingRequired,
  });

  String get url => 'http://$host:$port';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DiscoveredServer &&
          runtimeType == other.runtimeType &&
          host == other.host &&
          port == other.port;

  @override
  int get hashCode => host.hashCode ^ port.hashCode;
}

class DiscoveryService {
  static const String _serviceType = '_bowerbird._tcp.local';

  static Future<List<DiscoveredServer>> discover({Duration timeout = const Duration(seconds: 4)}) async {
    final results = <DiscoveredServer>{};
    MDnsClient? client;

    try {
      client = MDnsClient();
      await client.start();

      final pointerStream = client.lookup<PtrResourceRecord>(
        ResourceRecordQuery.serverPointer(_serviceType),
      );

      await for (final ptr in pointerStream.timeout(timeout, onTimeout: (sink) => sink.close())) {
        final srvStream = client.lookup<SrvResourceRecord>(
          ResourceRecordQuery.service(ptr.domainName),
        );

        await for (final srv in srvStream.timeout(const Duration(seconds: 2), onTimeout: (sink) => sink.close())) {
          // Look up IP
          String? resolvedHost;
          try {
            final aStream = client.lookup<IPAddressResourceRecord>(
              ResourceRecordQuery.addressIPv4(srv.target),
            );
            await for (final ip in aStream.timeout(const Duration(seconds: 2), onTimeout: (sink) => sink.close())) {
              resolvedHost = ip.address.address;
              break;
            }
          } catch (_) {}

          // Read TXT records for version and pairingRequired
          String version = '1.0.0';
          bool pairingRequired = true;
          try {
            final txtStream = client.lookup<TxtResourceRecord>(
              ResourceRecordQuery.text(ptr.domainName),
            );
            await for (final txt in txtStream.timeout(const Duration(seconds: 2), onTimeout: (sink) => sink.close())) {
              final raw = txt.text;
              for (final line in raw.split('\n')) {
                if (line.startsWith('version=')) {
                  version = line.substring('version='.length).trim();
                } else if (line.startsWith('pairingRequired=')) {
                  pairingRequired = line.substring('pairingRequired='.length).trim().toLowerCase() == 'true';
                }
              }
            }
          } catch (_) {}

          if (resolvedHost != null && resolvedHost.isNotEmpty) {
            String displayName = srv.name;
            if (displayName.contains('._bowerbird')) {
              displayName = displayName.substring(0, displayName.indexOf('._bowerbird'));
            }
            results.add(DiscoveredServer(
              name: displayName.isNotEmpty ? displayName : 'Bowerbird Desktop',
              host: resolvedHost,
              port: srv.port,
              version: version,
              pairingRequired: pairingRequired,
            ));
          }
        }
      }
    } catch (e) {
      // mDNS may fail on certain VPNs or network restrictions
    } finally {
      client?.stop();
    }

    return results.toList();
  }
}
