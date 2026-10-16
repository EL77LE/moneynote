import 'package:flutter_test/flutter_test.dart';
import 'package:money_note/core/format.dart';

/// 纯函数的单元测试。跑：flutter test
///
/// 这些函数不依赖任何 Flutter 运行时，所以测试是毫秒级的。
/// 面试时如果被问"你怎么保证代码是对的"，这就是答案的一部分。
void main() {
  group('shiftMonthStr 月份加减', () {
    test('普通加减', () {
      expect(shiftMonthStr('2026-10', 1), '2026-11');
      expect(shiftMonthStr('2026-10', -1), '2026-09');
      expect(shiftMonthStr('2026-06', 3), '2026-09');
    });

    test('跨年', () {
      expect(shiftMonthStr('2026-12', 1), '2027-01');
      expect(shiftMonthStr('2026-01', -1), '2025-12');
    });

    test('跨多年', () {
      expect(shiftMonthStr('2026-01', -13), '2024-12');
      expect(shiftMonthStr('2026-12', 13), '2028-01');
      expect(shiftMonthStr('2026-06', -30), '2023-12');
    });

    test('delta 为 0 时原样返回', () {
      expect(shiftMonthStr('2026-10', 0), '2026-10');
    });

    test('输入非法时不抛异常', () {
      expect(shiftMonthStr('乱填', 1), '乱填');
    });
  });

  group('formatYuan 金额格式化', () {
    test('两位小数', () {
      expect(formatYuan(0), '¥0.00');
      expect(formatYuan(5.5), '¥5.50');
      expect(formatYuan(0.1), '¥0.10');
    });

    test('千分位', () {
      expect(formatYuan(999), '¥999.00');
      expect(formatYuan(1000), '¥1,000.00');
      expect(formatYuan(1234.56), '¥1,234.56');
      expect(formatYuan(1234567.8), '¥1,234,567.80');
    });

    test('负数', () {
      expect(formatYuan(-42), '-¥42.00');
      expect(formatYuan(-1234.5), '-¥1,234.50');
    });

    test('showSign 只给正数加号', () {
      expect(formatYuan(42, showSign: true), '+¥42.00');
      expect(formatYuan(-42, showSign: true), '-¥42.00');
      expect(formatYuan(0, showSign: true), '¥0.00');
    });

    test('浮点误差不会漏出来', () {
      // 0.1 + 0.2 在 IEEE 754 下是 0.30000000000000004
      expect(formatYuan(0.1 + 0.2), '¥0.30');
    });
  });

  group('formatYuanCompact 大数简写', () {
    test('万位以上', () {
      expect(formatYuanCompact(12345.6), '¥1.2万');
      expect(formatYuanCompact(100000), '¥10.0万');
    });

    test('千位', () {
      expect(formatYuanCompact(1500), '¥1.5k');
    });

    test('千位以下', () {
      expect(formatYuanCompact(999), '¥999');
    });

    test('负数', () {
      expect(formatYuanCompact(-12345.6), '-¥1.2万');
    });
  });

  group('formatPercent 百分比', () {
    test('一位小数', () {
      expect(formatPercent(0.253), '25.3%');
      expect(formatPercent(1), '100.0%');
      expect(formatPercent(0), '0.0%');
    });
  });

  group('月 / 日 格式化', () {
    test('monthLabel', () {
      expect(monthLabel('2026-10'), '2026年10月');
      expect(monthLabel('2026-01'), '2026年1月');
    });

    test('ymd / ym', () {
      expect(ymd(DateTime(2026, 10, 5)), '2026-10-05');
      expect(ym(DateTime(2026, 10, 5)), '2026-10');
      expect(ymd(DateTime(2026, 1, 1)), '2026-01-01');
    });

    test('monthOfYmd', () {
      expect(monthOfYmd('2026-10-15'), '2026-10');
    });

    test('friendlyDate 对今天和昨天有专门文案', () {
      final now = DateTime.now();
      expect(friendlyDate(ymd(now)), '今天');
      expect(friendlyDate(ymd(now.subtract(const Duration(days: 1)))), '昨天');
    });

    test('friendlyDate 输入非法时原样返回，不抛异常', () {
      expect(friendlyDate('乱填'), '乱填');
    });
  });
}
