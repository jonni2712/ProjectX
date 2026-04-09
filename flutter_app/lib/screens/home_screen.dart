import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/connection_provider.dart';
import '../providers/file_provider.dart';
import '../providers/tab_provider.dart';
import 'file_manager_screen.dart';
import 'editor_screen.dart';
import 'terminal_screen.dart';
import 'claude_screen.dart';
import 'git_screen.dart';
import 'profile_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _currentIndex = 0;

  final _screens = const [
    FileManagerScreen(),
    EditorScreen(),
    TerminalScreen(),
    ClaudeScreen(),
    GitScreen(),
    ProfileScreen(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(connectionStateProvider.notifier).connect();
      ref.read(fileProvider.notifier).loadDirectory('/');
    });
  }

  @override
  Widget build(BuildContext context) {
    final connectionState = ref.watch(connectionStateProvider);

    // Watch the tab provider so other screens can request tab switches
    ref.listen<int>(selectedTabProvider, (prev, next) {
      if (next != _currentIndex) {
        setState(() => _currentIndex = next);
      }
    });

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Connection status bar
          if (!connectionState.isConnected)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 2),
              color: connectionState.isConnecting ? Colors.orange : Colors.red,
              child: Text(
                connectionState.isConnecting ? 'Connecting...' : 'Disconnected',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 11, color: Colors.white),
              ),
            ),
          BottomNavigationBar(
            currentIndex: _currentIndex,
            onTap: (i) {
              setState(() => _currentIndex = i);
              ref.read(selectedTabProvider.notifier).state = i;
            },
            items: const [
              BottomNavigationBarItem(icon: Icon(Icons.folder_outlined), activeIcon: Icon(Icons.folder), label: 'Files'),
              BottomNavigationBarItem(icon: Icon(Icons.code_outlined), activeIcon: Icon(Icons.code), label: 'Editor'),
              BottomNavigationBarItem(icon: Icon(Icons.terminal), label: 'Terminal'),
              BottomNavigationBarItem(icon: Icon(Icons.smart_toy_outlined), activeIcon: Icon(Icons.smart_toy), label: 'Claude'),
              BottomNavigationBarItem(icon: Icon(Icons.account_tree_outlined), activeIcon: Icon(Icons.account_tree), label: 'Git'),
              BottomNavigationBarItem(icon: Icon(Icons.person_outline), activeIcon: Icon(Icons.person), label: 'Profile'),
            ],
          ),
        ],
      ),
    );
  }
}
