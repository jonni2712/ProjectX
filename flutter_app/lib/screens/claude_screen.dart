import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../providers/claude_provider.dart';
import '../providers/file_provider.dart';
import '../providers/connection_provider.dart';

class ClaudeScreen extends ConsumerStatefulWidget {
  const ClaudeScreen({super.key});

  @override
  ConsumerState<ClaudeScreen> createState() => _ClaudeScreenState();
}

class _ClaudeScreenState extends ConsumerState<ClaudeScreen> {
  final _promptController = TextEditingController();
  final _scrollController = ScrollController();
  final _focusNode = FocusNode();

  @override
  void dispose() {
    _promptController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 50), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _sendPrompt() {
    final text = _promptController.text.trim();
    if (text.isEmpty) return;

    final filePath = ref.read(fileProvider).currentPath;
    ref.read(claudeProvider.notifier).setCwd(filePath);
    ref.read(claudeProvider.notifier).sendPrompt(text);
    _promptController.clear();
    _focusNode.requestFocus();
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    final claudeState = ref.watch(claudeProvider);
    final connectionState = ref.watch(connectionStateProvider);
    final theme = Theme.of(context);

    // Auto-scroll when streaming
    if (claudeState.isStreaming) {
      _scrollToBottom();
    }

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6C9EFF), Color(0xFF4ECDC4)],
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.smart_toy, size: 16, color: Colors.white),
            ),
            const SizedBox(width: 10),
            const Text('Claude'),
            const SizedBox(width: 8),
            if (claudeState.isStreaming)
              _PulsingDot(color: theme.colorScheme.primary),
          ],
        ),
        actions: [
          if (claudeState.isStreaming)
            IconButton(
              icon: const Icon(Icons.stop_circle_outlined),
              tooltip: 'Stop',
              onPressed: () => ref.read(claudeProvider.notifier).stopSession(),
            ),
          IconButton(
            icon: const Icon(Icons.delete_sweep_outlined),
            tooltip: 'Clear chat',
            onPressed: claudeState.messages.isEmpty
                ? null
                : () => ref.read(claudeProvider.notifier).clearMessages(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Connection warning
          if (!connectionState.isConnected)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: Colors.orange.withValues(alpha: 0.15),
              child: Row(
                children: [
                  const Icon(Icons.wifi_off, size: 16, color: Colors.orange),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'WebSocket disconnected — Claude needs an active connection',
                      style: TextStyle(fontSize: 12, color: Colors.orange),
                    ),
                  ),
                  TextButton(
                    onPressed: () => ref.read(connectionStateProvider.notifier).connect(),
                    child: const Text('Retry', style: TextStyle(fontSize: 12)),
                  ),
                ],
              ),
            ),

          // Messages
          Expanded(
            child: claudeState.messages.isEmpty
                ? _EmptyState()
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(0, 8, 0, 8),
                    itemCount: claudeState.messages.length,
                    itemBuilder: (context, index) {
                      final msg = claudeState.messages[index];
                      return _MessageBubble(
                        message: msg,
                        isLast: index == claudeState.messages.length - 1,
                      );
                    },
                  ),
          ),

          // Error display
          if (claudeState.error != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: Colors.red.withValues(alpha: 0.1),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, size: 16, color: Colors.red),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      claudeState.error!,
                      style: const TextStyle(color: Colors.red, fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),

          // Input area
          _InputBar(
            controller: _promptController,
            focusNode: _focusNode,
            isStreaming: claudeState.isStreaming,
            isConnected: connectionState.isConnected,
            onSend: _sendPrompt,
            cwd: claudeState.currentCwd,
          ),
        ],
      ),
    );
  }
}

// --- Empty state ---
class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  const Color(0xFF6C9EFF).withValues(alpha: 0.2),
                  const Color(0xFF4ECDC4).withValues(alpha: 0.2),
                ],
              ),
              borderRadius: BorderRadius.circular(24),
            ),
            child: const Icon(Icons.smart_toy, size: 40, color: Color(0xFF6C9EFF)),
          ),
          const SizedBox(height: 20),
          Text(
            'Ask Claude anything',
            style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600, color: const Color(0xFFE0E0E0)),
          ),
          const SizedBox(height: 8),
          Text(
            'Code questions, debugging, refactoring...',
            style: GoogleFonts.inter(fontSize: 13, color: Colors.grey),
          ),
          const SizedBox(height: 24),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              _SuggestionChip(label: 'Explain this code'),
              _SuggestionChip(label: 'Find bugs'),
              _SuggestionChip(label: 'Refactor'),
              _SuggestionChip(label: 'Write tests'),
            ],
          ),
        ],
      ),
    );
  }
}

class _SuggestionChip extends StatelessWidget {
  final String label;
  const _SuggestionChip({required this.label});

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      label: Text(label, style: const TextStyle(fontSize: 12)),
      backgroundColor: const Color(0xFF1A1A2E),
      side: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
      onPressed: () {},
    );
  }
}

// --- Message bubble ---
class _MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final bool isLast;

  const _MessageBubble({required this.message, required this.isLast});

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == 'user';
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      color: isUser ? Colors.transparent : const Color(0xFF12122A),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Role header
          Row(
            children: [
              if (isUser)
                const CircleAvatar(
                  radius: 12,
                  backgroundColor: Color(0xFF6C9EFF),
                  child: Icon(Icons.person, size: 14, color: Colors.white),
                )
              else
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF6C9EFF), Color(0xFF4ECDC4)],
                    ),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Icon(Icons.smart_toy, size: 14, color: Colors.white),
                ),
              const SizedBox(width: 8),
              Text(
                isUser ? 'You' : 'Claude',
                style: GoogleFonts.inter(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: isUser ? const Color(0xFF6C9EFF) : const Color(0xFF4ECDC4),
                ),
              ),
              const Spacer(),
              if (!isUser && !message.isStreaming)
                _CopyButton(text: message.content),
            ],
          ),
          const SizedBox(height: 8),
          // Content with code blocks
          _RichContent(
            content: message.content,
            isStreaming: message.isStreaming,
          ),
          if (message.isStreaming && isLast)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                children: [
                  SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Thinking...',
                    style: GoogleFonts.inter(fontSize: 12, color: Colors.grey),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// --- Rich content renderer (code blocks + text) ---
class _RichContent extends StatelessWidget {
  final String content;
  final bool isStreaming;

  const _RichContent({required this.content, this.isStreaming = false});

  @override
  Widget build(BuildContext context) {
    if (content.isEmpty) return const SizedBox.shrink();

    final blocks = _parseBlocks(content);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: blocks.map((block) {
        if (block.isCode) {
          return _CodeBlock(code: block.content, language: block.language);
        } else {
          return _TextBlock(text: block.content);
        }
      }).toList(),
    );
  }

  List<_ContentBlock> _parseBlocks(String text) {
    final blocks = <_ContentBlock>[];
    final codeBlockRegex = RegExp(r'```(\w*)\n?([\s\S]*?)```', multiLine: true);
    int lastEnd = 0;

    for (final match in codeBlockRegex.allMatches(text)) {
      // Text before code block
      if (match.start > lastEnd) {
        final textBefore = text.substring(lastEnd, match.start).trim();
        if (textBefore.isNotEmpty) {
          blocks.add(_ContentBlock(content: textBefore, isCode: false));
        }
      }
      // Code block
      blocks.add(_ContentBlock(
        content: match.group(2)?.trim() ?? '',
        isCode: true,
        language: match.group(1) ?? '',
      ));
      lastEnd = match.end;
    }

    // Remaining text after last code block
    if (lastEnd < text.length) {
      final remaining = text.substring(lastEnd).trim();
      if (remaining.isNotEmpty) {
        blocks.add(_ContentBlock(content: remaining, isCode: false));
      }
    }

    if (blocks.isEmpty && text.isNotEmpty) {
      blocks.add(_ContentBlock(content: text, isCode: false));
    }

    return blocks;
  }
}

class _ContentBlock {
  final String content;
  final bool isCode;
  final String language;

  _ContentBlock({required this.content, this.isCode = false, this.language = ''});
}

// --- Code block widget ---
class _CodeBlock extends StatelessWidget {
  final String code;
  final String language;

  const _CodeBlock({required this.code, this.language = ''});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF0A0A18),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with language and copy button
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.04),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(8),
                topRight: Radius.circular(8),
              ),
            ),
            child: Row(
              children: [
                Text(
                  language.isNotEmpty ? language : 'code',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 11,
                    color: Colors.grey,
                  ),
                ),
                const Spacer(),
                _CopyButton(text: code, size: 14),
              ],
            ),
          ),
          // Code content
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(12),
            child: SelectableText(
              code,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 13,
                height: 1.5,
                color: const Color(0xFFE0E0E0),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// --- Text block with basic markdown ---
class _TextBlock extends StatelessWidget {
  final String text;
  const _TextBlock({required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: SelectableText.rich(
        _buildTextSpan(text),
        style: GoogleFonts.inter(
          fontSize: 14,
          height: 1.6,
          color: const Color(0xFFE0E0E0),
        ),
      ),
    );
  }

  TextSpan _buildTextSpan(String text) {
    final spans = <InlineSpan>[];
    final inlineCodeRegex = RegExp(r'`([^`]+)`');
    final boldRegex = RegExp(r'\*\*(.+?)\*\*');

    // Simple approach: process bold and inline code
    String remaining = text;
    while (remaining.isNotEmpty) {
      final codeMatch = inlineCodeRegex.firstMatch(remaining);
      final boldMatch = boldRegex.firstMatch(remaining);

      // Find the earliest match
      Match? earliest;
      if (codeMatch != null && boldMatch != null) {
        earliest = codeMatch.start <= boldMatch.start ? codeMatch : boldMatch;
      } else {
        earliest = codeMatch ?? boldMatch;
      }

      if (earliest == null) {
        spans.add(TextSpan(text: remaining));
        break;
      }

      // Text before the match
      if (earliest.start > 0) {
        spans.add(TextSpan(text: remaining.substring(0, earliest.start)));
      }

      // The match itself
      if (earliest == codeMatch) {
        spans.add(TextSpan(
          text: earliest.group(1),
          style: GoogleFonts.jetBrainsMono(
            fontSize: 13,
            backgroundColor: const Color(0xFF1A1A2E),
            color: const Color(0xFF4ECDC4),
          ),
        ));
      } else {
        spans.add(TextSpan(
          text: earliest.group(1),
          style: const TextStyle(fontWeight: FontWeight.w700),
        ));
      }

      remaining = remaining.substring(earliest.end);
    }

    return TextSpan(children: spans);
  }
}

// --- Copy button ---
class _CopyButton extends StatefulWidget {
  final String text;
  final double size;
  const _CopyButton({required this.text, this.size = 16});

  @override
  State<_CopyButton> createState() => _CopyButtonState();
}

class _CopyButtonState extends State<_CopyButton> {
  bool _copied = false;

  void _copy() {
    Clipboard.setData(ClipboardData(text: widget.text));
    setState(() => _copied = true);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: _copy,
      borderRadius: BorderRadius.circular(4),
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Icon(
          _copied ? Icons.check : Icons.copy,
          size: widget.size,
          color: _copied ? const Color(0xFF4ECDC4) : Colors.grey,
        ),
      ),
    );
  }
}

// --- Pulsing dot indicator ---
class _PulsingDot extends StatefulWidget {
  final Color color;
  const _PulsingDot({required this.color});

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _controller.drive(Tween(begin: 0.3, end: 1.0)),
      child: Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(
          color: widget.color,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

// --- Input bar ---
class _InputBar extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool isStreaming;
  final bool isConnected;
  final VoidCallback onSend;
  final String cwd;

  const _InputBar({
    required this.controller,
    required this.focusNode,
    required this.isStreaming,
    required this.isConnected,
    required this.onSend,
    required this.cwd,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.06))),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // CWD indicator
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 6),
              child: Row(
                children: [
                  const Icon(Icons.folder_outlined, size: 12, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(
                    cwd == '/' ? 'workspace root' : cwd,
                    style: GoogleFonts.jetBrainsMono(fontSize: 10, color: Colors.grey),
                  ),
                ],
              ),
            ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    focusNode: focusNode,
                    minLines: 1,
                    maxLines: 6,
                    enabled: isConnected && !isStreaming,
                    textInputAction: TextInputAction.newline,
                    keyboardType: TextInputType.multiline,
                    style: GoogleFonts.inter(fontSize: 14),
                    decoration: InputDecoration(
                      hintText: isConnected
                          ? (isStreaming ? 'Claude is thinking...' : 'Message Claude...')
                          : 'Connect to server first',
                      hintStyle: GoogleFonts.inter(fontSize: 14, color: const Color(0xFF555570)),
                      filled: true,
                      fillColor: const Color(0xFF0F0F1A),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  decoration: BoxDecoration(
                    gradient: isConnected && !isStreaming
                        ? const LinearGradient(colors: [Color(0xFF6C9EFF), Color(0xFF4ECDC4)])
                        : null,
                    color: isConnected && !isStreaming ? null : Colors.grey.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: IconButton(
                    onPressed: isConnected && !isStreaming ? onSend : null,
                    icon: const Icon(Icons.arrow_upward, size: 20, color: Colors.white),
                    constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                    padding: EdgeInsets.zero,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
