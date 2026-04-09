import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/auth_service.dart';

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService();
});

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.read(authServiceProvider));
});

class AuthState {
  final bool isAuthenticated;
  final bool isLoading;
  final String? error;
  final String? username;
  final String? role;

  const AuthState({
    this.isAuthenticated = false,
    this.isLoading = false,
    this.error,
    this.username,
    this.role,
  });

  AuthState copyWith({
    bool? isAuthenticated,
    bool? isLoading,
    String? error,
    String? username,
    String? role,
  }) {
    return AuthState(
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      username: username ?? this.username,
      role: role ?? this.role,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthService _auth;

  AuthNotifier(this._auth) : super(const AuthState());

  Future<void> init() async {
    await _auth.init();
    state = AuthState(
      isAuthenticated: _auth.isAuthenticated,
      username: _auth.username,
      role: _auth.role,
    );
  }

  Future<bool> login(String username, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    final error = await _auth.login(username, password);
    if (error == null) {
      state = state.copyWith(
        isAuthenticated: true,
        isLoading: false,
        username: _auth.username,
        role: _auth.role,
      );
      return true;
    } else {
      state = state.copyWith(isLoading: false, error: error);
      return false;
    }
  }

  Future<void> logout() async {
    await _auth.logout();
    state = const AuthState();
  }
}
