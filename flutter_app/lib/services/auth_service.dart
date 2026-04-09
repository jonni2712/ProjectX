import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';

class AuthService {
  final Dio _dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
    sendTimeout: const Duration(seconds: 10),
  ));
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  String? _token;
  String? _refreshToken;
  String? _username;
  String? _role;

  String? get token => _token;
  String? get username => _username;
  String? get role => _role;
  bool get isAuthenticated => _token != null;

  Future<void> init() async {
    _token = await _storage.read(key: 'jwt_token');
    _refreshToken = await _storage.read(key: 'refresh_token');
    _username = await _storage.read(key: 'username');
    _role = await _storage.read(key: 'user_role');
  }

  /// Returns null on success, or an error message string on failure.
  Future<String?> login(String username, String password) async {
    try {
      final response = await _dio.post(
        ApiConfig.loginUrl,
        data: {'username': username, 'password': password},
      );

      if (response.data['success'] == true) {
        _token = response.data['data']['token'];
        _refreshToken = response.data['data']['refreshToken'];
        final user = response.data['data']['user'];
        if (user != null) {
          _username = user['username'];
          _role = user['role'];
        }
        await _storage.write(key: 'jwt_token', value: _token);
        await _storage.write(key: 'refresh_token', value: _refreshToken);
        if (_username != null) {
          await _storage.write(key: 'username', value: _username!);
        }
        if (_role != null) {
          await _storage.write(key: 'user_role', value: _role!);
        }
        return null;
      }
      return response.data['error'] ?? 'Invalid credentials';
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        return 'Invalid credentials';
      }
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout) {
        return 'Connection timeout — check server URL';
      }
      if (e.type == DioExceptionType.connectionError) {
        return 'Cannot connect to server: ${ApiConfig.baseUrl}';
      }
      return 'Network error: ${e.message}';
    }
  }

  Future<bool> refreshTokens() async {
    if (_refreshToken == null) return false;
    try {
      final response = await _dio.post(
        ApiConfig.refreshUrl,
        data: {'refreshToken': _refreshToken},
      );

      if (response.data['success'] == true) {
        _token = response.data['data']['token'];
        _refreshToken = response.data['data']['refreshToken'];
        await _storage.write(key: 'jwt_token', value: _token);
        await _storage.write(key: 'refresh_token', value: _refreshToken);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  Future<String?> getWsTicket() async {
    try {
      final response = await _dio.post(
        ApiConfig.wsTicketUrl,
        options: Options(headers: {'Authorization': 'Bearer $_token'}),
      );
      if (response.data['success'] == true) {
        return response.data['data']['ticket'];
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<void> logout() async {
    _token = null;
    _refreshToken = null;
    _username = null;
    _role = null;
    await _storage.delete(key: 'jwt_token');
    await _storage.delete(key: 'refresh_token');
    await _storage.delete(key: 'username');
    await _storage.delete(key: 'user_role');
  }

  /// Returns null on success, or an error message string on failure.
  Future<String?> changePassword(String currentPassword, String newPassword) async {
    try {
      final response = await authenticatedDio.patch(
        ApiConfig.changePasswordUrl,
        data: {'currentPassword': currentPassword, 'newPassword': newPassword},
      );
      if (response.data['success'] == true) {
        return null;
      }
      return response.data['error'] ?? 'Failed to change password';
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        return 'Current password is incorrect';
      }
      if (e.response?.data != null && e.response?.data['error'] != null) {
        return e.response!.data['error'];
      }
      return 'Network error: ${e.message}';
    }
  }

  Dio get authenticatedDio {
    final dio = Dio();
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (_token != null) {
          options.headers['Authorization'] = 'Bearer $_token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          final refreshed = await refreshTokens();
          if (refreshed) {
            error.requestOptions.headers['Authorization'] = 'Bearer $_token';
            final response = await _dio.fetch(error.requestOptions);
            handler.resolve(response);
            return;
          }
        }
        handler.next(error);
      },
    ));
    return dio;
  }
}
