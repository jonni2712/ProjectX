import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/claude_service.dart';
import 'connection_provider.dart';

final claudeProvider = StateNotifierProvider<ClaudeNotifier, ClaudeState>((ref) {
  return ClaudeNotifier(ref.read(claudeServiceProvider));
});

class ChatMessage {
  final String role; // 'user' or 'assistant'
  final String content;
  final DateTime timestamp;
  final bool isStreaming;

  ChatMessage({
    required this.role,
    required this.content,
    required this.timestamp,
    this.isStreaming = false,
  });

  ChatMessage copyWith({String? content, bool? isStreaming}) {
    return ChatMessage(
      role: role,
      content: content ?? this.content,
      timestamp: timestamp,
      isStreaming: isStreaming ?? this.isStreaming,
    );
  }
}

class ClaudeState {
  final List<ChatMessage> messages;
  final bool isStreaming;
  final String? activeSessionId;
  final String? error;
  final String currentCwd;

  const ClaudeState({
    this.messages = const [],
    this.isStreaming = false,
    this.activeSessionId,
    this.error,
    this.currentCwd = '/',
  });

  ClaudeState copyWith({
    List<ChatMessage>? messages,
    bool? isStreaming,
    String? activeSessionId,
    String? error,
    String? currentCwd,
  }) {
    return ClaudeState(
      messages: messages ?? this.messages,
      isStreaming: isStreaming ?? this.isStreaming,
      activeSessionId: activeSessionId ?? this.activeSessionId,
      error: error,
      currentCwd: currentCwd ?? this.currentCwd,
    );
  }
}

class ClaudeNotifier extends StateNotifier<ClaudeState> {
  final ClaudeService _claude;
  StreamSubscription? _sub;

  ClaudeNotifier(this._claude) : super(const ClaudeState()) {
    _sub = _claude.responses.listen(_handleEvent);
  }

  void _handleEvent(ClaudeStreamEvent event) {
    switch (event.type) {
      case ClaudeEventType.started:
        state = state.copyWith(
          activeSessionId: event.sessionId,
          isStreaming: true,
        );
        // Add empty assistant message placeholder
        final messages = [...state.messages];
        messages.add(ChatMessage(
          role: 'assistant',
          content: '',
          timestamp: DateTime.now(),
          isStreaming: true,
        ));
        state = state.copyWith(messages: messages);
        break;

      case ClaudeEventType.stream:
        if (state.messages.isNotEmpty) {
          final messages = [...state.messages];
          final last = messages.last;
          if (last.role == 'assistant' && last.isStreaming) {
            messages[messages.length - 1] = last.copyWith(
              content: last.content + (event.data ?? ''),
            );
            state = state.copyWith(messages: messages);
          }
        }
        break;

      case ClaudeEventType.done:
        if (state.messages.isNotEmpty) {
          final messages = [...state.messages];
          final last = messages.last;
          if (last.role == 'assistant') {
            messages[messages.length - 1] = last.copyWith(isStreaming: false);
            state = state.copyWith(messages: messages, isStreaming: false);
          }
        }
        break;

      case ClaudeEventType.error:
        state = state.copyWith(error: event.data, isStreaming: false);
        break;

      case ClaudeEventType.stopped:
        state = state.copyWith(isStreaming: false);
        break;
    }
  }

  void sendPrompt(String prompt, {String? mode}) {
    final messages = [...state.messages];
    messages.add(ChatMessage(
      role: 'user',
      content: prompt,
      timestamp: DateTime.now(),
    ));
    state = state.copyWith(messages: messages);
    _claude.sendPrompt(prompt, cwd: state.currentCwd, mode: mode);
  }

  void stopSession() {
    if (state.activeSessionId != null) {
      _claude.stopSession(state.activeSessionId!);
    }
  }

  void setCwd(String cwd) {
    state = state.copyWith(currentCwd: cwd);
  }

  void clearMessages() {
    state = state.copyWith(messages: []);
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
