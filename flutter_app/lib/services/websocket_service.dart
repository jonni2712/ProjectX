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
  static const _maxReconnectDelay = 30;

  final _messageController = StreamController<WsMessage>.broadcast();
  Stream<WsMessage> get messages => _messageController.stream;
  bool get isConnected => _connected;

  Stream<WsMessage> channelStream(String channel) =>
      messages.where((msg) => msg.channel == channel);

  Stream<WsMessage> channelPrefixStream(String prefix) =>
      messages.where((msg) => msg.channel.startsWith(prefix));

  WebSocketService(this._auth);

  Future<bool> connect() async {
    if (_connected) return true;

    final ticket = await _auth.getWsTicket();
    if (ticket == null) return false;

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

      _connected = true;
      _reconnectAttempts = 0;

      _channel!.stream.listen(
        (data) {
          try {
            final msg = WsMessage.fromJson(data as String);
            _messageController.add(msg);
          } catch (_) {}
        },
        onDone: () {
          _connected = false;
          _scheduleReconnect();
        },
        onError: (_) {
          _connected = false;
          _scheduleReconnect();
        },
      );

      return true;
    } catch (_) {
      _connected = false;
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
    _reconnectTimer?.cancel();
    final delay = (_reconnectAttempts * 2).clamp(1, _maxReconnectDelay);
    _reconnectAttempts++;
    _reconnectTimer = Timer(Duration(seconds: delay), () => connect());
  }

  Future<void> disconnect() async {
    _reconnectTimer?.cancel();
    _connected = false;
    try {
      await _channel?.sink.close();
    } catch (_) {}
    _channel = null;
  }

  void dispose() {
    disconnect();
    _messageController.close();
  }
}
