class GitStatus {
  final String? current;
  final String? tracking;
  final int ahead;
  final int behind;
  final List<GitFileStatus> files;

  GitStatus({
    this.current,
    this.tracking,
    this.ahead = 0,
    this.behind = 0,
    this.files = const [],
  });

  factory GitStatus.fromJson(Map<String, dynamic> json) {
    return GitStatus(
      current: json['current'] as String?,
      tracking: json['tracking'] as String?,
      ahead: json['ahead'] as int? ?? 0,
      behind: json['behind'] as int? ?? 0,
      files: (json['files'] as List?)
              ?.map((f) => GitFileStatus.fromJson(f as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}

class GitFileStatus {
  final String path;
  final String index;
  final String workingDir;

  GitFileStatus({required this.path, required this.index, required this.workingDir});

  factory GitFileStatus.fromJson(Map<String, dynamic> json) {
    return GitFileStatus(
      path: json['path'] as String,
      index: json['index'] as String? ?? ' ',
      workingDir: json['working_dir'] as String? ?? ' ',
    );
  }

  String get statusLabel {
    if (index == '?' || workingDir == '?') return 'Untracked';
    if (index == 'M' || workingDir == 'M') return 'Modified';
    if (index == 'A') return 'Added';
    if (index == 'D' || workingDir == 'D') return 'Deleted';
    if (index == 'R') return 'Renamed';
    return 'Unknown';
  }

  bool get isStaged => index != ' ' && index != '?';
}

class GitLogEntry {
  final String hash;
  final String date;
  final String message;
  final String authorName;
  final String authorEmail;

  GitLogEntry({
    required this.hash,
    required this.date,
    required this.message,
    required this.authorName,
    required this.authorEmail,
  });

  factory GitLogEntry.fromJson(Map<String, dynamic> json) {
    return GitLogEntry(
      hash: json['hash'] as String,
      date: json['date'] as String,
      message: json['message'] as String,
      authorName: json['author_name'] as String,
      authorEmail: json['author_email'] as String,
    );
  }

  String get shortHash => hash.length > 7 ? hash.substring(0, 7) : hash;
}
