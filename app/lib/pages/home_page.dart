import 'package:flutter/material.dart';

import '../core/format.dart';
import '../models/money_record.dart';
import '../state/app_state.dart';
import '../widgets/app_card.dart';
import '../widgets/app_scope.dart';
import '../widgets/empty_state.dart';
import '../widgets/month_switcher.dart';
import '../widgets/record_tile.dart';
import '../widgets/skeleton.dart';
import '../widgets/status_banner.dart';
import '../widgets/summary_card.dart';
import 'edit_page.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final records = state.visibleRecords;
    final rows = _buildRows(records);

    // 冷启动：正在加载、而且手上**什么数据都没有**（没有缓存，stats 也还没到）。
    // 只有这种情况才铺骨架屏。
    // 已经有缓存时不铺 —— 那会盖住本该立刻显示出来的真实数据，
    // 反而比不铺更慢。缓存优先是这个 App 一贯的顺序。
    final showSkeleton =
        state.loading && state.stats == null && !state.showingCache;

    return Scaffold(
      appBar: AppBar(
        title: const Text('MoneyNote'),
        actions: <Widget>[
          // 骨架屏本身就在表达"正在加载"了，这时再挂一个转圈是重复表达。
          if (state.loading && !showSkeleton)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: state.refresh,
        child: CustomScrollView(
          // 内容不满一屏时也要能下拉，否则刷新手势失效
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: <Widget>[
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: Column(
                  children: <Widget>[
                    MonthSwitcher(
                      month: state.month,
                      onShift: state.shiftMonth,
                      onBackToCurrent: state.goToCurrentMonth,
                    ),
                    const SizedBox(height: 8),
                    if (showSkeleton)
                      const _SummarySkeleton()
                    else
                      // 切月份时让卡片淡入淡出，而不是数字"啪"地跳变。
                      // key 用月份：月份不变时（比如刚加载完数据）
                      // 这孩子不会被当成"另一个孩子"，也就不会触发过渡 ——
                      // 数据到位是直接填进去的，不该有淡入。
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 220),
                        child: SummaryCard(
                          key: ValueKey<String>(state.month),
                          stats: state.stats,
                          month: state.month,
                        ),
                      ),
                    const SizedBox(height: 12),
                    if (!showSkeleton) ...<Widget>[
                      _FilterBar(state: state),
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
                    ],
                  ],
                ),
              ),
            ),
            if (showSkeleton)
              const SliverToBoxAdapter(child: _ListSkeleton())
            else if (rows.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(
                  icon: Icons.receipt_long_outlined,
                  title: '这个月还没有记录',
                  subtitle: '点右下角「记一笔」开始，或下拉刷新试试',
                ),
              )
            else
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (BuildContext context, int index) =>
                      _buildRow(context, state, records, rows[index]),
                  childCount: rows.length,
                ),
              ),
            const SliverToBoxAdapter(child: SizedBox(height: 96)),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push<void>(
          MaterialPageRoute<void>(
            builder: (_) => EditPage(defaultDate: defaultDateInMonth(state.month)),
          ),
        ),
        icon: const Icon(Icons.add),
        label: const Text('记一笔'),
      ),
    );
  }

  /// 把记录列表摊平成「日期标题 + 该日记录」的行序列。
  /// 返回的 List 里混着 String（日期）和 MoneyRecord 两种元素，靠运行时类型区分。
  List<Object> _buildRows(List<MoneyRecord> records) {
    final rows = <Object>[];
    String? lastDate;
    for (final record in records) {
      if (record.date != lastDate) {
        rows.add(record.date);
        lastDate = record.date;
      }
      rows.add(record);
    }
    return rows;
  }

  Widget _buildRow(
    BuildContext context,
    AppState state,
    List<MoneyRecord> records,
    Object row,
  ) {
    if (row is String) {
      var expense = 0.0;
      for (final record in records) {
        if (record.date == row && record.isExpense) expense += record.amount;
      }
      return _DayHeader(date: row, expense: expense);
    }

    final record = row as MoneyRecord;
    return RecordTile(
      record: record,
      onTap: () => Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => EditPage(existing: record, defaultDate: record.date),
        ),
      ),
    );
  }
}

class _DayHeader extends StatelessWidget {
  const _DayHeader({required this.date, required this.expense});

  final String date;
  final double expense;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
      child: Row(
        children: <Widget>[
          Text(
            friendlyDate(date),
            style: theme.textTheme.labelLarge?.copyWith(
              color: scheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          if (expense > 0)
            Text(
              '支出 ${formatYuan(expense)}',
              style: theme.textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
            ),
        ],
      ),
    );
  }
}

class _FilterBar extends StatelessWidget {
  const _FilterBar({required this.state});

  final AppState state;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<RecordFilter>(
      segments: const <ButtonSegment<RecordFilter>>[
        ButtonSegment<RecordFilter>(value: RecordFilter.all, label: Text('全部')),
        ButtonSegment<RecordFilter>(value: RecordFilter.expense, label: Text('支出')),
        ButtonSegment<RecordFilter>(value: RecordFilter.income, label: Text('收入')),
      ],
      selected: <RecordFilter>{state.filter},
      onSelectionChanged: (Set<RecordFilter> selection) =>
          state.setFilter(selection.first),
      showSelectedIcon: false,
    );
  }
}

/// 汇总卡的骨架版。
///
/// 尺寸是照着真的 [SummaryCard] 摆的（标题 12 高、金额 30 高、底部三栏），
/// 这样数据到位、骨架换成真卡片时，**版式不会跳**。
/// 骨架屏最忌"占位块和真内容尺寸对不上"——换的那一下整页抖一下，
/// 比不加骨架屏还难受。
class _SummarySkeleton extends StatelessWidget {
  const _SummarySkeleton();

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: AppCard(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const SkeletonBox(width: 84, height: 12),
            const SizedBox(height: 12),
            const SkeletonBox(width: 176, height: 30),
            const SizedBox(height: 22),
            Row(
              children: const <Widget>[
                Expanded(child: SkeletonBox(height: 14)),
                SizedBox(width: 18),
                Expanded(child: SkeletonBox(height: 14)),
                SizedBox(width: 18),
                Expanded(child: SkeletonBox(height: 14)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// 明细列表的骨架版：几行"头像 + 两行文字 + 金额"的占位。
class _ListSkeleton extends StatelessWidget {
  const _ListSkeleton();

  /// 铺几行。5 行大约占满一屏，再多用户也看不到。
  static const int _rows = 5;

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: Column(
        children: <Widget>[
          for (int i = 0; i < _rows; i++) const _TileSkeleton(),
        ],
      ),
    );
  }
}

class _TileSkeleton extends StatelessWidget {
  const _TileSkeleton();

  @override
  Widget build(BuildContext context) {
    // 内边距和 RecordTile 保持一致（horizontal 16 / vertical 12），
    // 换过去的时候不会错位。
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: <Widget>[
          SkeletonBox(width: 40, height: 40, borderRadius: 20),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                SkeletonBox(width: 72, height: 14),
                SizedBox(height: 8),
                SkeletonBox(width: 128, height: 10),
              ],
            ),
          ),
          SizedBox(width: 8),
          SkeletonBox(width: 64, height: 16),
        ],
      ),
    );
  }
}

