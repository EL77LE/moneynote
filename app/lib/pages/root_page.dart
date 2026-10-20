import 'package:flutter/material.dart';

import 'home_page.dart';
import 'stats_page.dart';

/// 底部两个 Tab：明细 / 统计。
/// 用 IndexedStack 而不是三元表达式，这样两个页面的滚动位置都能保住。
class RootPage extends StatefulWidget {
  const RootPage({super.key});

  @override
  RootPageState createState() => RootPageState();
}

class RootPageState extends State<RootPage> {
  int _index = 0;

  /// 给录屏演示用：不经过手指点击，直接切到「统计」Tab。
  /// 正常使用不会调用它。
  void showTab(int index) {
    if (index == _index || index < 0 || index > 1) return;
    setState(() => _index = index);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const <Widget>[HomePage(), StatsPage()],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (int value) => setState(() => _index = value),
        destinations: const <NavigationDestination>[
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: '明细',
          ),
          NavigationDestination(
            icon: Icon(Icons.insights_outlined),
            selectedIcon: Icon(Icons.insights),
            label: '统计',
          ),
        ],
      ),
    );
  }
}
