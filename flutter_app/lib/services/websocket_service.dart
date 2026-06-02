import 'dart:async';
import 'dart:io';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/io.dart';
import '../config/api_config.dart';
import '../models/ws_message.dart';
import 'auth_service.dart';

class WebSocketService {
  final AuthService _auth;
  WebSocketChannel? _channel;
  bool _connected = false;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  // Set by an explicit disconnect() so we stop fighting the user with retries.
  bool _stopped = false;
  static const _maxReconnectDelay = 30;

  final _messageController = StreamController<WsMessage>.broadcast();
  // Emits on every connection transition (true = up, false = lost). Providers
  // subscribe to this so the UI and terminal state react to silent auto-
  // reconnects — not only to the manual connect() call. Without it, the socket
  // could come back while the app still shows "disconnected".
  final _statusController = StreamController<bool>.broadcast();

  Stream<WsMessage> get messages => _messageController.stream;
  Stream<bool> get connectionStatus => _statusController.stream;
  bool get isConnected => _connected;

  Stream<WsMessage> channelStream(String channel) =>
      messages.where((msg) => msg.channel == channel);

  Stream<WsMessage> channelPrefixStream(String prefix) =>
      messages.where((msg) => msg.channel.startsWith(prefix));

  WebSocketService(this._auth);

  // Flip the connection flag and notify listeners, but only on a real change so
  // we don't spam the status stream.
  void _setConnected(bool value) {
    if (_connected == value) return;
    _connected = value;
    if (!_statusController.isClosed) _statusController.add(value);
  }

  Future<bool> connect() async {
    if (_connected) return true;
    _stopped = false;

    final ticket = await _auth.getWsTicket();
    if (ticket == null) {
      _scheduleReconnect();
      return false;
    }

    try {
      final wsUrl = '${ApiConfig.wsUrl}/ws?ticket=$ticket';

      // Try IOWebSocketChannel first (native, better SSL), fallback to generic
      try {
        final socket = await WebSocket.connect(
          wsUrl,
          headers: {'Origin': ApiConfig.baseUrl},
        ).timeout(const Duration(seconds: 10));
        _channel = IOWebSocketChannel(socket);
      } catch (_) {
        // Fallback to generic WebSocketChannel
        _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
        await _channel!.ready.timeout(const Duration(seconds: 10));
      }

      _reconnectAttempts = 0;
      _setConnected(true);

      _channel!.stream.listen(
        (data) {
          try {
            final msg = WsMessage.fromJson(data as String);
            _messageController.add(msg);
          } catch (_) {}
        },
        onDone: () {
          _setConnected(false);
          _scheduleReconnect();
        },
        onError: (_) {
          _setConnected(false);
          _scheduleReconnect();
        },
      );

      return true;
    } catch (_) {
      _setConnected(false);
      _scheduleReconnect();
      return false;
    }
  }

  void send(WsMessage message) {
    if (_connected && _channel != null) {
      _channel!.sink.add(message.toJson());
    }
  }

  void _scheduleReconnect() {
    if (_stopped) return; // explicit disconnect — don't auto-reconnect
    _reconnectTimer?.cancel();
    final delay = (_reconnectAttempts * 2).clamp(1, _maxReconnectDelay);
    _reconnectAttempts++;
    _reconnectTimer = Timer(Duration(seconds: delay), () {
      if (!_stopped) connect();
    });
  }

  Future<void> disconnect() async {
    _stopped = true;
    _reconnectTimer?.cancel();
    _setConnected(false);
    try {
      await _channel?.sink.close();
    } catch (_) {}
    _channel = null;
  }

  void dispose() {
    disconnect();
    _messageController.close();
    _statusController.close();
  }
}
