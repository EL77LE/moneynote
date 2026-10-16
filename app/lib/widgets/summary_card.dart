import 'package:flutter/material.dart';

import '../core/format.dart';
import '../models/month_stats.dart';
import '../theme.dart';
import 'app_card.dart';

/// 首页顶部的汇总卡：大字显示结余，底下拆出收入 / 支出。
class SummaryCard extends StatelessWidget {
  const SummaryCard({super.key, required this.stats, required this.month});

  /// null 表示"这个月的数据还没拿到"。
  ///
  /// **不能**用 `stats ?? MonthStats.empty` 兜底 —— 那会把四个数字都变成
  /// 实实在在的 0，画出来就是「结余 ¥0.00 / 收入 ¥0.00 / 支出 ¥0.00 / 0 笔」，
  /// 和"这个月真的一笔都没记"在界面上**一模一样**。
  ///
  /// 用户分不出哪个是真相：一个是"后端没连上，你去重试"，
  /// 另一个是"你确实没花钱"。而这两件事该做的事完全不同。
  ///
  /// 所以这里保留 null 往下传，每个数字自己决定画什么：
  /// 拿不到就画「—」（意思是"我不知道"），拿得到才画金额。
  /// 统计页的 _TotalsCard 早就是这么处理的，这张卡之前漏了。
  final MonthStats? stats;
  final String month;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final data = stats;

    final balanceColor = data == null
        ? scheme.onSurfaceVariant
        : (data.balance < 0 ? expenseColorOf(context) : scheme.onSurface);

    // 主卡在浅色下给一点悬浮感；深色模式下阴影看不出来，加了反而脏。
    final elevation = theme.brightness == Brightness.light ? 2.0 : 0.0;

    return AppCard(
      elevation: elevation,
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            // 这里必须用 ${...} 包起来。
            // 写成 '$monthLabel(month)结余' 的话，Dart 只会把 $monthLabel
            // 当成一个变量替换掉（替换成这个函数本身），
            // 后面的 (month)结余 会原样当文字 —— 界面上就会显示
            // "Closure: (String) => String(month)结余" 这种东西。
            '${monthLabel(month)}结余',
            style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 6),
          Text(
            data == null ? '—' : formatYuan(data.balance),
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: balanceColor,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: <Widget>[
              Expanded(
                child: _MiniStat(
                  label: '收入',
                  value: data?.incomeTotal,
                  color: data == null ? scheme.onSurfaceVariant : incomeColorOf(context),
                  icon: Icons.arrow_downward,
                ),
              ),
              Container(width: 1, height: 32, color: scheme.outlineVariant),
              Expanded(
                child: _MiniStat(
                  label: '支出',
                  value: data?.expenseTotal,
                  color: data == null ? scheme.onSurfaceVariant : expenseColorOf(context),
                  icon: Icons.arrow_upward,
                ),
              ),
              Container(width: 1, height: 32, color: scheme.outlineVariant),
              Expanded(
                child: _MiniStat(
                  label: '笔数',
                  value: null,
                  // data 为 null 时 text 也传 null，交给 _MiniStat 画「—」
                  text: data == null ? null : '${data.count}',
                  color: data == null ? scheme.onSurfaceVariant : scheme.onSurface,
                  icon: Icons.receipt_long_outlined,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
    this.text,
  });

  final String label;

  /// 金额。null 表示"这个数字没拿到"，会画成「—」。
  /// 注意别写成 `value ?? 0` —— 那就把"不知道"渲染成"是零"了。
  final double? value;

  /// 非金额的文本（比如笔数）。给了就优先用它。
  final String? text;

  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            Icon(icon, size: 13, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(width: 4),
            Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            text ?? (value == null ? '—' : formatYuan(value!)),
            style: theme.textTheme.titleSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}
