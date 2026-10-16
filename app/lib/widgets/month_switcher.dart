import 'package:flutter/material.dart';

import '../core/format.dart';

/// 月份切换条：‹  2026年10月  ›
/// 不在本月时右侧多一个"回到本月"。
class MonthSwitcher extends StatelessWidget {
  const MonthSwitcher({
    super.key,
    required this.month,
    required this.onShift,
    this.onBackToCurrent,
  });

  final String month;
  final ValueChanged<int> onShift;
  final VoidCallback? onBackToCurrent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isCurrent = month == currentMonth();

    return Row(
      children: <Widget>[
        IconButton(
          onPressed: () => onShift(-1),
          icon: const Icon(Icons.chevron_left),
          tooltip: '上个月',
        ),
        Expanded(
          child: Center(
            child: Text(
              monthLabel(month),
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
        ),
        IconButton(
          onPressed: () => onShift(1),
          icon: const Icon(Icons.chevron_right),
          tooltip: '下个月',
        ),
        // "回到本月"是**多一个**，不是**换掉右箭头**。
        // 早先这里写成 if/else 的话，人在 9 月就只能跳回本月、
        // 没法一个月一个月往前翻 —— 而"点右箭头切回来"是演示里的固定动作。
        if (!isCurrent && onBackToCurrent != null)
          TextButton(onPressed: onBackToCurrent, child: const Text('回到本月')),
      ],
    );
  }
}
