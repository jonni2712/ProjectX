import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/git_models.dart';
import '../services/api_service.dart';
import 'connection_provider.dart';

final gitProvider = StateNotifierProvider<GitNotifier, GitState>((ref) {
  return GitNotifier(ref.read(apiServiceProvider));
});

class GitState {
  final String? repoPath;
  final GitStatus? status;
  final List<GitLogEntry> log;
  final String? currentBranch;
  final List<String> branches;
  final bool isLoading;
  final String? error;
  final String? message;
  final Set<String> selectedFiles;
  final List<String> discoveredRepos;
  final bool isScanning;

  const GitState({
    this.repoPath,
    this.status,
    this.log = const [],
    this.currentBranch,
    this.branches = const [],
    this.isLoading = false,
    this.error,
    this.message,
    this.selectedFiles = const {},
    this.discoveredRepos = const [],
    this.isScanning = false,
  });

  GitState copyWith({
    String? repoPath,
    GitStatus? status,
    List<GitLogEntry>? log,
    String? currentBranch,
    List<String>? branches,
    bool? isLoading,
    String? error,
    String? message,
    Set<String>? selectedFiles,
    List<String>? discoveredRepos,
    bool? isScanning,
  }) {
    return GitState(
      repoPath: repoPath ?? this.repoPath,
      status: status ?? this.status,
      log: log ?? this.log,
      currentBranch: currentBranch ?? this.currentBranch,
      branches: branches ?? this.branches,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      message: message,
      selectedFiles: selectedFiles ?? this.selectedFiles,
      discoveredRepos: discoveredRepos ?? this.discoveredRepos,
      isScanning: isScanning ?? this.isScanning,
    );
  }
}

class GitNotifier extends StateNotifier<GitState> {
  final ApiService _api;

  GitNotifier(this._api) : super(const GitState());

  Future<void> scanForRepos() async {
    state = state.copyWith(isScanning: true, error: null);
    try {
      final repos = await _api.gitScanRepos();
      state = state.copyWith(discoveredRepos: repos, isScanning: false);
      if (repos.isNotEmpty && state.repoPath == null) {
        await loadRepo(repos.first);
      }
    } catch (e) {
      state = state.copyWith(isScanning: false, error: e.toString());
    }
  }

  Future<void> loadRepo(String repoPath) async {
    state = state.copyWith(repoPath: repoPath, isLoading: true, error: null);
    try {
      final status = await _api.gitStatus(repoPath);
      final branchData = await _api.gitBranches(repoPath);
      final log = await _api.gitLog(repoPath);
      state = state.copyWith(
        status: status,
        currentBranch: branchData['current'] as String?,
        branches: (branchData['branches'] as List).cast<String>(),
        log: log,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void toggleFileSelection(String path) {
    final selected = Set<String>.from(state.selectedFiles);
    if (selected.contains(path)) {
      selected.remove(path);
    } else {
      selected.add(path);
    }
    state = state.copyWith(selectedFiles: selected);
  }

  Future<void> stageFiles(List<String> files) async {
    if (state.repoPath == null) return;
    try {
      await _api.gitAdd(state.repoPath!, files);
      await refresh();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> commit(String message) async {
    if (state.repoPath == null) return;
    state = state.copyWith(isLoading: true);
    try {
      final files = state.selectedFiles.toList();
      final hash = await _api.gitCommit(state.repoPath!, message, files: files.isNotEmpty ? files : null);
      state = state.copyWith(message: 'Committed: $hash', selectedFiles: {});
      await refresh();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> push() async {
    if (state.repoPath == null) return;
    state = state.copyWith(isLoading: true);
    try {
      await _api.gitPush(state.repoPath!);
      state = state.copyWith(message: 'Pushed successfully');
      await refresh();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> pull() async {
    if (state.repoPath == null) return;
    state = state.copyWith(isLoading: true);
    try {
      final summary = await _api.gitPull(state.repoPath!);
      state = state.copyWith(message: 'Pulled: $summary');
      await refresh();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> checkout(String branch) async {
    if (state.repoPath == null) return;
    state = state.copyWith(isLoading: true);
    try {
      await _api.gitCheckout(state.repoPath!, branch);
      state = state.copyWith(message: 'Switched to $branch');
      await refresh();
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> discardFiles(List<String> files) async {
    if (state.repoPath == null) return;
    try {
      await _api.gitDiscard(state.repoPath!, files);
      await refresh();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> refresh() async {
    if (state.repoPath != null) await loadRepo(state.repoPath!);
  }
}
