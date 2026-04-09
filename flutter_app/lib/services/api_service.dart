import 'package:dio/dio.dart';
import '../config/api_config.dart';
import '../models/file_node.dart';
import '../models/git_models.dart';
import 'auth_service.dart';

class ApiService {
  final AuthService _auth;
  late final Dio _dio;

  ApiService(this._auth) {
    _dio = _auth.authenticatedDio;
  }

  // === Files ===

  Future<List<FileNode>> listFiles(String path) async {
    final response = await _dio.get(ApiConfig.filesListUrl, queryParameters: {'path': path});
    final data = response.data['data'] as List;
    return data.map((e) => FileNode.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> readFileData(String path) async {
    final response = await _dio.get(ApiConfig.filesReadUrl, queryParameters: {'path': path});
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<void> createFile(String path, {String content = '', bool isDirectory = false}) async {
    await _dio.post(ApiConfig.filesCreateUrl, data: {
      'path': path,
      'content': content,
      'isDirectory': isDirectory,
    });
  }

  Future<void> updateFile(String path, String content) async {
    await _dio.put(ApiConfig.filesUpdateUrl, data: {'path': path, 'content': content});
  }

  Future<void> deleteFile(String path) async {
    await _dio.delete(ApiConfig.filesDeleteUrl, queryParameters: {'path': path});
  }

  Future<void> renameFile(String path, String newName) async {
    await _dio.post(ApiConfig.filesRenameUrl, data: {'path': path, 'newName': newName});
  }

  Future<void> moveFile(String srcPath, String destDir) async {
    await _dio.post(ApiConfig.filesMoveUrl, data: {'srcPath': srcPath, 'destDir': destDir});
  }

  Future<void> copyFile(String srcPath, String destPath) async {
    await _dio.post(ApiConfig.filesCopyUrl, data: {'srcPath': srcPath, 'destPath': destPath});
  }

  Future<List<FileNode>> searchFiles(String path, String query) async {
    final response = await _dio.get(ApiConfig.filesSearchUrl, queryParameters: {
      'path': path,
      'query': query,
    });
    final data = response.data['data'] as List;
    return data.map((e) => FileNode.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> lockFile(String path, {String type = 'file'}) async {
    await _dio.post(ApiConfig.filesLockUrl, data: {'path': path, 'type': type});
  }

  Future<void> unlockFile(String path) async {
    await _dio.delete(ApiConfig.filesLockUrl, queryParameters: {'path': path});
  }

  // === Git ===

  Future<GitStatus> gitStatus(String repo) async {
    final response = await _dio.get(ApiConfig.gitStatusUrl, queryParameters: {'repo': repo});
    return GitStatus.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> gitBranches(String repo) async {
    final response = await _dio.get(ApiConfig.gitBranchesUrl, queryParameters: {'repo': repo});
    return response.data['data'] as Map<String, dynamic>;
  }

  Future<void> gitCheckout(String repo, String branch) async {
    await _dio.post(ApiConfig.gitCheckoutUrl, data: {'repo': repo, 'branch': branch});
  }

  Future<void> gitAdd(String repo, List<String> files) async {
    await _dio.post(ApiConfig.gitAddUrl, data: {'repo': repo, 'files': files});
  }

  Future<String> gitCommit(String repo, String message, {List<String>? files}) async {
    final response = await _dio.post(ApiConfig.gitCommitUrl, data: {
      'repo': repo,
      'message': message,
      if (files != null) 'files': files,
    });
    return response.data['data']['hash'] as String;
  }

  Future<void> gitPush(String repo) async {
    await _dio.post(ApiConfig.gitPushUrl, data: {'repo': repo});
  }

  Future<String> gitPull(String repo) async {
    final response = await _dio.post(ApiConfig.gitPullUrl, data: {'repo': repo});
    return response.data['data']['summary'] as String;
  }

  Future<List<GitLogEntry>> gitLog(String repo, {int max = 20}) async {
    final response = await _dio.get(ApiConfig.gitLogUrl, queryParameters: {'repo': repo, 'max': max.toString()});
    final data = response.data['data'] as List;
    return data.map((e) => GitLogEntry.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<String> gitDiff(String repo, {String? file}) async {
    final params = <String, dynamic>{'repo': repo};
    if (file != null) params['file'] = file;
    final response = await _dio.get(ApiConfig.gitDiffUrl, queryParameters: params);
    return response.data['data']['diff'] as String;
  }

  Future<void> gitDiscard(String repo, List<String> files) async {
    await _dio.post(ApiConfig.gitDiscardUrl, data: {'repo': repo, 'files': files});
  }

  Future<bool> gitIsRepo(String path) async {
    final response = await _dio.get(ApiConfig.gitIsRepoUrl, queryParameters: {'path': path});
    return response.data['data']['isRepo'] as bool;
  }

  Future<List<String>> gitScanRepos({String path = '/', int depth = 3}) async {
    final response = await _dio.get(ApiConfig.gitScanReposUrl, queryParameters: {
      'path': path,
      'depth': depth.toString(),
    });
    return (response.data['data'] as List).cast<String>();
  }

  // === Projects ===

  Future<List<Map<String, dynamic>>> recentProjects() async {
    final response = await _dio.get(ApiConfig.projectsRecentUrl);
    return (response.data['data'] as List).cast<Map<String, dynamic>>();
  }

  Future<void> openProject(String path, String name) async {
    await _dio.post(ApiConfig.projectsOpenUrl, data: {'path': path, 'name': name});
  }

  Future<void> pinProject(String path, bool pinned) async {
    await _dio.post(ApiConfig.projectsPinUrl, data: {'path': path, 'pinned': pinned});
  }
}
