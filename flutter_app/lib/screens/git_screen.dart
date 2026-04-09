import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../providers/git_provider.dart';
import '../providers/file_provider.dart';

class GitScreen extends ConsumerStatefulWidget {
  const GitScreen({super.key});

  @override
  ConsumerState<GitScreen> createState() => _GitScreenState();
}

class _GitScreenState extends ConsumerState<GitScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _commitMessageController = TextEditingController();
  bool _hasScanned = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _commitMessageController.dispose();
    super.dispose();
  }

  void _scanRepos() {
    ref.read(gitProvider.notifier).scanForRepos();
    _hasScanned = true;
  }

  @override
  Widget build(BuildContext context) {
    final gitState = ref.watch(gitProvider);
    final theme = Theme.of(context);

    // Auto-scan on first build
    if (!_hasScanned && !gitState.isScanning && gitState.discoveredRepos.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scanRepos());
    }

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Git'),
            if (gitState.currentBranch != null)
              Text(
                gitState.currentBranch!,
                style: TextStyle(fontSize: 11, color: theme.colorScheme.primary),
              ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              _hasScanned = false;
              ref.read(gitProvider.notifier).scanForRepos();
            },
          ),
          PopupMenuButton<String>(
            itemBuilder: (ctx) => [
              const PopupMenuItem(value: 'pull', child: Text('Pull')),
              const PopupMenuItem(value: 'push', child: Text('Push')),
            ],
            onSelected: (value) {
              switch (value) {
                case 'pull':
                  ref.read(gitProvider.notifier).pull();
                  break;
                case 'push':
                  ref.read(gitProvider.notifier).push();
                  break;
              }
            },
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(96),
          child: Column(
            children: [
              // Repo selector
              _RepoSelector(
                repos: gitState.discoveredRepos,
                selectedRepo: gitState.repoPath,
                isScanning: gitState.isScanning,
                onSelected: (repo) {
                  ref.read(gitProvider.notifier).loadRepo(repo);
                },
              ),
              TabBar(
                controller: _tabController,
                tabs: const [
                  Tab(text: 'Changes'),
                  Tab(text: 'Log'),
                  Tab(text: 'Branches'),
                ],
              ),
            ],
          ),
        ),
      ),
      body: gitState.isLoading || gitState.isScanning
          ? const Center(child: CircularProgressIndicator())
          : gitState.discoveredRepos.isEmpty && _hasScanned
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.source_outlined, size: 48, color: Colors.grey[600]),
                      const SizedBox(height: 12),
                      Text('No git repositories found',
                          style: TextStyle(color: Colors.grey[500], fontSize: 15)),
                      const SizedBox(height: 8),
                      Text('Upload or initialize a project first',
                          style: TextStyle(color: Colors.grey[700], fontSize: 12)),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        icon: const Icon(Icons.refresh, size: 18),
                        label: const Text('Scan Again'),
                        onPressed: _scanRepos,
                      ),
                    ],
                  ),
                )
              : gitState.repoPath == null
                  ? Center(
                      child: Text('Select a repository above',
                          style: TextStyle(color: Colors.grey[600])),
                    )
                  : gitState.error != null
                      ? Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.error_outline, size: 48, color: Colors.grey[600]),
                              const SizedBox(height: 8),
                              Text(gitState.error!,
                                  style: TextStyle(color: Colors.grey[600])),
                              const SizedBox(height: 16),
                              FilledButton(
                                onPressed: () {
                                  ref.read(gitProvider.notifier).loadRepo(gitState.repoPath!);
                                },
                                child: const Text('Retry'),
                              ),
                            ],
                          ),
                        )
                      : TabBarView(
                          controller: _tabController,
                          children: [
                            _buildChangesTab(gitState, theme),
                            _buildLogTab(gitState, theme),
                            _buildBranchesTab(gitState, theme),
                          ],
                        ),
    );
  }

  Widget _buildChangesTab(GitState gitState, ThemeData theme) {
    final files = gitState.status?.files ?? [];

    return Column(
      children: [
        // Status summary
        if (gitState.status != null)
          Container(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                _statusChip('Ahead', gitState.status!.ahead, Colors.green),
                const SizedBox(width: 8),
                _statusChip('Behind', gitState.status!.behind, Colors.orange),
                const SizedBox(width: 8),
                _statusChip('Changed', files.length, theme.colorScheme.primary),
              ],
            ),
          ),
        // File list
        Expanded(
          child: files.isEmpty
              ? Center(
                  child: Text('No changes', style: TextStyle(color: Colors.grey[600])),
                )
              : ListView.builder(
                  itemCount: files.length,
                  itemBuilder: (context, index) {
                    final file = files[index];
                    final isSelected = gitState.selectedFiles.contains(file.path);
                    return ListTile(
                      leading: Checkbox(
                        value: isSelected,
                        onChanged: (_) =>
                            ref.read(gitProvider.notifier).toggleFileSelection(file.path),
                      ),
                      title: Text(
                        file.path,
                        style: GoogleFonts.jetBrainsMono(fontSize: 12),
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Text(file.statusLabel, style: const TextStyle(fontSize: 11)),
                      trailing: _statusIcon(file),
                    );
                  },
                ),
        ),
        // Commit area
        if (files.isNotEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1A2E),
              border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.08))),
            ),
            child: SafeArea(
              top: false,
              child: Column(
                children: [
                  TextField(
                    controller: _commitMessageController,
                    decoration: InputDecoration(
                      hintText: 'Commit message...',
                      isDense: true,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    style: GoogleFonts.jetBrainsMono(fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      icon: const Icon(Icons.check, size: 18),
                      label: const Text('Commit'),
                      onPressed: _commitMessageController.text.isEmpty
                          ? null
                          : () {
                              ref.read(gitProvider.notifier).commit(_commitMessageController.text);
                              _commitMessageController.clear();
                            },
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildLogTab(GitState gitState, ThemeData theme) {
    final logs = gitState.log;
    return logs.isEmpty
        ? Center(child: Text('No commits', style: TextStyle(color: Colors.grey[600])))
        : ListView.builder(
            itemCount: logs.length,
            itemBuilder: (context, index) {
              final entry = logs[index];
              return ListTile(
                leading: CircleAvatar(
                  radius: 16,
                  backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.2),
                  child: Text(
                    entry.authorName.isNotEmpty ? entry.authorName[0].toUpperCase() : '?',
                    style: TextStyle(color: theme.colorScheme.primary, fontSize: 14),
                  ),
                ),
                title: Text(entry.message, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text(
                  '${entry.shortHash} - ${entry.authorName}',
                  style: GoogleFonts.jetBrainsMono(fontSize: 11, color: Colors.grey),
                ),
              );
            },
          );
  }

  Widget _buildBranchesTab(GitState gitState, ThemeData theme) {
    return ListView.builder(
      itemCount: gitState.branches.length,
      itemBuilder: (context, index) {
        final branch = gitState.branches[index];
        final isCurrent = branch == gitState.currentBranch;
        return ListTile(
          leading: Icon(
            isCurrent ? Icons.check_circle : Icons.circle_outlined,
            color: isCurrent ? theme.colorScheme.primary : Colors.grey,
          ),
          title: Text(
            branch,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 14,
              fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
            ),
          ),
          onTap: isCurrent ? null : () => ref.read(gitProvider.notifier).checkout(branch),
        );
      },
    );
  }

  Widget _statusChip(String label, int count, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text('$label: $count', style: TextStyle(fontSize: 11, color: color)),
    );
  }

  Widget _statusIcon(dynamic file) {
    Color color;
    switch (file.statusLabel) {
      case 'Modified':
        color = Colors.orange;
        break;
      case 'Added':
        color = Colors.green;
        break;
      case 'Deleted':
        color = Colors.red;
        break;
      case 'Untracked':
        color = Colors.grey;
        break;
      default:
        color = Colors.grey;
    }
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

/// Repo selector widget shown above tabs
class _RepoSelector extends StatelessWidget {
  final List<String> repos;
  final String? selectedRepo;
  final bool isScanning;
  final ValueChanged<String> onSelected;

  const _RepoSelector({
    required this.repos,
    required this.selectedRepo,
    required this.isScanning,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    if (isScanning) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: SizedBox(
          height: 20,
          width: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    if (repos.isEmpty) {
      return const SizedBox.shrink();
    }

    return SizedBox(
      height: 44,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        itemCount: repos.length,
        itemBuilder: (context, index) {
          final repo = repos[index];
          final repoName = repo == '/' ? 'Root' : repo.split('/').last;
          final isActive = repo == selectedRepo;

          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.account_tree,
                    size: 14,
                    color: isActive ? const Color(0xFF0F0F1A) : const Color(0xFF6C9EFF),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    repoName,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 12,
                      color: isActive ? const Color(0xFF0F0F1A) : const Color(0xFFE0E0F0),
                    ),
                  ),
                ],
              ),
              selected: isActive,
              selectedColor: const Color(0xFF6C9EFF),
              backgroundColor: const Color(0xFF1A1A2E),
              side: BorderSide(
                color: isActive ? const Color(0xFF6C9EFF) : const Color(0xFF2A2A3E),
              ),
              onSelected: (_) => onSelected(repo),
            ),
          );
        },
      ),
    );
  }
}
