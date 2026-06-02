import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../config/api_config.dart';
import '../config/theme.dart';
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
          backgroundColor: AppColors.danger,
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
          ? const Center(child: CircularProgressIndicator(color: AppColors.accent))
          : _servers.isEmpty
              ? _EmptyServers(onAdd: _addManual, onScan: _scanQr)
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  itemCount: _servers.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final s = _servers[i];
                    final isCurrent = s.id == _currentId;
                    return _ServerCard(
                      server: s,
                      isCurrent: isCurrent,
                      onTap: () => _select(s),
                      onDelete: () => _delete(s),
                    );
                  },
                ),
    );
  }
}

/// A single saved-server row rendered as a surface card with a status dot.
class _ServerCard extends StatelessWidget {
  final ServerProfile server;
  final bool isCurrent;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _ServerCard({
    required this.server,
    required this.isCurrent,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isCurrent ? AppColors.accent : AppColors.border,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isCurrent ? AppColors.success : AppColors.textDim,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      server.name,
                      style: const TextStyle(
                        color: AppColors.text,
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      server.url,
                      style: GoogleFonts.jetBrainsMono(
                        color: AppColors.textMuted,
                        fontSize: 12.5,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                icon: const Icon(Icons.delete_outline, size: 20),
                color: AppColors.textDim,
                tooltip: 'Remove',
                onPressed: onDelete,
              ),
            ],
          ),
        ),
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
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.dns_outlined, size: 56, color: AppColors.textDim),
            const SizedBox(height: 20),
            const Text(
              'No servers yet',
              style: TextStyle(
                color: AppColors.text,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Add your ProjectX server by scanning the QR code from the desktop app, or enter its URL manually.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textMuted, fontSize: 13, height: 1.4),
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
        const SnackBar(content: Text('Enter a valid http(s) URL'), backgroundColor: AppColors.danger),
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
