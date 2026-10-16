import 'package:flutter/material.dart';

/// 分类定义。名字必须和后端 seed 数据里的分类名对得上，
/// 否则统计页会取不到图标（会退化成默认图标，不会崩）。
class CategorySpec {
  const CategorySpec(this.name, this.icon);

  final String name;
  final IconData icon;
}

const List<CategorySpec> expenseCategories = <CategorySpec>[
  CategorySpec('餐饮', Icons.restaurant),
  CategorySpec('交通', Icons.directions_bus),
  CategorySpec('购物', Icons.shopping_bag),
  CategorySpec('娱乐', Icons.sports_esports),
  CategorySpec('居住', Icons.home),
  CategorySpec('医疗', Icons.medical_services),
  CategorySpec('其他', Icons.category),
];

const List<CategorySpec> incomeCategories = <CategorySpec>[
  CategorySpec('工资', Icons.account_balance_wallet),
  CategorySpec('奖金', Icons.card_giftcard),
  CategorySpec('理财', Icons.trending_up),
  CategorySpec('兼职', Icons.work),
  CategorySpec('红包', Icons.redeem),
];

const String expenseType = 'expense';
const String incomeType = 'income';

List<CategorySpec> categoriesFor(String type) =>
    type == incomeType ? incomeCategories : expenseCategories;

/// 未知分类给个兜底图标，保证永远不会因为数据里有新分类而崩溃。
IconData categoryIcon(String name) {
  for (final spec in expenseCategories) {
    if (spec.name == name) return spec.icon;
  }
  for (final spec in incomeCategories) {
    if (spec.name == name) return spec.icon;
  }
  return Icons.label_outline;
}
