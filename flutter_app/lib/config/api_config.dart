import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiConfig {
  static String _baseUrl = 'http://192.168.1.100:3000';
  static const _storage = FlutterSecureStorage();

  static String get baseUrl => _baseUrl;
  static String get wsUrl => _baseUrl.replaceFirst('http', 'ws');

  static Future<void> init() async {
    final saved = await _storage.read(key: 'server_url');
    if (saved != null && saved.isNotEmpty) {
      _baseUrl = saved;
    }
  }

  static void setBaseUrl(String url) {
    _baseUrl = url;
    _storage.write(key: 'server_url', value: url);
  }

  // REST endpoints
  static String get loginUrl => '$_baseUrl/auth/login';
  static String get refreshUrl => '$_baseUrl/auth/refresh';
  static String get wsTicketUrl => '$_baseUrl/auth/ws-ticket';
  static String get healthUrl => '$_baseUrl/health';
  static String get meUrl => '$_baseUrl/auth/me';
  static String get changePasswordUrl => '$_baseUrl/auth/password';
  static String get usersUrl => '$_baseUrl/auth/users';

  // Files
  static String get filesListUrl => '$_baseUrl/files/list';
  static String get filesReadUrl => '$_baseUrl/files/read';
  static String get filesCreateUrl => '$_baseUrl/files/create';
  static String get filesUpdateUrl => '$_baseUrl/files/update';
  static String get filesDeleteUrl => '$_baseUrl/files/delete';
  static String get filesRenameUrl => '$_baseUrl/files/rename';
  static String get filesMoveUrl => '$_baseUrl/files/move';
  static String get filesCopyUrl => '$_baseUrl/files/copy';
  static String get filesUploadUrl => '$_baseUrl/files/upload';
  static String get filesDownloadUrl => '$_baseUrl/files/download';
  static String get filesSearchUrl => '$_baseUrl/files/search';
  static String get filesInfoUrl => '$_baseUrl/files/info';
  static String get filesZipUrl => '$_baseUrl/files/zip';
  static String get filesLockUrl => '$_baseUrl/files/lock';
  static String get filesLockRefreshUrl => '$_baseUrl/files/lock/refresh';
  static String get filesLocksUrl => '$_baseUrl/files/locks';

  // Git
  static String get gitStatusUrl => '$_baseUrl/git/status';
  static String get gitBranchUrl => '$_baseUrl/git/branch';
  static String get gitBranchesUrl => '$_baseUrl/git/branches';
  static String get gitCheckoutUrl => '$_baseUrl/git/checkout';
  static String get gitAddUrl => '$_baseUrl/git/add';
  static String get gitCommitUrl => '$_baseUrl/git/commit';
  static String get gitPushUrl => '$_baseUrl/git/push';
  static String get gitPullUrl => '$_baseUrl/git/pull';
  static String get gitLogUrl => '$_baseUrl/git/log';
  static String get gitDiffUrl => '$_baseUrl/git/diff';
  static String get gitDiscardUrl => '$_baseUrl/git/discard';
  static String get gitIsRepoUrl => '$_baseUrl/git/is-repo';
  static String get gitScanReposUrl => '$_baseUrl/git/scan-repos';

  // Projects
  static String get projectsRecentUrl => '$_baseUrl/projects/recent';
  static String get projectsOpenUrl => '$_baseUrl/projects/open';
  static String get projectsPinUrl => '$_baseUrl/projects/pin';
}
