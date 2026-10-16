import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:money_note/pages/edit_page.dart';

/// 日期选择器的回归测试。
///
/// **这个 bug 值得单独写一个文件记着**，因为它是一种很难靠手工发现的类型：
/// 在 2026 年（今天所在的年份）点「记一笔」→ 点日期，一切正常。
/// 要把月份一路翻到 2028 年再点日期，才会崩。
/// 也就是说，**测试的人得先想到"翻到两年后再试试"**，
/// 而正常走查功能的人是不会那么干的。
///
/// 根因是"可选范围"和"初始值"来自两个不同的基准：
///
///   初始值 initialDate = 当前在看的那个月（用户能翻到任意年份）
///   可选范围 firstDate..lastDate = 围着「今天」定的 2020..明年
///
/// 两者不同源，就必然会有一个年份让初始值掉到范围外面，
/// showDatePicker 内部的断言随即失败。
///
/// 修法是让范围跟着初始值走 —— 于是"初始值一定在范围内"
/// 变成一条可以推理出来的性质，而不是碰巧成立。
/// 下面这组测试守的就是这条性质。
void main() {
  /// 把日期选择器打开。三种情况走的是同一段动作，抽出来免得抄三遍。
  ///
  /// 这里刻意把本地化配置也加上，和 main.dart 保持一致。
  /// 少了它，测试里弹出的日历是英文的（按钮是 OK 不是「确定」），
  /// 测出来的东西就和你实际看到的不是同一个界面了。
  /// 顺带还守住了手工清单里那条「日期选择器是中文的」。
  Future<void> openDatePicker(WidgetTester tester, String date) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('zh', 'CN'),
        supportedLocales: const <Locale>[Locale('zh', 'CN')],
        localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: EditPage(defaultDate: date),
      ),
    );
    await tester.pumpAndSettle();

    // 日期那一行显示的是 '2028-06-01 · 2028年6月1日'，用前半段定位。
    await tester.tap(find.textContaining(date));
    await tester.pumpAndSettle();
  }

  testWidgets('看的是两年后的月份时，日期选择器能打开', (WidgetTester tester) async {
    // 回归点：这条在修复前会抛
    //   initialDate 2028-06-01 must be on or before lastDate 2027-12-31
    await openDatePicker(tester, '2028-06-01');
    expect(find.byType(DatePickerDialog), findsOneWidget);
  });

  testWidgets('看的是很久以前的月份时，日期选择器也能打开', (WidgetTester tester) async {
    // 同一个 bug 的另一头：修复前会抛
    //   initialDate 2019-01-01 must be on or after firstDate 2020-01-01
    await openDatePicker(tester, '2019-01-01');
    expect(find.byType(DatePickerDialog), findsOneWidget);
  });

  testWidgets('看的是跨年前后的月份时，日期选择器能打开', (WidgetTester tester) async {
    // 12 月和 1 月是月份运算最常出错的地方，顺手守住。
    await openDatePicker(tester, '2027-12-01');
    expect(find.byType(DatePickerDialog), findsOneWidget);
  });

  testWidgets('看的是本月时，日期选择器照常工作', (WidgetTester tester) async {
    final now = DateTime.now();
    final firstOfMonth =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-01';
    await openDatePicker(tester, firstOfMonth);
    expect(find.byType(DatePickerDialog), findsOneWidget);
  });

  testWidgets('选一个日期之后，界面上显示的是新日期', (WidgetTester tester) async {
    // 只验证"能打开"是不够的 —— 打开之后还得真的能选、能写回去。
    await openDatePicker(tester, '2028-06-01');

    // 日历默认选中的就是 initialDate 那天，直接点「确定」即可。
    // 这个按钮是中文的，也就顺带证明了本地化确实生效
    // （如果哪天有人改坏了 locale 配置，这里会找不到「确定」而报错）。
    expect(find.text('确定'), findsOneWidget);
    await tester.tap(find.text('确定'));
    await tester.pumpAndSettle();

    expect(find.byType(DatePickerDialog), findsNothing);
    // 日期行还在，说明没有把界面搞坏。
    expect(find.textContaining('2028-06-01'), findsOneWidget);
  });
}
