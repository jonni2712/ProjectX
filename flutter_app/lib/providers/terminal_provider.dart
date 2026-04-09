import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/terminal_service.dart';
import '../services/websocket_service.dart';
import '../models/ws_message.dart';
import 'connection_provider.dart';

final terminalProvider = StateNotifierProvider<TerminalNotifier, TerminalState>((ref) {
  return TerminalNotifier(
    ref.read(terminalServiceProvider),
    ref.read(wsServiceProvider),
  );
});

class TerminalSession {
  final String id;
  final String cwd;

  TerminalSession({required this.id, required this.cwd});
}

class TerminalState {
  final List<TerminalSession> sessions;
  final String? activeSessionId;
  final bool isLoading;

  const TerminalState({
    this.sessions = const [],
    this.activeSessionId,
    this.isLoading = false,
  });

  TerminalState copyWith({
    List<TerminalSession>? sessions,
    String? activeSessionId,
    bool? isLoading,
  }) {
    return TerminalState(
      sessions: sessions ?? this.sessions,
      activeSessionId: activeSessionId ?? this.activeSessionId,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class TerminalNotifier extends StateNotifier<TerminalState> {
  final TerminalService _terminal;
  final WebSocketService _ws;
  StreamSubscription? _sub;

  TerminalNotifier(this._terminal, this._ws) : super(const TerminalState()) {
    _sub = _ws.channelStream('terminal').listen(_handleTerminalEvent);
  }

  void _handleTerminalEvent(WsMessage msg) {
    switch (msg.type) {
      case 'created':
        final data = msg.data as Map<String, dynamic>;
        final session = TerminalSession(
          id: data['id'] as String,
          cwd: data['cwd'] as String,
        );
        state = state.copyWith(
          sessions: [...state.sessions, session],
          activeSessionId: session.id,
          isLoading: false,
        );
        break;
      case 'attached':
        final data = msg.data as Map<String, dynamic>;
        final id = data['id'] as String;
        state = state.copyWith(activeSessionId: id);
        break;
      case 'destroyed':
        final id = (msg.data as Map<String, dynamic>)['id'] as String;
        final sessions = state.sessions.where((s) => s.id != id).toList();
        state = state.copyWith(
          sessions: sessions,
          activeSessionId: state.activeSessionId == id
              ? (sessions.isNotEmpty ? sessions.last.id : null)
              : state.activeSessionId,
        );
        break;
      case 'list':
        final list = msg.data as List;
        final sessions = list.map((d) {
          final data = d as Map<String, dynamic>;
          return TerminalSession(id: data['id'] as String, cwd: data['cwd'] as String);
        }).toList();
        state = state.copyWith(sessions: sessions);
        break;
    }
  }

  void createTerminal({String cwd = '/', int cols = 80, int rows = 24}) {
    state = state.copyWith(isLoading: true);
    _terminal.createTerminal(cwd: cwd, cols: cols, rows: rows);
  }

  void attachTerminal(String id) {
    _terminal.attachTerminal(id);
    state = state.copyWith(activeSessionId: id);
  }

  void destroyTerminal(String id) {
    _terminal.destroyTerminal(id);
  }

  void setActive(String id) {
    state = state.copyWith(activeSessionId: id);
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
