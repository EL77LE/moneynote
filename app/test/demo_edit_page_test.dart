import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:money_note/pages/edit_page.dart';

/// 录屏演示参数的最小回归测试。
///
/// 为什么值得测：这部分代码只在 GitHub Actions 的录屏构建里打开，
/// 本机正常运行时 `demoAmount` 永远是 null。也就是说，
/// 如果这里填错了，你本地怎么点都发现不了，只有等 20 分钟后
/// 拿到的视频里金额是空的。
///
/// 守两件事：
///   1. 金额和备注确实被填进了输入框；
///   2. 演示时 `autofocus` 是 false，否则键盘会盖住分类和保存按钮。
void main() {
  testWidgets('演示参数会填好金额和备注，并且不自动弹键盘', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: EditPage(demoAmount: 25.5, demoNote: '午饭'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('25.5'), findsOneWidget);
    expect(find.text('午饭'), findsOneWidget);

    final TextField amountField =
        tester.widget<TextField>(find.byType(TextField).first);
    expect(amountField.autofocus, isFalse);
  });
}
