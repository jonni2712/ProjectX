import 'package:flutter/material.dart';
import '../config/api_config.dart';
import '../models/server_profile.dart';
import '../services/server_store.dart';
import 'qr_scan_screen.dart';

/// Manage saved ProjectX servers: add (manually or by QR), select, delete.
/// Pops with the selected [ServerProfile] when the user picks one, so the
/// caller (login screen) can update its fields.
class ServerListScreen extends StatefulWidget {
  const ServerListScreen({super.key});

  @override
  State<ServerListScreen> createState() => _ServerListScreenState();
}

class _ServerListScreenState extends State<ServerListScreen> {
  List<ServerProfile> _servers = [];
  String? _currentId;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final servers = await ServerStore.loadServers();
    final current = await ServerStore.currentId();
    if (!mounted) return;
    setState(() {
      _servers = servers;
      _currentId = current;
      _loading = false;
    });
  }

  Future<void> _select(ServerProfile s) async {
    await ServerStore.setCurrentId(s.id);
    ApiConfig.setBaseUrl(s.url);
    if (!mounted) return;
    Navigator.of(context).pop(s);
  }

  Future<void> _delete(ServerProfile s) async {
    await ServerStore.removeServer(s.id);
    await _load();
  }

  Future<void> _addManual() async {
    final added = await showDialog<ServerProfile>(
      context: context,
      builder: (_) => const _AddServerDialog(),
    );
    if (added != null) await _load();
  }

  Future<void> _scanQr() async {
    final raw = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const QrScanScreen()),
    );
    if (raw == null || !mounted) return;
    final parsed = ServerStore.parseQr(raw);
    if (parsed == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('That QR code is not a valid ProjectX server'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }
    final added = await ServerStore.addServer(name: parsed.name, url: parsed.url);
    await ServerStore.setCurrentId(added.id);
    ApiConfig.setBaseUrl(added.url);
    if (!mounted) return;
    Navigator.of(context).pop(added);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Servers'),
        actions: [
          IconButton(
            icon: const Icon(Icons.qr_code_scanner),
            tooltip: 'Scan QR',
            onPressed: _scanQr,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addManual,
        icon: const Icon(Icons.add),
        label: const Text('Add server'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _servers.isEmpty
              ? _EmptyServers(onAdd: _addManual, onScan: _scanQr)
              : ListView.separated(
                  itemCount: _servers.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final s = _servers[i];
                    final isCurrent = s.id == _currentId;
                    return ListTile(
                      leading: Icon(
                        isCurrent ? Icons.check_circle : Icons.dns_outlined,
                        color: isCurrent ? Theme.of(context).colorScheme.secondary : null,
                      ),
                      title: Text(s.name),
                      subtitle: Text(s.url),
                      onTap: () => _select(s),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline),
                        tooltip: 'Remove',
                        onPressed: () => _delete(s),
                      ),
                    );
                  },
                ),
    );
  }
}

class _EmptyServers extends StatelessWidget {
  final VoidCallback onAdd;
  final VoidCallback onScan;
  const _EmptyServers({required this.onAdd, required this.onScan});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.dns_outlined, size: 64, color: Colors.grey),
          const SizedBox(height: 16),
          const Text('No servers yet'),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              'Add your ProjectX server by scanning the QR code from the desktop app, or enter its URL manually.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: onScan,
            icon: const Icon(Icons.qr_code_scanner),
            label: const Text('Scan QR code'),
          ),
          const SizedBox(height: 8),
          TextButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add),
            label: const Text('Enter URL manually'),
          ),
        ],
      ),
    );
  }
}

class _AddServerDialog extends StatefulWidget {
  const _AddServerDialog();

  @override
  State<_AddServerDialog> createState() => _AddServerDialogState();
}

class _AddServerDialogState extends State<_AddServerDialog> {
  final _nameCtrl = TextEditingController();
  final _urlCtrl = TextEditingController(text: 'http://');

  @override
  void dispose() {
    _nameCtrl.dispose();
    _urlCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final url = _urlCtrl.text.trim();
    final uri = Uri.tryParse(url);
    if (uri == null || (uri.scheme != 'http' && uri.scheme != 'https') || uri.host.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid http(s) URL'), backgroundColor: Colors.red),
      );
      return;
    }
    final added = await ServerStore.addServer(name: _nameCtrl.text, url: url);
    if (!mounted) return;
    Navigator.of(context).pop(added);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add server'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _nameCtrl,
            decoration: const InputDecoration(labelText: 'Name (optional)'),
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _urlCtrl,
            decoration: const InputDecoration(
              labelText: 'Server URL',
              hintText: 'http://192.168.1.100:3000',
            ),
            keyboardType: TextInputType.url,
            onSubmitted: (_) => _save(),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(onPressed: _save, child: const Text('Save')),
      ],
    );
  }
}
