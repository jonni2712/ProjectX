import 'dart:async';
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
  final ws = WebSocketService(ref.read(authServiceProvider));
  ref.onDispose(ws.dispose);
  return ws;
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
  StreamSubscription<bool>? _statusSub;
  // True only while a user-initiated disconnect() is in effect, so a dropped
  // socket isn't mistaken for "the user logged out".
  bool _manualDisconnect = false;

  ConnectionNotifier(this._ws) : super(const ConnectionState()) {
    // React to EVERY transition, including the auto-reconnects the service does
    // on its own. This is what keeps the UI honest after a flaky network blip.
    _statusSub = _ws.connectionStatus.listen((connected) {
      if (connected) {
        state = const ConnectionState(isConnected: true);
      } else {
        // Lost the socket. Unless the user asked to disconnect, the service is
        // already retrying — surface that as "connecting" rather than a dead end.
        state = ConnectionState(isConnected: false, isConnecting: !_manualDisconnect);
      }
    });
  }

  Future<void> connect() async {
    _manualDisconnect = false;
    state = const ConnectionState(isConnecting: true);
    await _ws.disconnect(); // Clean up old connection
    final ok = await _ws.connect();
    // If connect() failed, the service is already scheduling a retry; keep the
    // spinner up rather than flashing "connected: false".
    if (!ok && !_ws.isConnected) {
      state = const ConnectionState(isConnecting: true);
    }
  }

  Future<void> disconnect() async {
    _manualDisconnect = true;
    await _ws.disconnect();
    state = const ConnectionState();
  }

  @override
  void dispose() {
    _statusSub?.cancel();
    super.dispose();
  }
}
