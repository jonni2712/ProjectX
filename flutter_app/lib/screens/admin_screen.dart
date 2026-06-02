import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../config/theme.dart';
import '../providers/user_provider.dart';

class AdminScreen extends ConsumerStatefulWidget {
  const AdminScreen({super.key});

  @override
  ConsumerState<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends ConsumerState<AdminScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(userListProvider.notifier).loadUsers());
  }

  Future<void> _showCreateUserDialog() async {
    final usernameController = TextEditingController();
    final passwordController = TextEditingController();
    String selectedRole = 'user';
    String? error;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Create User'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: usernameController,
                decoration: const InputDecoration(
                  labelText: 'Username',
                  prefixIcon: Icon(Icons.person),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: passwordController,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  prefixIcon: Icon(Icons.lock),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: selectedRole,
                decoration: const InputDecoration(
                  labelText: 'Role',
                  prefixIcon: Icon(Icons.shield),
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'user', child: Text('User')),
                  DropdownMenuItem(value: 'admin', child: Text('Admin')),
                ],
                onChanged: (v) => setDialogState(() => selectedRole = v ?? 'user'),
              ),
              if (error != null) ...[
                const SizedBox(height: 8),
                Text(error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                if (usernameController.text.trim().isEmpty || passwordController.text.trim().isEmpty) {
                  setDialogState(() => error = 'All fields are required');
                  return;
                }
                final result = await ref.read(userListProvider.notifier).createUser(
                  usernameController.text.trim(),
                  passwordController.text.trim(),
                  selectedRole,
                );
                if (result != null) {
                  setDialogState(() => error = result);
                } else {
                  if (ctx.mounted) Navigator.pop(ctx, true);
                }
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );

    usernameController.dispose();
    passwordController.dispose();

    if (result == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('User created successfully')),
      );
    }
  }

  Future<void> _showEditUserDialog(Map<String, dynamic> user) async {
    final userId = user['id']?.toString() ?? user['_id']?.toString() ?? '';
    String selectedRole = user['role'] ?? 'user';
    bool isActive = user['active'] ?? true;
    String? error;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text('Edit ${user['username']}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                value: selectedRole,
                decoration: const InputDecoration(
                  labelText: 'Role',
                  prefixIcon: Icon(Icons.shield),
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'user', child: Text('User')),
                  DropdownMenuItem(value: 'admin', child: Text('Admin')),
                ],
                onChanged: (v) => setDialogState(() => selectedRole = v ?? 'user'),
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                title: const Text('Active'),
                subtitle: Text(isActive ? 'User can log in' : 'User is deactivated'),
                value: isActive,
                onChanged: (v) => setDialogState(() => isActive = v),
              ),
              if (error != null) ...[
                const SizedBox(height: 8),
                Text(error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                final result = await ref.read(userListProvider.notifier).updateUser(
                  userId,
                  role: selectedRole,
                  active: isActive,
                );
                if (result != null) {
                  setDialogState(() => error = result);
                } else {
                  if (ctx.mounted) Navigator.pop(ctx, true);
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );

    if (result == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('User updated successfully')),
      );
    }
  }

  Future<void> _confirmDeactivateUser(Map<String, dynamic> user) async {
    final userId = user['id']?.toString() ?? user['_id']?.toString() ?? '';
    final username = user['username'] ?? 'Unknown';
    final isActive = user['active'] ?? true;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isActive ? 'Deactivate User' : 'Activate User'),
        content: Text(isActive
            ? 'Are you sure you want to deactivate "$username"? They will no longer be able to log in.'
            : 'Are you sure you want to reactivate "$username"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: isActive ? AppColors.danger : AppColors.success,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(isActive ? 'Deactivate' : 'Activate'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      final error = await ref.read(userListProvider.notifier).updateUser(
        userId,
        active: !isActive,
      );
      if (mounted) {
        if (error != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(error), backgroundColor: AppColors.danger),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(isActive ? 'User deactivated' : 'User activated')),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final userListState = ref.watch(userListProvider);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: const Text('Admin Panel'),
        backgroundColor: AppColors.surface,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: () => ref.read(userListProvider.notifier).loadUsers(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: AppColors.accent,
        foregroundColor: Colors.white,
        onPressed: _showCreateUserDialog,
        child: const Icon(Icons.person_add),
      ),
      body: userListState.isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.accent),
            )
          : userListState.error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.error_outline,
                          color: AppColors.danger,
                          size: 56,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          userListState.error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: AppColors.textMuted),
                        ),
                        const SizedBox(height: 20),
                        FilledButton.icon(
                          onPressed: () => ref.read(userListProvider.notifier).loadUsers(),
                          icon: const Icon(Icons.refresh),
                          label: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                )
              : userListState.users.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.group_outlined,
                              color: AppColors.textDim,
                              size: 60,
                            ),
                            const SizedBox(height: 16),
                            const Text(
                              'No users yet',
                              style: TextStyle(
                                color: AppColors.text,
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Create the first account to get started.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                            ),
                            const SizedBox(height: 20),
                            FilledButton.icon(
                              onPressed: _showCreateUserDialog,
                              icon: const Icon(Icons.person_add),
                              label: const Text('Create User'),
                            ),
                          ],
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: () => ref.read(userListProvider.notifier).loadUsers(),
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: userListState.users.length,
                        itemBuilder: (context, index) {
                          final user = userListState.users[index];
                          final username = user['username'] ?? 'Unknown';
                          final role = user['role'] ?? 'user';
                          final isActive = user['active'] ?? true;

                          final isAdmin = role == 'admin';
                          return Card(
                            color: AppColors.surface,
                            margin: const EdgeInsets.only(bottom: 8),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                              side: const BorderSide(color: AppColors.border),
                            ),
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                              leading: CircleAvatar(
                                backgroundColor: isActive
                                    ? (isAdmin ? AppColors.accent : AppColors.surfaceAlt)
                                    : AppColors.surfaceAlt,
                                child: Icon(
                                  isAdmin ? Icons.admin_panel_settings : Icons.person,
                                  color: isActive
                                      ? (isAdmin ? Colors.white : AppColors.textMuted)
                                      : AppColors.textDim,
                                  size: 20,
                                ),
                              ),
                              title: Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                      username,
                                      overflow: TextOverflow.ellipsis,
                                      style: GoogleFonts.jetBrainsMono(
                                        color: isActive ? AppColors.text : AppColors.textDim,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: isAdmin
                                          ? AppColors.accent.withValues(alpha: 0.16)
                                          : AppColors.surfaceAlt,
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(
                                        color: isAdmin ? AppColors.accent : AppColors.border,
                                      ),
                                    ),
                                    child: Text(
                                      isAdmin ? 'Admin' : 'User',
                                      style: GoogleFonts.jetBrainsMono(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w600,
                                        color: isAdmin ? AppColors.accent : AppColors.textMuted,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              subtitle: Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 8,
                                      height: 8,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: isActive ? AppColors.success : AppColors.textDim,
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      isActive ? 'Active' : 'Inactive',
                                      style: TextStyle(
                                        color: isActive ? AppColors.success : AppColors.textMuted,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              trailing: const Icon(Icons.chevron_right, color: AppColors.textDim),
                              onTap: () => _showEditUserDialog(user),
                              onLongPress: () => _confirmDeactivateUser(user),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
