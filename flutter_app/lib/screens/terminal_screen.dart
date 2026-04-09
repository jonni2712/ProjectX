import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:xterm/xterm.dart';
import '../providers/terminal_provider.dart' as tp;
import '../providers/file_provider.dart';
import '../providers/connection_provider.dart';

const _kTermFontSize = 11.0;
const _kCharWidth = 6.6;
const _kCharHeight = 15.0;

class TerminalScreen extends ConsumerStatefulWidget {
  const TerminalScreen({super.key});

  @override
  ConsumerState<TerminalScreen> createState() => _TerminalScreenState();
}

class _TerminalScreenState extends ConsumerState<TerminalScreen> {
  final Map<String, Terminal> _terminals = {};
  final Map<String, TerminalController> _controllers = {};
  final _inputController = TextEditingController();
  final _inputFocus = FocusNode();
  int _lastCols = 0;
  int _lastRows = 0;
  bool _ctrlPressed = false;

  String _activeFolder(tp.TerminalState termState) {
    final session = termState.sessions.where((s) => s.id == termState.activeSessionId).firstOrNull;
    if (session == null) return 'root';
    final cwd = session.cwd;
    if (cwd == '/') return 'root';
    return cwd.split('/').where((p) => p.isNotEmpty).lastOrNull ?? 'root';
  }

  (int, int) _calcSize(double width, double height) {
    final cols = (width / _kCharWidth).floor().clamp(20, 200);
    final rows = (height / _kCharHeight).floor().clamp(5, 100);
    return (cols, rows);
  }

  void _onResize(String sessionId, int cols, int rows) {
    if (cols == _lastCols && rows == _lastRows) return;
    _lastCols = cols;
    _lastRows = rows;
    final terminalService = ref.read(terminalServiceProvider);
    terminalService.resizeTerminal(sessionId, cols, rows);
    _terminals[sessionId]?.resize(cols, rows);
  }

  Terminal _getOrCreateTerminal(String sessionId) {
    if (!_terminals.containsKey(sessionId)) {
      final terminal = Terminal(maxLines: 5000);
      final controller = TerminalController();
      _terminals[sessionId] = terminal;
      _controllers[sessionId] = controller;

      final terminalService = ref.read(terminalServiceProvider);
      terminalService.getOutputStream(sessionId).listen((data) {
        terminal.write(data);
      });

      terminal.onOutput = (data) {
        terminalService.writeToTerminal(sessionId, data);
      };
    }
    return _terminals[sessionId]!;
  }

  void _createTerminalWithSize(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final availH = size.height - 56 - 80 - 90 - 16; // appbar + bottomnav + input bar
    final availW = size.width - 8;
    final (cols, rows) = _calcSize(availW, availH);

    final fileState = ref.read(fileProvider);
    ref.read(tp.terminalProvider.notifier).createTerminal(
      cwd: fileState.currentPath,
      cols: cols,
      rows: rows,
    );
  }

  void _sendInput(String text) {
    final termState = ref.read(tp.terminalProvider);
    if (termState.activeSessionId == null) return;
    final terminalService = ref.read(terminalServiceProvider);
    terminalService.writeToTerminal(termState.activeSessionId!, text);
  }

  void _sendLine() {
    final text = _inputController.text;
    _sendInput('$text\r');
    _inputController.clear();
  }

  void _sendSpecialKey(String key) {
    if (_ctrlPressed) {
      // Ctrl+key: send as control character
      if (key.length == 1) {
        final code = key.toUpperCase().codeUnitAt(0) - 64;
        if (code > 0 && code < 32) {
          _sendInput(String.fromCharCode(code));
        }
      }
      setState(() => _ctrlPressed = false);
      return;
    }

    switch (key) {
      case 'tab':
        _sendInput('\t');
        break;
      case 'esc':
        _sendInput('\x1B');
        break;
      case 'up':
        _sendInput('\x1B[A');
        break;
      case 'down':
        _sendInput('\x1B[B');
        break;
      case 'left':
        _sendInput('\x1B[D');
        break;
      case 'right':
        _sendInput('\x1B[C');
        break;
      case 'ctrl':
        setState(() => _ctrlPressed = !_ctrlPressed);
        break;
      case 'ctrl+c':
        _sendInput('\x03');
        break;
      case 'ctrl+d':
        _sendInput('\x04');
        break;
      case 'ctrl+z':
        _sendInput('\x1A');
        break;
      case 'ctrl+l':
        _sendInput('\x0C');
        break;
    }
  }

  @override
  void dispose() {
    _inputController.dispose();
    _inputFocus.dispose();
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final termState = ref.watch(tp.terminalProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          termState.activeSessionId != null
              ? 'Terminal — ${_activeFolder(termState)}'
              : 'Terminal',
          style: GoogleFonts.jetBrainsMono(fontSize: 14),
        ),
        actions: [
          if (termState.sessions.length > 1)
            PopupMenuButton<String>(
              icon: const Icon(Icons.tab),
              onSelected: (id) => ref.read(tp.terminalProvider.notifier).setActive(id),
              itemBuilder: (ctx) => termState.sessions
                  .map((s) {
                    final idx = termState.sessions.indexOf(s) + 1;
                    final folderName = s.cwd == '/' ? 'root' : s.cwd.split('/').where((p) => p.isNotEmpty).lastOrNull ?? 'root';
                    return PopupMenuItem(value: s.id, child: Text('$idx: $folderName'));
                  })
                  .toList(),
            ),
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'New terminal',
            onPressed: () => _createTerminalWithSize(context),
          ),
          if (termState.activeSessionId != null)
            IconButton(
              icon: const Icon(Icons.close),
              tooltip: 'Close terminal',
              onPressed: () {
                ref.read(tp.terminalProvider.notifier).destroyTerminal(termState.activeSessionId!);
                _terminals.remove(termState.activeSessionId);
                _controllers.remove(termState.activeSessionId)?.dispose();
              },
            ),
        ],
      ),
      body: termState.sessions.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.terminal, size: 64, color: Colors.grey[700]),
                  const SizedBox(height: 16),
                  const Text('No active terminals'),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    icon: const Icon(Icons.add),
                    label: const Text('New Terminal'),
                    onPressed: () => _createTerminalWithSize(context),
                  ),
                ],
              ),
            )
          : termState.activeSessionId != null
              ? Column(
                  children: [
                    // Terminal view
                    Expanded(
                      child: LayoutBuilder(
                        builder: (context, constraints) {
                          final (cols, rows) = _calcSize(
                            constraints.maxWidth - 8,
                            constraints.maxHeight - 8,
                          );
                          WidgetsBinding.instance.addPostFrameCallback((_) {
                            _onResize(termState.activeSessionId!, cols, rows);
                          });

                          return TerminalView(
                              _getOrCreateTerminal(termState.activeSessionId!),
                              controller: _controllers[termState.activeSessionId!],
                              textStyle: TerminalStyle(
                                fontSize: _kTermFontSize,
                                fontFamily: GoogleFonts.jetBrainsMono().fontFamily!,
                              ),
                              theme: const TerminalTheme(
                                cursor: Color(0xFF6C9EFF),
                                selection: Color(0x406C9EFF),
                                foreground: Color(0xFFE0E0E0),
                                background: Color(0xFF0F0F1A),
                                black: Color(0xFF1A1A2E),
                                red: Color(0xFFFF6B6B),
                                green: Color(0xFF4ECDC4),
                                yellow: Color(0xFFFFE66D),
                                blue: Color(0xFF6C9EFF),
                                magenta: Color(0xFFCB6CE6),
                                cyan: Color(0xFF56CCF2),
                                white: Color(0xFFE0E0E0),
                                brightBlack: Color(0xFF666680),
                                brightRed: Color(0xFFFF8888),
                                brightGreen: Color(0xFF7EEDD8),
                                brightYellow: Color(0xFFFFF3A0),
                                brightBlue: Color(0xFF99BFFF),
                                brightMagenta: Color(0xFFE0A0F0),
                                brightCyan: Color(0xFF88DDF5),
                                brightWhite: Color(0xFFFFFFFF),
                                searchHitBackground: Color(0x80FFE66D),
                                searchHitBackgroundCurrent: Color(0xCCFFE66D),
                                searchHitForeground: Color(0xFF000000),
                              ),
                              padding: const EdgeInsets.all(4),
                            );
                        },
                      ),
                    ),

                    // Special keys toolbar
                    _SpecialKeysBar(
                      ctrlPressed: _ctrlPressed,
                      onKey: _sendSpecialKey,
                    ),

                    // Input bar
                    _TerminalInputBar(
                      controller: _inputController,
                      focusNode: _inputFocus,
                      onSubmit: _sendLine,
                      onChar: (c) => _sendInput(c),
                    ),
                  ],
                )
              : const SizedBox.shrink(),
    );
  }
}

// --- Special keys toolbar ---
class _SpecialKeysBar extends StatelessWidget {
  final bool ctrlPressed;
  final void Function(String key) onKey;

  const _SpecialKeysBar({required this.ctrlPressed, required this.onKey});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 36,
      color: const Color(0xFF16162A),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        children: [
          _KeyButton('Ctrl', onKey: () => onKey('ctrl'), active: ctrlPressed),
          _KeyButton('Tab', onKey: () => onKey('tab')),
          _KeyButton('Esc', onKey: () => onKey('esc')),
          _KeyButton('C-c', onKey: () => onKey('ctrl+c')),
          _KeyButton('C-d', onKey: () => onKey('ctrl+d')),
          _KeyButton('C-z', onKey: () => onKey('ctrl+z')),
          _KeyButton('C-l', onKey: () => onKey('ctrl+l')),
          const VerticalDivider(width: 8, color: Colors.white12),
          _KeyButton('\u2190', onKey: () => onKey('left')),
          _KeyButton('\u2193', onKey: () => onKey('down')),
          _KeyButton('\u2191', onKey: () => onKey('up')),
          _KeyButton('\u2192', onKey: () => onKey('right')),
        ],
      ),
    );
  }
}

class _KeyButton extends StatelessWidget {
  final String label;
  final VoidCallback onKey;
  final bool active;

  const _KeyButton(this.label, {required this.onKey, this.active = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
      child: Material(
        color: active ? const Color(0xFF6C9EFF) : const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(6),
        child: InkWell(
          onTap: onKey,
          borderRadius: BorderRadius.circular(6),
          child: Container(
            constraints: const BoxConstraints(minWidth: 38),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 12,
                color: active ? Colors.white : const Color(0xFFAAAAAA),
                fontWeight: active ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// --- Input bar ---
class _TerminalInputBar extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onSubmit;
  final void Function(String) onChar;

  const _TerminalInputBar({
    required this.controller,
    required this.focusNode,
    required this.onSubmit,
    required this.onChar,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
      decoration: const BoxDecoration(
        color: Color(0xFF1A1A2E),
        border: Border(top: BorderSide(color: Colors.white10)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            const Text(
              '\$',
              style: TextStyle(color: Color(0xFF4ECDC4), fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: controller,
                focusNode: focusNode,
                style: GoogleFonts.jetBrainsMono(fontSize: 14, color: Colors.white),
                decoration: InputDecoration(
                  hintText: 'Type command...',
                  hintStyle: GoogleFonts.jetBrainsMono(fontSize: 14, color: const Color(0xFF555570)),
                  filled: true,
                  fillColor: const Color(0xFF0F0F1A),
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide.none,
                  ),
                ),
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => onSubmit(),
              ),
            ),
            const SizedBox(width: 6),
            IconButton(
              onPressed: onSubmit,
              icon: const Icon(Icons.send, size: 20),
              color: const Color(0xFF6C9EFF),
              constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
              padding: EdgeInsets.zero,
            ),
          ],
        ),
      ),
    );
  }
}
