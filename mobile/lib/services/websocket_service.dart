import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'api_service.dart';

class WebSocketService {
  static final WebSocketService instance = WebSocketService._internal();
  WebSocketService._internal();

  WebSocket? _socket;
  Timer? _reconnectTimer;
  bool _isDisposed = false;
  int _reconnectAttempts = 0;

  final _libraryChangedController = StreamController<Map<String, dynamic>>.broadcast();
  final _itemsUpdatedController = StreamController<Map<String, dynamic>>.broadcast();
  final _pairingRevokedController = StreamController<void>.broadcast();

  Stream<Map<String, dynamic>> get onLibraryChanged => _libraryChangedController.stream;
  Stream<Map<String, dynamic>> get onItemsUpdated => _itemsUpdatedController.stream;
  Stream<void> get onPairingRevoked => _pairingRevokedController.stream;

  void connect() {
    _isDisposed = false;
    _reconnectTimer?.cancel();
    _doConnect();
  }

  Future<void> _doConnect() async {
    final api = ApiService.instance;
    if (!api.isConfigured || !api.isAuthenticated) return;

    final baseUrl = api.baseUrl!;
    final token = api.token!;
    final wsBase = baseUrl.replaceFirst('http://', 'ws://').replaceFirst('https://', 'wss://');
    final wsUrl = '$wsBase/api/v1/ws?token=$token';

    try {
      _socket?.close();
      _socket = await WebSocket.connect(wsUrl).timeout(const Duration(seconds: 5));
      _reconnectAttempts = 0;

      _socket!.listen(
        (data) {
          try {
            final json = jsonDecode(data.toString()) as Map<String, dynamic>;
            final event = json['event'] as String?;
            if (event == 'library_changed') {
              _libraryChangedController.add(json);
            } else if (event == 'items_updated') {
              _itemsUpdatedController.add(json);
            } else if (event == 'pairing_revoked') {
              _pairingRevokedController.add(null);
            }
          } catch (_) {}
        },
        onError: (err) {
          _scheduleReconnect();
        },
        onDone: () {
          _scheduleReconnect();
        },
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_isDisposed) return;
    _reconnectTimer?.cancel();
    _reconnectAttempts++;
    final delaySeconds = (_reconnectAttempts > 5) ? 30 : (1 << (_reconnectAttempts - 1));
    _reconnectTimer = Timer(Duration(seconds: delaySeconds), () {
      if (!_isDisposed) {
        _doConnect();
      }
    });
  }

  void disconnect() {
    _isDisposed = true;
    _reconnectTimer?.cancel();
    _socket?.close();
    _socket = null;
  }
}
