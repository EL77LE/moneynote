import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:money_note/models/month_stats.dart';
import 'package:money_note/widgets/summary_card.dart';

/// 首页汇总卡的"假零"测试。
///
/// **这张卡曾经有的问题**：拿不到数据时用 `stats ?? MonthStats.empty` 兜底，
/// 于是四个数字全变成实实在在的 0，界面显示
/// 「结余 ¥0.00 / 收入 ¥0.00 / 支出 ¥0.00 / 0 笔」——
/// 和"这个月真的一笔都没记"**长得一模一样**。
///
/// 这是整个项目里最坏的一类 bug：它不崩溃、不报错、不留痕迹，
/// 只是安静地给用户一个假结论。用户看到 ¥0.00 会以为"我这个月没花钱"，
/// 而真相是"后端没连上，你该去重试"。
///
/// 统计页早就改成画「—」了（见 stats_page.dart 的 _TotalsCard），
/// 唯独首页这张卡漏了。这组测试就是把这个漏洞钉死。
void main() {
  Future<void> pumpCard(WidgetTester tester, MonthStats? stats) {
    return tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SummaryCard(stats: stats, month: '2026-10'),
        ),
      ),
    );
  }

  group('拿不到数据时（stats == null）', () {
    testWidgets('四个数字都显示「—」，一个 ¥ 都不出现', (WidgetTester tester) async {
      await pumpCard(tester, null);

      // 结余 + 收入 + 支出 + 笔数
      expect(find.text('—'), findsNWidgets(4));
      expect(
        find.textContaining('¥'),
        findsNothing,
        reason: '拿不到数据时不该出现任何金额——出现 ¥0.00 就是把人往"这月没花钱"上骗',
      );
    });

    testWidgets('不会显示 ¥0.00', (WidgetTester tester) async {
      await pumpCard(tester, null);
      expect(find.text('¥0.00'), findsNothing);
    });

    testWidgets('不会显示 0 笔', (WidgetTester tester) async {
      await pumpCard(tester, null);
      expect(find.text('0'), findsNothing);
    });
  });

  group('真的没有记录时（MonthStats.empty）', () {
    // 这一组是关键：MonthStats.empty 是"确实是零"，不是"不知道"。
    // 它必须显示 ¥0.00 和 0 笔 —— 如果哪天有人图省事，
    // 在 SummaryCard 里用 `stats == null || stats.count == 0` 来判空，
    // 这个测试会红：那样就再也分不出"没数据"和"真的没花钱"了。
    testWidgets('显示真实金额和 0 笔，不是「—」', (WidgetTester tester) async {
      await pumpCard(tester, MonthStats.empty);

      expect(find.text('—'), findsNothing);
      expect(find.text('¥0.00'), findsNWidgets(3)); // 结余 + 收入 + 支出
      expect(find.text('0'), findsOneWidget); // 笔数
    });
  });

  group('拿到数据时', () {
    const stats = MonthStats(
      expenseTotal: 8673.27,
      incomeTotal: 13241.59,
      balance: 4568.32,
      count: 27,
      byCategory: <CategoryStat>[],
      daily: <DailyStat>[],
    );

    testWidgets('显示真实数字，不出现「—」', (WidgetTester tester) async {
      await pumpCard(tester, stats);

      expect(find.text('—'), findsNothing);
      expect(find.text('¥4,568.32'), findsOneWidget); // 结余
      expect(find.text('¥13,241.59'), findsOneWidget); // 收入
      expect(find.text('¥8,673.27'), findsOneWidget); // 支出
      expect(find.text('27'), findsOneWidget); // 笔数
    });

    testWidgets('月份标题跟着传进来的 month 走', (WidgetTester tester) async {
      await pumpCard(tester, stats);
      expect(find.text('2026年10月结余'), findsOneWidget);
    });
  });
}
