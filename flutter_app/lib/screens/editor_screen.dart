import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../providers/file_provider.dart';
import '../config/api_config.dart';
import '../services/auth_service.dart';
import '../providers/auth_provider.dart';
import 'package:url_launcher/url_launcher.dart';

class EditorScreen extends ConsumerStatefulWidget {
  const EditorScreen({super.key});

  @override
  ConsumerState<EditorScreen> createState() => _EditorScreenState();
}

class _EditorScreenState extends ConsumerState<EditorScreen> {
  final _controller = TextEditingController();
  final _searchController = TextEditingController();
  final _editorScrollController = ScrollController();
  final _lineNumberScrollController = ScrollController();
  bool _showSearch = false;
  List<int> _searchMatches = [];
  int _currentMatchIndex = -1;

  @override
  void initState() {
    super.initState();
    _editorScrollController.addListener(_syncLineNumbers);
  }

  @override
  void dispose() {
    _editorScrollController.removeListener(_syncLineNumbers);
    _controller.dispose();
    _searchController.dispose();
    _editorScrollController.dispose();
    _lineNumberScrollController.dispose();
    super.dispose();
  }

  void _syncLineNumbers() {
    if (_lineNumberScrollController.hasClients && _editorScrollController.hasClients) {
      _lineNumberScrollController.jumpTo(_editorScrollController.offset);
    }
  }

  void _performSearch(String query) {
    if (query.isEmpty) {
      setState(() { _searchMatches = []; _currentMatchIndex = -1; });
      return;
    }
    final text = _controller.text.toLowerCase();
    final searchLower = query.toLowerCase();
    final matches = <int>[];
    int index = 0;
    while (true) {
      index = text.indexOf(searchLower, index);
      if (index == -1) break;
      matches.add(index);
      index += searchLower.length;
    }
    setState(() {
      _searchMatches = matches;
      _currentMatchIndex = matches.isNotEmpty ? 0 : -1;
    });
    if (matches.isNotEmpty) {
      _controller.selection = TextSelection(
        baseOffset: matches[0],
        extentOffset: matches[0] + query.length,
      );
    }
  }

  void _nextMatch() {
    if (_searchMatches.isEmpty) return;
    setState(() {
      _currentMatchIndex = (_currentMatchIndex + 1) % _searchMatches.length;
    });
    final pos = _searchMatches[_currentMatchIndex];
    _controller.selection = TextSelection(
      baseOffset: pos,
      extentOffset: pos + _searchController.text.length,
    );
  }

  String _getExtension(String? path) {
    if (path == null) return '';
    final dot = path.lastIndexOf('.');
    return dot != -1 ? path.substring(dot + 1).toLowerCase() : '';
  }

  bool _isImageFile(String ext) => {'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'}.contains(ext);
  bool _isPreviewable(String ext) => {'html', 'htm', 'svg', 'pdf'}.contains(ext);

  Future<void> _openPreview(String path) async {
    final url = '${ApiConfig.baseUrl}/files/serve?path=${Uri.encodeComponent(path)}';
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fileState = ref.watch(fileProvider);

    // Sync controller with state
    if (fileState.selectedFileContent != null &&
        _controller.text != fileState.selectedFileContent &&
        !fileState.hasUnsavedChanges) {
      _controller.text = fileState.selectedFileContent!;
    }

    final fileName = fileState.selectedFilePath?.split('/').last ?? 'No file';
    final ext = _getExtension(fileState.selectedFilePath);
    final isImage = _isImageFile(ext);
    final isPreviewable = _isPreviewable(ext);
    final isBinary = fileState.isBinary;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Flexible(
                  child: Text(fileName, style: GoogleFonts.jetBrainsMono(fontSize: 14), overflow: TextOverflow.ellipsis),
                ),
                if (fileState.hasUnsavedChanges)
                  Container(
                    margin: const EdgeInsets.only(left: 8),
                    width: 8, height: 8,
                    decoration: const BoxDecoration(color: Colors.orange, shape: BoxShape.circle),
                  ),
              ],
            ),
            if (fileState.selectedFilePath != null)
              Text(fileState.selectedFilePath!, style: TextStyle(fontSize: 10, color: Colors.grey[600]), overflow: TextOverflow.ellipsis),
          ],
        ),
        actions: [
          if (isPreviewable || isImage)
            IconButton(
              icon: const Icon(Icons.open_in_browser),
              tooltip: 'Preview',
              onPressed: fileState.selectedFilePath != null
                  ? () => _openPreview(fileState.selectedFilePath!)
                  : null,
            ),
          if (!isBinary)
            IconButton(
              icon: Icon(_showSearch ? Icons.close : Icons.search),
              onPressed: () => setState(() => _showSearch = !_showSearch),
            ),
          if (!isBinary)
            IconButton(
              icon: const Icon(Icons.save),
              onPressed: fileState.hasUnsavedChanges
                  ? () async {
                      final saved = await ref.read(fileProvider.notifier).saveFile();
                      if (saved && mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Saved'), duration: Duration(seconds: 1)),
                        );
                      }
                    }
                  : null,
            ),
        ],
      ),
      body: fileState.selectedFilePath == null
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.code_off, size: 64, color: Colors.grey[700]),
                  const SizedBox(height: 16),
                  Text('No file open', style: TextStyle(color: Colors.grey[600])),
                  const SizedBox(height: 8),
                  Text('Tap a file in the Files tab', style: TextStyle(fontSize: 12, color: Colors.grey[700])),
                ],
              ),
            )
          : fileState.isLoading
              ? const Center(child: CircularProgressIndicator())
              : isImage && isBinary
                  ? _ImagePreview(content: fileState.selectedFileContent!, path: fileState.selectedFilePath!)
                  : isBinary
                      ? _BinaryFileView(path: fileState.selectedFilePath!, ext: ext, onPreview: () => _openPreview(fileState.selectedFilePath!))
                      : Column(
                          children: [
                            if (_showSearch)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                                color: const Color(0xFF1A1A2E),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: TextField(
                                        controller: _searchController,
                                        decoration: InputDecoration(
                                          hintText: 'Search...',
                                          isDense: true,
                                          border: InputBorder.none,
                                          suffixText: _searchMatches.isNotEmpty
                                              ? '${_currentMatchIndex + 1}/${_searchMatches.length}'
                                              : null,
                                        ),
                                        style: GoogleFonts.jetBrainsMono(fontSize: 13),
                                        onChanged: _performSearch,
                                      ),
                                    ),
                                    IconButton(icon: const Icon(Icons.arrow_downward, size: 18), onPressed: _nextMatch),
                                  ],
                                ),
                              ),
                            Expanded(
                              child: _CodeEditorBody(
                                controller: _controller,
                                editorScrollController: _editorScrollController,
                                lineNumberScrollController: _lineNumberScrollController,
                                onChanged: (value) => ref.read(fileProvider.notifier).updateContent(value),
                              ),
                            ),
                          ],
                        ),
    );
  }
}

// --- Image preview ---
class _ImagePreview extends StatelessWidget {
  final String content;
  final String path;
  const _ImagePreview({required this.content, required this.path});

  @override
  Widget build(BuildContext context) {
    try {
      final bytes = base64Decode(content);
      return Center(
        child: InteractiveViewer(
          minScale: 0.5,
          maxScale: 4.0,
          child: Image.memory(bytes, fit: BoxFit.contain),
        ),
      );
    } catch (_) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.broken_image, size: 64, color: Colors.grey[700]),
            const SizedBox(height: 8),
            Text('Cannot display image', style: TextStyle(color: Colors.grey[600])),
          ],
        ),
      );
    }
  }
}

// --- Binary file view ---
class _BinaryFileView extends StatelessWidget {
  final String path;
  final String ext;
  final VoidCallback onPreview;
  const _BinaryFileView({required this.path, required this.ext, required this.onPreview});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.insert_drive_file, size: 64, color: Colors.grey[700]),
          const SizedBox(height: 16),
          Text('Binary file (.${ext})', style: const TextStyle(fontSize: 16)),
          const SizedBox(height: 8),
          Text(path, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
          const SizedBox(height: 24),
          FilledButton.icon(
            icon: const Icon(Icons.open_in_browser),
            label: const Text('Open in Browser'),
            onPressed: onPreview,
          ),
        ],
      ),
    );
  }
}

// --- Code editor body ---
class _CodeEditorBody extends StatefulWidget {
  final TextEditingController controller;
  final ScrollController editorScrollController;
  final ScrollController lineNumberScrollController;
  final ValueChanged<String> onChanged;

  const _CodeEditorBody({
    required this.controller,
    required this.editorScrollController,
    required this.lineNumberScrollController,
    required this.onChanged,
  });

  @override
  State<_CodeEditorBody> createState() => _CodeEditorBodyState();
}

class _CodeEditorBodyState extends State<_CodeEditorBody> {
  int _lineCount = 1;

  @override
  void initState() {
    super.initState();
    _lineCount = _countLines();
    widget.controller.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTextChanged);
    super.dispose();
  }

  void _onTextChanged() {
    final newCount = _countLines();
    if (newCount != _lineCount) setState(() => _lineCount = newCount);
  }

  int _countLines() {
    final text = widget.controller.text;
    if (text.isEmpty) return 1;
    return '\n'.allMatches(text).length + 1;
  }

  @override
  Widget build(BuildContext context) {
    final lineNumWidth = _lineCount > 999 ? 56.0 : _lineCount > 99 ? 48.0 : 40.0;

    return Container(
      color: const Color(0xFF0F0F1A),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: lineNumWidth,
            child: ScrollConfiguration(
              behavior: ScrollConfiguration.of(context).copyWith(scrollbars: false),
              child: ListView.builder(
                controller: widget.lineNumberScrollController,
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.only(top: 12),
                itemCount: _lineCount,
                itemExtent: 13 * 1.5,
                itemBuilder: (context, index) {
                  return Container(
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 12),
                    child: Text(
                      '${index + 1}',
                      style: GoogleFonts.jetBrainsMono(fontSize: 12, color: const Color(0xFF444466), height: 1.5),
                    ),
                  );
                },
              ),
            ),
          ),
          Container(width: 1, color: const Color(0xFF1A1A2E)),
          Expanded(
            child: SingleChildScrollView(
              controller: widget.editorScrollController,
              child: TextField(
                controller: widget.controller,
                maxLines: null,
                style: GoogleFonts.jetBrainsMono(fontSize: 13, height: 1.5, color: const Color(0xFFE0E0F0)),
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  contentPadding: EdgeInsets.all(12),
                ),
                cursorColor: const Color(0xFF6C9EFF),
                onChanged: widget.onChanged,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
