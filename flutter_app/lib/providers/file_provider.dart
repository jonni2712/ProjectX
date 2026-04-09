import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/file_node.dart';
import '../services/api_service.dart';
import 'connection_provider.dart';

final fileProvider = StateNotifierProvider<FileNotifier, FileState>((ref) {
  return FileNotifier(ref.read(apiServiceProvider));
});

class FileState {
  final String currentPath;
  final List<String> pathHistory; // breadcrumb
  final List<FileNode> entries;
  final bool isLoading;
  final String? error;
  final String? selectedFilePath;
  final String? selectedFileContent;
  final bool hasUnsavedChanges;
  final bool isBinary;

  const FileState({
    this.currentPath = '/',
    this.pathHistory = const ['/'],
    this.entries = const [],
    this.isLoading = false,
    this.error,
    this.selectedFilePath,
    this.selectedFileContent,
    this.hasUnsavedChanges = false,
    this.isBinary = false,
  });

  FileState copyWith({
    String? currentPath,
    List<String>? pathHistory,
    List<FileNode>? entries,
    bool? isLoading,
    String? error,
    String? selectedFilePath,
    String? selectedFileContent,
    bool? hasUnsavedChanges,
    bool? isBinary,
  }) {
    return FileState(
      currentPath: currentPath ?? this.currentPath,
      pathHistory: pathHistory ?? this.pathHistory,
      entries: entries ?? this.entries,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      selectedFilePath: selectedFilePath ?? this.selectedFilePath,
      selectedFileContent: selectedFileContent ?? this.selectedFileContent,
      hasUnsavedChanges: hasUnsavedChanges ?? this.hasUnsavedChanges,
      isBinary: isBinary ?? this.isBinary,
    );
  }

  List<String> get breadcrumbs {
    if (currentPath == '/') return ['/'];
    final parts = currentPath.split('/').where((p) => p.isNotEmpty).toList();
    final crumbs = <String>['/'];
    for (int i = 0; i < parts.length; i++) {
      crumbs.add(parts.sublist(0, i + 1).join('/'));
    }
    return crumbs;
  }
}

class FileNotifier extends StateNotifier<FileState> {
  final ApiService _api;

  FileNotifier(this._api) : super(const FileState());

  Future<void> loadDirectory(String path) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final entries = await _api.listFiles(path);
      final history = [...state.pathHistory];
      if (!history.contains(path)) history.add(path);
      state = state.copyWith(
        currentPath: path,
        pathHistory: history,
        entries: entries,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> openFile(String path) async {
    state = state.copyWith(isLoading: true);
    try {
      final data = await _api.readFileData(path);
      final content = data['content'] as String;
      final isBinary = data['isBinary'] as bool? ?? false;
      state = state.copyWith(
        selectedFilePath: path,
        selectedFileContent: content,
        hasUnsavedChanges: false,
        isLoading: false,
        isBinary: isBinary,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void updateContent(String content) {
    state = state.copyWith(selectedFileContent: content, hasUnsavedChanges: true);
  }

  Future<bool> saveFile() async {
    if (state.selectedFilePath == null || state.selectedFileContent == null) return false;
    try {
      await _api.updateFile(state.selectedFilePath!, state.selectedFileContent!);
      state = state.copyWith(hasUnsavedChanges: false);
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<void> createFile(String name, {bool isDirectory = false}) async {
    final path = '${state.currentPath}/$name'.replaceAll('//', '/');
    try {
      await _api.createFile(path, isDirectory: isDirectory);
      await loadDirectory(state.currentPath);
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> deleteFile(String path) async {
    try {
      await _api.deleteFile(path);
      await loadDirectory(state.currentPath);
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> renameFile(String path, String newName) async {
    try {
      await _api.renameFile(path, newName);
      await loadDirectory(state.currentPath);
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<List<FileNode>> search(String query) async {
    return _api.searchFiles(state.currentPath, query);
  }

  void goBack() {
    if (state.currentPath == '/') return;
    final parent = state.currentPath.substring(0, state.currentPath.lastIndexOf('/'));
    loadDirectory(parent.isEmpty ? '/' : parent);
  }
}
