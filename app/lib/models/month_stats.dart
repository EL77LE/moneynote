/// 某个分类下的合计，用于统计页的占比条
class CategoryStat {
  const CategoryStat({
    required this.category,
    required this.amount,
    required this.count,
  });

  final String category;
  final double amount;
  final int count;

  factory CategoryStat.fromJson(Map<String, dynamic> json) => CategoryStat(
        category: json['category'] as String? ?? '其他',
        amount: (json['amount'] as num?)?.toDouble() ?? 0,
        count: (json['count'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'category': category,
        'amount': amount,
        'count': count,
      };
}

/// 某一天的支出合计，用于统计页的趋势柱
class DailyStat {
  const DailyStat({required this.date, required this.amount});

  final String date;
  final double amount;

  factory DailyStat.fromJson(Map<String, dynamic> json) => DailyStat(
        date: json['date'] as String? ?? '',
        amount: (json['amount'] as num?)?.toDouble() ?? 0,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{'date': date, 'amount': amount};
}

/// 整月统计。服务端一次请求就把三样都算好，App 不用发三次。
class MonthStats {
  const MonthStats({
    required this.expenseTotal,
    required this.incomeTotal,
    required this.balance,
    required this.count,
    required this.byCategory,
    required this.daily,
  });

  final double expenseTotal;
  final double incomeTotal;
  final double balance;
  final int count;
  final List<CategoryStat> byCategory;
  final List<DailyStat> daily;

  static const MonthStats empty = MonthStats(
    expenseTotal: 0,
    incomeTotal: 0,
    balance: 0,
    count: 0,
    byCategory: <CategoryStat>[],
    daily: <DailyStat>[],
  );

  factory MonthStats.fromJson(Map<String, dynamic> json) => MonthStats(
        expenseTotal: (json['expenseTotal'] as num?)?.toDouble() ?? 0,
        incomeTotal: (json['incomeTotal'] as num?)?.toDouble() ?? 0,
        balance: (json['balance'] as num?)?.toDouble() ?? 0,
        count: (json['count'] as num?)?.toInt() ?? 0,
        byCategory: ((json['byCategory'] as List<dynamic>?) ?? const <dynamic>[])
            .map((e) => CategoryStat.fromJson(e as Map<String, dynamic>))
            .toList(),
        daily: ((json['daily'] as List<dynamic>?) ?? const <dynamic>[])
            .map((e) => DailyStat.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'expenseTotal': expenseTotal,
        'incomeTotal': incomeTotal,
        'balance': balance,
        'count': count,
        'byCategory': byCategory.map((e) => e.toJson()).toList(),
        'daily': daily.map((e) => e.toJson()).toList(),
      };

  /// 支出里最大的那个分类，用来算柱条长度基准
  double get maxCategoryAmount =>
      byCategory.isEmpty ? 0 : byCategory.first.amount;

  /// 单日支出的最大值，用来算趋势柱高度基准
  double get maxDailyAmount {
    var max = 0.0;
    for (final d in daily) {
      if (d.amount > max) max = d.amount;
    }
    return max;
  }
}
