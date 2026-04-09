import 'package:dio/dio.dart';
import '../config/api_config.dart';
import 'auth_service.dart';

class UserService {
  final AuthService _auth;

  UserService(this._auth);

  Future<List<Map<String, dynamic>>> listUsers() async {
    try {
      final response = await _auth.authenticatedDio.get(ApiConfig.usersUrl);
      if (response.data['success'] == true) {
        return List<Map<String, dynamic>>.from(response.data['data'] ?? []);
      }
      return [];
    } on DioException {
      return [];
    }
  }

  Future<String?> createUser(String username, String password, String role) async {
    try {
      final response = await _auth.authenticatedDio.post(
        ApiConfig.usersUrl,
        data: {'username': username, 'password': password, 'role': role},
      );
      if (response.data['success'] == true) {
        return null;
      }
      return response.data['error'] ?? 'Failed to create user';
    } on DioException catch (e) {
      if (e.response?.data != null && e.response?.data['error'] != null) {
        return e.response!.data['error'];
      }
      return 'Network error: ${e.message}';
    }
  }

  Future<String?> updateUser(String id, {String? role, bool? active}) async {
    try {
      final data = <String, dynamic>{};
      if (role != null) data['role'] = role;
      if (active != null) data['active'] = active;

      final response = await _auth.authenticatedDio.patch(
        '${ApiConfig.usersUrl}/$id',
        data: data,
      );
      if (response.data['success'] == true) {
        return null;
      }
      return response.data['error'] ?? 'Failed to update user';
    } on DioException catch (e) {
      if (e.response?.data != null && e.response?.data['error'] != null) {
        return e.response!.data['error'];
      }
      return 'Network error: ${e.message}';
    }
  }

  Future<String?> deleteUser(String id) async {
    try {
      final response = await _auth.authenticatedDio.delete(
        '${ApiConfig.usersUrl}/$id',
      );
      if (response.data['success'] == true) {
        return null;
      }
      return response.data['error'] ?? 'Failed to delete user';
    } on DioException catch (e) {
      if (e.response?.data != null && e.response?.data['error'] != null) {
        return e.response!.data['error'];
      }
      return 'Network error: ${e.message}';
    }
  }
}
