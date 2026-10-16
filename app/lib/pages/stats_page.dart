import 'package:flutter/material.dart';

import '../core/format.dart';
import '../models/month_stats.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/app_card.dart';
import '../widgets/app_scope.dart';
import '../widgets/category_bar.dart';
import '../widgets/month_switcher.dart';
import '../widgets/status_banner.dart';

/// 分类配色。按顺序循环取，保证相邻两个分类颜色不会撞。
const List<Color> _palette = <Color>[
  Color(0xFF12B886),
  Color(0xFF4C6EF5),
  Color(0xFFF59F00),
  Color(0xFFE64980),
  Color(0xFF15AABF),
  Color(0xFF7048E8),
  Color(0xFFFA5252),
  Color(0xFF82C91E),
];

class StatsPage extends StatelessWidget {
  const StatsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    // 这里**不能**用 `state.stats ?? MonthStats.empty` 兜底。
    //
    // MonthStats.empty 的每个字段都是实实在在的 0，画出来就是
    // 「结余 ¥0.00 / 收入 ¥0.00 / 支出 ¥0.00」加一句
    // 「这个月还没有支出记录」—— 和"这个月真的一笔都没记"
    // 在界面上**完全一样**。用户分不出哪个是真相。
    //
    // 而真相是"数据没拿到"。把一个失败伪装成"空"，比直接报错更糟：
    // 报错用户知道要重试，伪装成空用户会以为这就是事实。
    //
    // 所以这里保留 null，往下传，由每个区块自己决定画什么。
    final stats = state.stats;

    return Scaffold(
      appBar: AppBar(title: const Text('统计')),
      body: RefreshIndicator(
        onRefresh: state.refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
          children: <Widget>[
            MonthSwitcher(
              month: state.month,
              onShift: state.shiftMonth,
              onBackToCurrent: state.goToCurrentMonth,
            ),
            // 和明细页保持一致：缓存提示 + 错误横幅。
            // 明细页一直有这两个，统计页之前一个都没有，
            // 所以后端挂掉时只有明细页会告诉用户出事了。
            if (state.showingCache) ...<Widget>[
              const SizedBox(height: 10),
              const HintBanner(
                icon: Icons.cloud_off_outlined,
                text: '正在显示本地缓存，下拉可重试',
                color: Color(0xFF868E96),
              ),
            ],
            if (state.error != null) ...<Widget>[
              const SizedBox(height: 10),
              ErrorBanner(
                message: state.error!,
                onRetry: state.refresh,
                onDismiss: state.clearError,
              ),
            ],
            const SizedBox(height: 8),
            _TotalsCard(stats: stats),
            const SizedBox(height: 20),

            _SectionTitle(
              title: '支出分类占比',
              trailing: stats == null ? null : '共 ${stats.byCategory.length} 类',
            ),
            const SizedBox(height: 8),
            AppCard(
              child: stats == null
                  ? _placeholder(theme, _emptyReason(state))
                  : stats.byCategory.isEmpty
                  ? _placeholder(theme, '这个月还没有支出记录')
                  : Column(
                      children: <Widget>[
                        for (int i = 0; i < stats.byCategory.length; i++)
                          CategoryBar(
                            category: stats.byCategory[i].category,
                            amount: stats.byCategory[i].amount,
                            count: stats.byCategory[i].count,
                            maxAmount: stats.maxCategoryAmount,
                            total: stats.expenseTotal,
                            color: _palette[i % _palette.length],
                          ),
                      ],
                    ),
            ),
            const SizedBox(height: 20),

            _SectionTitle(title: '每日支出趋势', trailing: '单位：元'),
            const SizedBox(height: 8),
            AppCard(
              child: stats == null
                  ? _placeholder(theme, _emptyReason(state))
                  : stats.daily.isEmpty
                  ? _placeholder(theme, '这个月还没有支出记录')
                  : _DailyChart(
                      daily: stats.daily,
                      maxAmount: stats.maxDailyAmount,
                      color: scheme.primary,
                      labelColor: scheme.onSurfaceVariant,
                    ),
            ),
            const SizedBox(height: 20),

            Text(
              '数据来自本地后端 API，支持离线缓存。',
              textAlign: TextAlign.center,
              style: theme.textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }

  /// 没有数据时，说清楚是"还在加载"还是"加载失败了"。
  /// 这两种情况用户该做的事完全不同：一个是什么都不用做，
  /// 一个是下拉重试。给同一句话等于没说。
  String _emptyReason(AppState state) =>
      state.loading ? '正在加载…' : '数据没加载出来，下拉刷新重试';

  Widget _placeholder(ThemeData theme, String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 28),
        child: Center(
          child: Text(
            text,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, this.trailing});

  final String title;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: <Widget>[
        Text(
          title,
          style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
        ),
        const Spacer(),
        if (trailing != null)
          Text(
            trailing!,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
      ],
    );
  }
}

class _TotalsCard extends StatelessWidget {
  const _TotalsCard({required this.stats});

  /// null 表示"这个月的数据还没拿到"。
  /// 这时候三个数字显示成「—」而不是 ¥0.00 ——
  /// 「—」的意思是"我不知道"，¥0.00 的意思是"确实是零"。
  final MonthStats? stats;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final s = stats;

    return AppCard(
      child: Column(
        children: <Widget>[
          _row(
            context,
            '收入合计',
            s == null ? '—' : formatYuan(s.incomeTotal),
            s == null ? scheme.onSurfaceVariant : incomeColorOf(context),
          ),
          const SizedBox(height: 12),
          Divider(height: 1, color: scheme.outlineVariant),
          const SizedBox(height: 12),
          _row(
            context,
            '支出合计',
            s == null ? '—' : formatYuan(s.expenseTotal),
            s == null ? scheme.onSurfaceVariant : expenseColorOf(context),
          ),
          const SizedBox(height: 12),
          Divider(height: 1, color: scheme.outlineVariant),
          const SizedBox(height: 12),
          _row(
            context,
            '本月结余',
            s == null ? '—' : formatYuan(s.balance),
            s == null
                ? scheme.onSurfaceVariant
                : (s.balance < 0 ? expenseColorOf(context) : scheme.onSurface),
            bold: true,
          ),
        ],
      ),
    );
  }

  Widget _row(BuildContext context, String label, String value, Color color,
      {bool bold = false}) {
    final theme = Theme.of(context);
    return Row(
      children: <Widget>[
        Text(
          label,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const Spacer(),
        Text(
          value,
          style: theme.textTheme.titleMedium?.copyWith(
            color: color,
            fontWeight: bold ? FontWeight.w700 : FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _DailyChart extends StatelessWidget {
  const _DailyChart({
    required this.daily,
    required this.maxAmount,
    required this.color,
    required this.labelColor,
  });

  final List<DailyStat> daily;
  final double maxAmount;
  final Color color;
  final Color labelColor;

  static const double _chartHeight = 88;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        SizedBox(
          height: _chartHeight,
          child: Row(
            // 底部对齐，柱子从下往上长
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              for (final item in daily)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1),
                    child: Tooltip(
                      message: '${item.date}  ${formatYuan(item.amount)}',
                      child: Container(
                        height: _heightFor(item.amount),
                        decoration: BoxDecoration(
                          color: color,
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: <Widget>[
            Text(
              daily.first.date.substring(5),
              style: theme.textTheme.labelSmall?.copyWith(color: labelColor),
            ),
            const Spacer(),
            Text(
              '共 ${daily.length} 天有支出',
              style: theme.textTheme.labelSmall?.copyWith(color: labelColor),
            ),
            const Spacer(),
            Text(
              daily.last.date.substring(5),
              style: theme.textTheme.labelSmall?.copyWith(color: labelColor),
            ),
          ],
        ),
      ],
    );
  }

  double _heightFor(double amount) {
    if (maxAmount <= 0) return 3;
    // 最矮留 3 像素，让"有支出但金额很小"的那天也看得见
    return (amount / maxAmount * _chartHeight).clamp(3.0, _chartHeight);
  }
}
