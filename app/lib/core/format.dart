/// 日期 / 金额的格式化与解析工具。
///
/// 刻意不引 intl 包：少一个依赖就少一份版本冲突的风险，
/// 而这几个函数的逻辑一眼能看懂。
///
/// 那行 `library;` 是给上面的文档注释"挂靠"用的。
/// 文件开头的 `///` 在 Dart 眼里叫「库文档注释」，它必须紧跟着一个
/// `library` 指令；不写这行，analyzer 会报
/// `dangling_library_doc_comments`——注释飘着没地方落。
/// 它本身不产生任何代码，纯粹是个声明的落点。
library;

const List<String> _weekdayNames = <String>['一', '二', '三', '四', '五', '六', '日'];

String _two(int n) => n.toString().padLeft(2, '0');

/// DateTime -> 'YYYY-MM-DD'
String ymd(DateTime d) => '${d.year}-${_two(d.month)}-${_two(d.day)}';

/// DateTime -> 'YYYY-MM'
String ym(DateTime d) => '${d.year}-${_two(d.month)}';

/// 当前月份 'YYYY-MM'
String currentMonth() => ym(DateTime.now());

/// 今天 'YYYY-MM-DD'
String today() => ymd(DateTime.now());

/// 'YYYY-MM' 加减若干个月，自动处理跨年。
/// shiftMonthStr('2026-01', -1) == '2025-12'
///
/// 注意这里**不能**写成 `year += (mon - 1) ~/ 12`。
/// Dart 的 `~/` 是向零截断而不是向下取整：(-1) ~/ 12 == 0，
/// 于是 '2026-01' 减一个月会算出 '2026-12' —— 跨年判断失效。
/// 正确做法是先换算成"从 0 年起的总月数"，加完再换算回来，
/// 全程只有非负数，`~/` 才等价于地板除。
String shiftMonthStr(String month, int delta) {
  final parts = month.split('-');
  if (parts.length != 2) return month;

  final year = int.tryParse(parts[0]);
  final mon = int.tryParse(parts[1]);
  if (year == null || mon == null) return month;

  final totalMonths = year * 12 + (mon - 1) + delta;
  final newYear = totalMonths ~/ 12;
  final newMon = totalMonths % 12 + 1;
  return '$newYear-${_two(newMon)}';
}

/// 'YYYY-MM' -> '2026年10月'
String monthLabel(String month) {
  final parts = month.split('-');
  if (parts.length != 2) return month;
  final year = int.tryParse(parts[0]);
  final mon = int.tryParse(parts[1]);
  if (year == null || mon == null) return month;
  return '$year年$mon月';
}

/// 'YYYY-MM' -> '2026-10'
String monthOfYmd(String date) => date.length >= 7 ? date.substring(0, 7) : date;

/// 在某个给定月份里挑一个合适的默认日期。
/// 看的是当月就是今天，看的是历史月份就取那个月 1 号。
String defaultDateInMonth(String month) {
  if (month == currentMonth()) return today();
  return '$month-01';
}

/// 'YYYY-MM-DD' -> '今天' / '昨天' / '10月14日 周二'
String friendlyDate(String date) {
  final parsed = DateTime.tryParse(date);
  if (parsed == null) return date;

  final now = DateTime.now();
  final that = DateTime(parsed.year, parsed.month, parsed.day);
  final nowDay = DateTime(now.year, now.month, now.day);
  final diffDays = nowDay.difference(that).inDays;

  if (diffDays == 0) return '今天';
  if (diffDays == 1) return '昨天';
  if (diffDays == 2) return '前天';

  final weekday = _weekdayNames[parsed.weekday - 1];
  return '${parsed.month}月${parsed.day}日 周$weekday';
}

/// 金额 -> '¥1,234.56'，会加千分位。
/// showSign 为 true 时正数前面带 '+'，用于收支列表。
String formatYuan(double value, {bool showSign = false}) {
  final negative = value < 0;
  final text = value.abs().toStringAsFixed(2);
  final dot = text.indexOf('.');
  final intPart = text.substring(0, dot);
  final decPart = text.substring(dot + 1);

  final buffer = StringBuffer();
  for (var i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 == 0) buffer.write(',');
    buffer.write(intPart[i]);
  }

  // 0 不加 '+'：它不是正数。这个判断在收支列表里能看出来 —— 不会出现 "+¥0.00"。
  final sign = negative ? '-' : (showSign && value > 0 ? '+' : '');
  return '$sign¥$buffer.$decPart';
}

/// 大数简写，给空间紧张的地方用：12345.6 -> '1.2万'
String formatYuanCompact(double value) {
  final abs = value.abs();
  final sign = value < 0 ? '-' : '';
  if (abs >= 10000) return '$sign¥${(abs / 10000).toStringAsFixed(1)}万';
  if (abs >= 1000) return '$sign¥${(abs / 1000).toStringAsFixed(1)}k';
  return '$sign¥${abs.toStringAsFixed(0)}';
}

/// 百分比文案：0.253 -> '25.3%'
String formatPercent(double ratio) => '${(ratio * 100).toStringAsFixed(1)}%';
