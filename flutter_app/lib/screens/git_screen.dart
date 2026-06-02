import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../config/theme.dart';
import '../providers/git_provider.dart';

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
                style: GoogleFonts.jetBrainsMono(fontSize: 11, color: AppColors.accent),
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
          ? const Center(child: CircularProgressIndicator(color: AppColors.accent))
          : gitState.discoveredRepos.isEmpty && _hasScanned
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.source_outlined, size: 56, color: AppColors.textDim),
                        const SizedBox(height: 16),
                        const Text('No git repositories found',
                            style: TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 8),
                        const Text('Upload or initialize a project first',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                        const SizedBox(height: 24),
                        FilledButton.icon(
                          icon: const Icon(Icons.refresh, size: 18),
                          label: const Text('Scan Again'),
                          onPressed: _scanRepos,
                        ),
                      ],
                    ),
                  ),
                )
              : gitState.repoPath == null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: const [
                            Icon(Icons.account_tree_outlined, size: 56, color: AppColors.textDim),
                            SizedBox(height: 16),
                            Text('Select a repository above',
                                style: TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.w600)),
                            SizedBox(height: 8),
                            Text('Pick a repo from the list to view its changes',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                          ],
                        ),
                      ),
                    )
                  : gitState.error != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(32),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.error_outline, size: 56, color: AppColors.danger),
                                const SizedBox(height: 16),
                                Text(gitState.error!,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                                const SizedBox(height: 24),
                                FilledButton(
                                  onPressed: () {
                                    ref.read(gitProvider.notifier).loadRepo(gitState.repoPath!);
                                  },
                                  child: const Text('Retry'),
                                ),
                              ],
                            ),
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
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                _statusChip('Ahead', gitState.status!.ahead, AppColors.success),
                const SizedBox(width: 8),
                _statusChip('Behind', gitState.status!.behind, AppColors.warning),
                const SizedBox(width: 8),
                _statusChip('Changed', files.length, AppColors.accent),
              ],
            ),
          ),
        // File list
        Expanded(
          child: files.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(Icons.check_circle_outline, size: 56, color: AppColors.textDim),
                        SizedBox(height: 16),
                        Text('No changes',
                            style: TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.w600)),
                        SizedBox(height: 8),
                        Text('Working tree is clean',
                            style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                      ],
                    ),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(vertical: 4),
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
                        style: GoogleFonts.jetBrainsMono(fontSize: 12, color: AppColors.text),
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Text(
                        file.statusLabel,
                        style: TextStyle(fontSize: 11, color: _statusColor(file.statusLabel)),
                      ),
                      trailing: _statusIcon(file),
                    );
                  },
                ),
        ),
        // Commit area
        if (files.isNotEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: AppColors.surface,
              border: Border(top: BorderSide(color: AppColors.border)),
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
                    style: GoogleFonts.jetBrainsMono(fontSize: 13, color: AppColors.text),
                  ),
                  const SizedBox(height: 12),
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
        ? Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: const [
                  Icon(Icons.history, size: 56, color: AppColors.textDim),
                  SizedBox(height: 16),
                  Text('No commits',
                      style: TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.w600)),
                  SizedBox(height: 8),
                  Text('Commit history will appear here',
                      style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                ],
              ),
            ),
          )
        : ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 4),
            itemCount: logs.length,
            itemBuilder: (context, index) {
              final entry = logs[index];
              return ListTile(
                leading: CircleAvatar(
                  radius: 16,
                  backgroundColor: AppColors.accent.withValues(alpha: 0.16),
                  child: Text(
                    entry.authorName.isNotEmpty ? entry.authorName[0].toUpperCase() : '?',
                    style: const TextStyle(color: AppColors.accent, fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                ),
                title: Text(
                  entry.message,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.text),
                ),
                subtitle: Text(
                  '${entry.shortHash} - ${entry.authorName}',
                  style: GoogleFonts.jetBrainsMono(fontSize: 11, color: AppColors.textMuted),
                ),
              );
            },
          );
  }

  Widget _buildBranchesTab(GitState gitState, ThemeData theme) {
    if (gitState.branches.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: const [
              Icon(Icons.account_tree_outlined, size: 56, color: AppColors.textDim),
              SizedBox(height: 16),
              Text('No branches',
                  style: TextStyle(color: AppColors.text, fontSize: 15, fontWeight: FontWeight.w600)),
              SizedBox(height: 8),
              Text('Branches will appear here',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
            ],
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 4),
      itemCount: gitState.branches.length,
      itemBuilder: (context, index) {
        final branch = gitState.branches[index];
        final isCurrent = branch == gitState.currentBranch;
        return ListTile(
          leading: Icon(
            isCurrent ? Icons.check_circle : Icons.circle_outlined,
            color: isCurrent ? AppColors.accent : AppColors.textDim,
          ),
          title: Text(
            branch,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 14,
              color: isCurrent ? AppColors.text : AppColors.textMuted,
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
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        '$label: $count',
        style: GoogleFonts.jetBrainsMono(fontSize: 11, color: color, fontWeight: FontWeight.w600),
      ),
    );
  }

  Color _statusColor(String statusLabel) {
    switch (statusLabel) {
      case 'Modified':
        return AppColors.warning;
      case 'Added':
        return AppColors.success;
      case 'Deleted':
        return AppColors.danger;
      case 'Untracked':
        return AppColors.textDim;
      default:
        return AppColors.textDim;
    }
  }

  Widget _statusIcon(dynamic file) {
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(color: _statusColor(file.statusLabel), shape: BoxShape.circle),
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
        padding: EdgeInsets.symmetric(vertical: 12),
        child: SizedBox(
          height: 20,
          width: 20,
          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent),
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
                    color: isActive ? AppColors.canvas : AppColors.accent,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    repoName,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 12,
                      color: isActive ? AppColors.canvas : AppColors.text,
                    ),
                  ),
                ],
              ),
              selected: isActive,
              selectedColor: AppColors.accent,
              backgroundColor: AppColors.surface,
              side: BorderSide(
                color: isActive ? AppColors.accent : AppColors.border,
              ),
              onSelected: (_) => onSelected(repo),
            ),
          );
        },
      ),
    );
  }
}
