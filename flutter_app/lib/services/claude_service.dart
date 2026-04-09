import 'dart:async';
import '../models/ws_message.dart';
import 'websocket_service.dart';

class ClaudeService {
  final WebSocketService _ws;
  final _responseController = StreamController<ClaudeStreamEvent>.broadcast();

  Stream<ClaudeStreamEvent> get responses => _responseController.stream;

  ClaudeService(this._ws) {
    _ws.channelStream('claude').listen((msg) {
      switch (msg.type) {
        case 'started':
          _responseController.add(ClaudeStreamEvent(
            type: ClaudeEventType.started,
            sessionId: msg.data?['sessionId'] as String?,
            mode: msg.data?['mode'] as String?,
          ));
          break;
        case 'stream':
          _responseController.add(ClaudeStreamEvent(
            type: ClaudeEventType.stream,
            data: msg.data as String?,
            sessionId: msg.meta?['sessionId'] as String?,
          ));
          break;
        case 'done':
          _responseController.add(ClaudeStreamEvent(
            type: ClaudeEventType.done,
            sessionId: msg.meta?['sessionId'] as String?,
          ));
          break;
        case 'error':
          _responseController.add(ClaudeStreamEvent(
            type: ClaudeEventType.error,
            data: msg.data as String?,
            sessionId: msg.meta?['sessionId'] as String?,
          ));
          break;
        case 'stopped':
          _responseController.add(ClaudeStreamEvent(
            type: ClaudeEventType.stopped,
            sessionId: msg.meta?['sessionId'] as String?,
          ));
          break;
      }
    });
  }

  void sendPrompt(String prompt, {String cwd = '/', String? mode}) {
    _ws.send(WsMessage(
      channel: 'claude',
      type: 'prompt',
      data: {'prompt': prompt, 'cwd': cwd, if (mode != null) 'mode': mode},
    ));
  }

  void stopSession(String sessionId) {
    _ws.send(WsMessage(
      channel: 'claude',
      type: 'stop',
      data: {'sessionId': sessionId},
    ));
  }

  void dispose() {
    _responseController.close();
  }
}

enum ClaudeEventType { started, stream, done, error, stopped }

class ClaudeStreamEvent {
  final ClaudeEventType type;
  final String? data;
  final String? sessionId;
  final String? mode;

  ClaudeStreamEvent({required this.type, this.data, this.sessionId, this.mode});
}
