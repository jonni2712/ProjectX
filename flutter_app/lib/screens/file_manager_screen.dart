import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../providers/file_provider.dart';
import '../providers/terminal_provider.dart' as tp;
import '../providers/tab_provider.dart';
import '../models/file_node.dart';

class FileManagerScreen extends ConsumerStatefulWidget {
  const FileManagerScreen({super.key});

  @override
  ConsumerState<FileManagerScreen> createState() => _FileManagerScreenState();
}

class _FileManagerScreenState extends ConsumerState<FileManagerScreen> {
  final _searchController = TextEditingController();
  bool _isSearching = false;
  List<FileNode>? _searchResults;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showCreateDialog({bool isDirectory = false}) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isDirectory ? 'New Folder' : 'New File'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(hintText: isDirectory ? 'Folder name' : 'filename.ext'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (controller.text.isNotEmpty) {
                ref.read(fileProvider.notifier).createFile(controller.text, isDirectory: isDirectory);
                Navigator.pop(ctx);
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  void _showFileActions(FileNode node) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit),
              title: const Text('Rename'),
              onTap: () {
                Navigator.pop(ctx);
                _showRenameDialog(node);
              },
            ),
            ListTile(
              leading: const Icon(Icons.content_copy),
              title: const Text('Copy path'),
              onTap: () {
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Copied: ${node.path}')),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: Colors.red),
              title: const Text('Delete', style: TextStyle(color: Colors.red)),
              onTap: () {
                Navigator.pop(ctx);
                _confirmDelete(node);
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showRenameDialog(FileNode node) {
    final controller = TextEditingController(text: node.name);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rename'),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (controller.text.isNotEmpty) {
                ref.read(fileProvider.notifier).renameFile(node.path, controller.text);
                Navigator.pop(ctx);
              }
            },
            child: const Text('Rename'),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(FileNode node) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete'),
        content: Text('Delete "${node.name}"? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () {
              ref.read(fileProvider.notifier).deleteFile(node.path);
              Navigator.pop(ctx);
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  IconData _fileIcon(FileNode node) {
    if (node.isDirectory) return Icons.folder;
    switch (node.extension) {
      case 'dart': return Icons.code;
      case 'ts': case 'tsx': case 'js': case 'jsx': return Icons.javascript;
      case 'json': return Icons.data_object;
      case 'md': return Icons.description;
      case 'yaml': case 'yml': return Icons.settings;
      case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': return Icons.image;
      default: return Icons.insert_drive_file;
    }
  }

  Color _fileIconColor(FileNode node) {
    if (node.isDirectory) return const Color(0xFF6C9EFF);
    switch (node.extension) {
      case 'dart': return const Color(0xFF4ECDC4);
      case 'ts': case 'tsx': return const Color(0xFF3178C6);
      case 'js': case 'jsx': return const Color(0xFFF7DF1E);
      case 'json': return const Color(0xFFFFB347);
      case 'md': return const Color(0xFF999999);
      default: return const Color(0xFF666680);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fileState = ref.watch(fileProvider);

    return Scaffold(
      appBar: AppBar(
        title: _isSearching
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Search files...',
                  border: InputBorder.none,
                ),
                onChanged: (q) async {
                  if (q.length >= 2) {
                    final results = await ref.read(fileProvider.notifier).search(q);
                    setState(() => _searchResults = results);
                  } else {
                    setState(() => _searchResults = null);
                  }
                },
              )
            : const Text('Files'),
        actions: [
          IconButton(
            icon: Icon(_isSearching ? Icons.close : Icons.search),
            onPressed: () {
              setState(() {
                _isSearching = !_isSearching;
                if (!_isSearching) {
                  _searchController.clear();
                  _searchResults = null;
                }
              });
            },
          ),
          PopupMenuButton<String>(
            itemBuilder: (ctx) => [
              const PopupMenuItem(value: 'file', child: Text('New File')),
              const PopupMenuItem(value: 'folder', child: Text('New Folder')),
              const PopupMenuItem(value: 'terminal', child: Text('Open Terminal Here')),
            ],
            onSelected: (value) {
              if (value == 'terminal') {
                final fileState = ref.read(fileProvider);
                ref.read(tp.terminalProvider.notifier).createTerminal(
                  cwd: fileState.currentPath,
                );
                ref.read(selectedTabProvider.notifier).state = 2;
              } else {
                _showCreateDialog(isDirectory: value == 'folder');
              }
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Breadcrumb
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: fileState.breadcrumbs.length,
              separatorBuilder: (_, __) => const Icon(Icons.chevron_right, size: 16, color: Colors.grey),
              itemBuilder: (context, index) {
                final crumb = fileState.breadcrumbs[index];
                final label = crumb == '/' ? 'Root' : crumb.split('/').last;
                return Center(
                  child: InkWell(
                    onTap: () => ref.read(fileProvider.notifier).loadDirectory(crumb),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Text(
                        label,
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 12,
                          color: index == fileState.breadcrumbs.length - 1
                              ? Theme.of(context).colorScheme.primary
                              : Colors.grey,
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          const Divider(height: 1),
          // File list
          Expanded(
            child: fileState.isLoading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: () => ref.read(fileProvider.notifier).loadDirectory(fileState.currentPath),
                    child: ListView.builder(
                      itemCount: (_searchResults ?? fileState.entries).length,
                      itemBuilder: (context, index) {
                        final node = (_searchResults ?? fileState.entries)[index];
                        return ListTile(
                          leading: Icon(_fileIcon(node), color: _fileIconColor(node)),
                          title: Text(node.name, style: GoogleFonts.jetBrainsMono(fontSize: 14)),
                          subtitle: node.isFile
                              ? Text(node.sizeFormatted, style: const TextStyle(fontSize: 11))
                              : null,
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (node.locked)
                                const Icon(Icons.lock, size: 16, color: Colors.orange),
                              if (node.isDirectory)
                                const Icon(Icons.chevron_right, size: 20),
                            ],
                          ),
                          onTap: () {
                            if (node.isDirectory) {
                              ref.read(fileProvider.notifier).loadDirectory(node.path);
                            } else {
                              ref.read(fileProvider.notifier).openFile(node.path);
                              ref.read(selectedTabProvider.notifier).state = 1;
                            }
                          },
                          onLongPress: () => _showFileActions(node),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
