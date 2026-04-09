import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../services/terminal_service.dart';
import '../services/claude_service.dart';
import 'auth_provider.dart';

final apiServiceProvider = Provider<ApiService>((ref) {
  return ApiService(ref.read(authServiceProvider));
});

final wsServiceProvider = Provider<WebSocketService>((ref) {
  return WebSocketService(ref.read(authServiceProvider));
});

final terminalServiceProvider = Provider<TerminalService>((ref) {
  return TerminalService(ref.read(wsServiceProvider));
});

final claudeServiceProvider = Provider<ClaudeService>((ref) {
  return ClaudeService(ref.read(wsServiceProvider));
});

final connectionStateProvider = StateNotifierProvider<ConnectionNotifier, ConnectionState>((ref) {
  return ConnectionNotifier(ref.read(wsServiceProvider));
});

class ConnectionState {
  final bool isConnected;
  final bool isConnecting;

  const ConnectionState({this.isConnected = false, this.isConnecting = false});
}

class ConnectionNotifier extends StateNotifier<ConnectionState> {
  final WebSocketService _ws;

  ConnectionNotifier(this._ws) : super(const ConnectionState());

  Future<void> connect() async {
    if (state.isConnecting) return;
    state = const ConnectionState(isConnecting: true);
    await _ws.disconnect(); // Clean up old connection
    final ok = await _ws.connect();
    state = ConnectionState(isConnected: ok);
  }

  Future<void> disconnect() async {
    await _ws.disconnect();
    state = const ConnectionState();
  }
}
