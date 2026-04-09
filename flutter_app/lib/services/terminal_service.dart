import 'dart:async';
import '../models/ws_message.dart';
import 'websocket_service.dart';

class TerminalService {
  final WebSocketService _ws;
  final Map<String, StreamController<String>> _outputControllers = {};

  TerminalService(this._ws) {
    // Listen for terminal output from any terminal channel
    _ws.channelPrefixStream('terminal:').listen((msg) {
      if (msg.type == 'output') {
        final termId = msg.channel.split(':')[1];
        _outputControllers[termId]?.add(msg.data as String);
      }
    });

    // Listen for terminal management messages
    _ws.channelStream('terminal').listen((msg) {
      // Handle created/destroyed/list/attached events here if needed
    });
  }

  Stream<String> getOutputStream(String terminalId) {
    _outputControllers[terminalId] ??= StreamController<String>.broadcast();
    return _outputControllers[terminalId]!.stream;
  }

  void createTerminal({String cwd = '/', int cols = 80, int rows = 24}) {
    _ws.send(WsMessage(
      channel: 'terminal',
      type: 'create',
      data: {'cwd': cwd, 'cols': cols, 'rows': rows},
    ));
  }

  void attachTerminal(String id) {
    _ws.send(WsMessage(channel: 'terminal', type: 'attach', data: {'id': id}));
  }

  void writeToTerminal(String id, String data) {
    _ws.send(WsMessage(channel: 'terminal:$id', type: 'input', data: data));
  }

  void resizeTerminal(String id, int cols, int rows) {
    _ws.send(WsMessage(
      channel: 'terminal:$id',
      type: 'resize',
      data: {'cols': cols, 'rows': rows},
    ));
  }

  void destroyTerminal(String id) {
    _ws.send(WsMessage(channel: 'terminal', type: 'destroy', data: {'id': id}));
    _outputControllers[id]?.close();
    _outputControllers.remove(id);
  }

  void listTerminals() {
    _ws.send(WsMessage(channel: 'terminal', type: 'list'));
  }

  void dispose() {
    for (final controller in _outputControllers.values) {
      controller.close();
    }
    _outputControllers.clear();
  }
}
