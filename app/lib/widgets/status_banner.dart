import 'package:flutter/material.dart';

import 'app_card.dart';

/// 顶部那条"提示类"信息（比如正在显示本地缓存）。
///
/// 和 [ErrorBanner] 放一个文件里，因为它们是同一类东西：
/// 都是**加载状态的可视化**。原来这两个类私藏在 pages/home_page.dart 里，
/// 结果统计页想用的时候拿不到，只能什么都不显示 ——
/// 于是后端挂掉时统计页安静地展示一排 ¥0.00（详见 [ErrorBanner] 的注释）。
class HintBanner extends StatelessWidget {
  const HintBanner({
    super.key,
    required this.icon,
    required this.text,
    required this.color,
  });

  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Icon(icon, size: 15, color: color),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: color),
          ),
        ),
      ],
    );
  }
}

/// 加载失败时的红色横幅，带「重试」和关闭。
///
/// **为什么统计页也必须有这个**：
/// 统计页拿不到数据时用的是 `state.stats ?? MonthStats.empty`，
/// 也就是"拿不到就当成空"。可 MonthStats.empty 是一排真实的零 ——
/// 结余 ¥0.00、收入 ¥0.00、支出 ¥0.00、"这个月还没有支出记录"。
/// 用户看到的是"这个月确实没花钱"，而不是"没加载出来"。
/// 这两件事在界面上长得一模一样，是**最坏的一种错**：
/// 用户会拿着一个假结论去做决定，而不知道自己被误导了。
///
/// 明细页早就处理了这件事（列表有旧数据就留着、旁边挂提示），
/// 统计页当时漏了。
class ErrorBanner extends StatelessWidget {
  const ErrorBanner({
    super.key,
    required this.message,
    required this.onRetry,
    required this.onDismiss,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return AppCard(
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
      child: Row(
        children: <Widget>[
          Icon(Icons.error_outline, size: 18, color: scheme.error),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: theme.textTheme.bodySmall?.copyWith(color: scheme.error),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('重试')),
          IconButton(
            onPressed: onDismiss,
            icon: const Icon(Icons.close, size: 18),
            tooltip: '关闭',
          ),
        ],
      ),
    );
  }
}
