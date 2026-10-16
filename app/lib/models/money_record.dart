import '../core/categories.dart';

/// 一条记账记录。
///
/// 注意类名没叫 `Record` —— Dart 3 起 `Record` 是语言内置类型，重名会冲突。
class MoneyRecord {
  const MoneyRecord({
    required this.id,
    required this.type,
    required this.amount,
    required this.category,
    required this.note,
    required this.date,
    this.createdAt = '',
    this.updatedAt = '',
  });

  final int id;

  /// 'expense' 支出 / 'income' 收入
  final String type;
  final double amount;
  final String category;
  final String note;

  /// 'YYYY-MM-DD'。用字符串而不是 DateTime，
  /// 是为了彻底避开"本地时区 vs UTC 差一天"这类经典 bug。
  final String date;

  final String createdAt;
  final String updatedAt;

  bool get isExpense => type == expenseType;

  /// 本地新建、还没提交给服务端的草稿
  factory MoneyRecord.draft({
    required String type,
    required double amount,
    required String category,
    required String note,
    required String date,
  }) =>
      MoneyRecord(
        id: 0,
        type: type,
        amount: amount,
        category: category,
        note: note,
        date: date,
      );

  factory MoneyRecord.fromJson(Map<String, dynamic> json) => MoneyRecord(
        id: (json['id'] as num?)?.toInt() ?? 0,
        type: json['type'] as String? ?? expenseType,
        amount: (json['amount'] as num?)?.toDouble() ?? 0,
        category: json['category'] as String? ?? '其他',
        note: json['note'] as String? ?? '',
        date: json['date'] as String? ?? '',
        createdAt: json['createdAt'] as String? ?? '',
        updatedAt: json['updatedAt'] as String? ?? '',
      );

  /// 写本地缓存用，字段名和服务端保持一致，省得来回映射
  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'type': type,
        'amount': amount,
        'category': category,
        'note': note,
        'date': date,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };

  /// 发给服务端的请求体。id / createdAt / updatedAt 由服务端管，不传。
  Map<String, dynamic> toRequestJson() => <String, dynamic>{
        'type': type,
        'amount': amount,
        'category': category,
        'note': note,
        'date': date,
      };

  MoneyRecord copyWith({
    int? id,
    String? type,
    double? amount,
    String? category,
    String? note,
    String? date,
  }) =>
      MoneyRecord(
        id: id ?? this.id,
        type: type ?? this.type,
        amount: amount ?? this.amount,
        category: category ?? this.category,
        note: note ?? this.note,
        date: date ?? this.date,
        createdAt: createdAt,
        updatedAt: updatedAt,
      );

  @override
  String toString() => 'MoneyRecord(#$id $type $amount $category $date)';
}
