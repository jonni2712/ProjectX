class FileNode {
  final String name;
  final String path;
  final String type; // 'file' or 'directory'
  final int? size;
  final String? modified;
  final bool locked;
  final String? lockedBy;

  FileNode({
    required this.name,
    required this.path,
    required this.type,
    this.size,
    this.modified,
    this.locked = false,
    this.lockedBy,
  });

  bool get isDirectory => type == 'directory';
  bool get isFile => type == 'file';

  factory FileNode.fromJson(Map<String, dynamic> json) {
    return FileNode(
      name: json['name'] as String,
      path: json['path'] as String,
      type: json['type'] as String,
      size: json['size'] as int?,
      modified: json['modified'] as String?,
      locked: json['locked'] as bool? ?? false,
      lockedBy: json['lockedBy'] as String?,
    );
  }

  String get extension {
    final dot = name.lastIndexOf('.');
    return dot != -1 ? name.substring(dot + 1).toLowerCase() : '';
  }

  String get sizeFormatted {
    if (size == null) return '';
    if (size! < 1024) return '$size B';
    if (size! < 1024 * 1024) return '${(size! / 1024).toStringAsFixed(1)} KB';
    return '${(size! / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
