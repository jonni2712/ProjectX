import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/user_service.dart';
import 'auth_provider.dart';

final userServiceProvider = Provider<UserService>((ref) {
  return UserService(ref.read(authServiceProvider));
});

final userListProvider = StateNotifierProvider<UserListNotifier, UserListState>((ref) {
  return UserListNotifier(ref.read(userServiceProvider));
});

class UserListState {
  final List<Map<String, dynamic>> users;
  final bool isLoading;
  final String? error;

  const UserListState({
    this.users = const [],
    this.isLoading = false,
    this.error,
  });

  UserListState copyWith({
    List<Map<String, dynamic>>? users,
    bool? isLoading,
    String? error,
  }) {
    return UserListState(
      users: users ?? this.users,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class UserListNotifier extends StateNotifier<UserListState> {
  final UserService _userService;

  UserListNotifier(this._userService) : super(const UserListState());

  Future<void> loadUsers() async {
    state = state.copyWith(isLoading: true, error: null);
    final users = await _userService.listUsers();
    state = state.copyWith(users: users, isLoading: false);
  }

  Future<String?> createUser(String username, String password, String role) async {
    final error = await _userService.createUser(username, password, role);
    if (error == null) {
      await loadUsers();
    }
    return error;
  }

  Future<String?> updateUser(String id, {String? role, bool? active}) async {
    final error = await _userService.updateUser(id, role: role, active: active);
    if (error == null) {
      await loadUsers();
    }
    return error;
  }

  Future<String?> deleteUser(String id) async {
    final error = await _userService.deleteUser(id);
    if (error == null) {
      await loadUsers();
    }
    return error;
  }
}
