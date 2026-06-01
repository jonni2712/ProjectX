import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/server_profile.dart';

/// Persists the list of saved servers and which one is currently selected.
/// Backed by [FlutterSecureStorage] so URLs (which may embed a private tunnel
/// hostname) are stored encrypted at rest.
class ServerStore {
  static const _storage = FlutterSecureStorage();
  static const _serversKey = 'servers';
  static const _currentKey = 'current_server_id';
  // Single-URL key written by versions before multi-server support.
  static const _legacyUrlKey = 'server_url';

  /// All saved servers. Migrates a legacy single `server_url` on first read.
  static Future<List<ServerProfile>> loadServers() async {
    final raw = await _storage.read(key: _serversKey);
    if (raw == null || raw.isEmpty) {
      final legacy = await _storage.read(key: _legacyUrlKey);
      if (legacy != null && legacy.isNotEmpty) {
        final migrated = ServerProfile(id: _genId(), name: hostOf(legacy), url: legacy);
        await saveServers([migrated]);
        await setCurrentId(migrated.id);
        return [migrated];
      }
      return [];
    }
    try {
      final decoded = jsonDecode(raw) as List<dynamic>;
      return decoded
          .map((e) => ServerProfile.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> saveServers(List<ServerProfile> servers) async {
    await _storage.write(
      key: _serversKey,
      value: jsonEncode(servers.map((s) => s.toJson()).toList()),
    );
  }

  /// Adds a server, or updates the name if one with the same URL already exists.
  /// Returns the resulting profile.
  static Future<ServerProfile> addServer({required String name, required String url}) async {
    final cleanUrl = url.trim();
    final cleanName = name.trim().isNotEmpty ? name.trim() : hostOf(cleanUrl);
    final servers = await loadServers();
    final index = servers.indexWhere((s) => s.url == cleanUrl);
    late ServerProfile profile;
    if (index >= 0) {
      profile = servers[index].copyWith(name: cleanName);
      servers[index] = profile;
    } else {
      profile = ServerProfile(id: _genId(), name: cleanName, url: cleanUrl);
      servers.add(profile);
    }
    await saveServers(servers);
    return profile;
  }

  static Future<void> removeServer(String id) async {
    final servers = await loadServers();
    servers.removeWhere((s) => s.id == id);
    await saveServers(servers);
    if (await currentId() == id) {
      await setCurrentId(servers.isNotEmpty ? servers.first.id : null);
    }
  }

  static Future<String?> currentId() => _storage.read(key: _currentKey);

  static Future<void> setCurrentId(String? id) async {
    if (id == null) {
      await _storage.delete(key: _currentKey);
    } else {
      await _storage.write(key: _currentKey, value: id);
    }
  }

  /// The currently selected server, or the first saved one, or null if none.
  static Future<ServerProfile?> currentServer() async {
    final servers = await loadServers();
    if (servers.isEmpty) return null;
    final id = await currentId();
    return servers.firstWhere((s) => s.id == id, orElse: () => servers.first);
  }

  /// Parse the contents of a scanned QR code into a (name, url) pair.
  /// Accepts either a JSON payload `{"name": "...", "url": "..."}` or a plain
  /// http(s) URL. Returns null if the content is not a usable server.
  static ({String name, String url})? parseQr(String raw) {
    final text = raw.trim();
    if (text.isEmpty) return null;
    if (text.startsWith('{')) {
      try {
        final map = jsonDecode(text) as Map<String, dynamic>;
        final url = (map['url'] as String?)?.trim();
        if (url != null && url.isNotEmpty && _isHttpUrl(url)) {
          final name = (map['name'] as String?)?.trim();
          return (name: name != null && name.isNotEmpty ? name : hostOf(url), url: url);
        }
      } catch (_) {}
      return null;
    }
    if (_isHttpUrl(text)) {
      return (name: hostOf(text), url: text);
    }
    return null;
  }

  static bool _isHttpUrl(String url) {
    final uri = Uri.tryParse(url.trim());
    return uri != null && (uri.scheme == 'http' || uri.scheme == 'https') && uri.host.isNotEmpty;
  }

  static String _genId() => DateTime.now().microsecondsSinceEpoch.toString();

  /// Best-effort host extraction for display / default naming.
  static String hostOf(String url) {
    try {
      final uri = Uri.parse(url.trim());
      if (uri.host.isNotEmpty) {
        return uri.hasPort ? '${uri.host}:${uri.port}' : uri.host;
      }
    } catch (_) {}
    return url.trim();
  }
}
