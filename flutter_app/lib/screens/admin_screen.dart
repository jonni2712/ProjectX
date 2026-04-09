import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
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
                Text(error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
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
                Text(error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
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
              backgroundColor: isActive ? Colors.red : Colors.green,
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
            SnackBar(content: Text(error), backgroundColor: Colors.red),
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
      backgroundColor: const Color(0xFF0F0F1A),
      appBar: AppBar(
        title: const Text('Admin Panel'),
        backgroundColor: const Color(0xFF1A1A2E),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(userListProvider.notifier).loadUsers(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: const Color(0xFF6C9EFF),
        onPressed: _showCreateUserDialog,
        child: const Icon(Icons.person_add, color: Colors.white),
      ),
      body: userListState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : userListState.error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        userListState.error!,
                        style: const TextStyle(color: Colors.red),
                      ),
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: () => ref.read(userListProvider.notifier).loadUsers(),
                        icon: const Icon(Icons.refresh),
                        label: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : userListState.users.isEmpty
                  ? Center(
                      child: Text(
                        'No users found',
                        style: GoogleFonts.jetBrainsMono(color: Colors.grey),
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

                          return Card(
                            color: const Color(0xFF1A1A2E),
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: isActive
                                    ? (role == 'admin' ? const Color(0xFF6C9EFF) : const Color(0xFF4ECDC4))
                                    : Colors.grey,
                                child: Icon(
                                  role == 'admin' ? Icons.admin_panel_settings : Icons.person,
                                  color: Colors.white,
                                  size: 20,
                                ),
                              ),
                              title: Row(
                                children: [
                                  Text(
                                    username,
                                    style: GoogleFonts.jetBrainsMono(
                                      color: isActive ? Colors.white : Colors.grey,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                    decoration: BoxDecoration(
                                      color: role == 'admin'
                                          ? const Color(0xFF6C9EFF).withOpacity(0.2)
                                          : const Color(0xFF4ECDC4).withOpacity(0.2),
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(
                                        color: role == 'admin'
                                            ? const Color(0xFF6C9EFF)
                                            : const Color(0xFF4ECDC4),
                                      ),
                                    ),
                                    child: Text(
                                      role == 'admin' ? 'Admin' : 'User',
                                      style: GoogleFonts.jetBrainsMono(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w600,
                                        color: role == 'admin'
                                            ? const Color(0xFF6C9EFF)
                                            : const Color(0xFF4ECDC4),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              subtitle: Text(
                                isActive ? 'Active' : 'Inactive',
                                style: TextStyle(
                                  color: isActive ? Colors.green : Colors.red,
                                  fontSize: 12,
                                ),
                              ),
                              trailing: const Icon(Icons.chevron_right, color: Colors.grey),
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
