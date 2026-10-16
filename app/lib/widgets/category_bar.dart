import 'package:flutter/material.dart';

import '../core/categories.dart';
import '../core/format.dart';

/// 分类占比条。
///
/// 两个不同的比例别混了：
///   * [maxAmount] 算出来的是"条有多长"—— 相对最大的那个分类，视觉上更好看；
///   * [total] 算出来的是"占多少百分比"—— 相对总额，数字才对得上。
class CategoryBar extends StatelessWidget {
  const CategoryBar({
    super.key,
    required this.category,
    required this.amount,
    required this.count,
    required this.maxAmount,
    required this.total,
    required this.color,
  });

  final String category;
  final double amount;
  final int count;
  final double maxAmount;
  final double total;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    final barRatio = maxAmount <= 0 ? 0.0 : (amount / maxAmount).clamp(0.0, 1.0);
    final share = total <= 0 ? 0.0 : (amount / total).clamp(0.0, 1.0);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(categoryIcon(category), size: 16, color: color),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  category,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                '$count 笔',
                style: theme.textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
              ),
              const Spacer(),
              Text(
                formatYuan(amount),
                style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 46,
                child: Text(
                  formatPercent(share),
                  textAlign: TextAlign.right,
                  style: theme.textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              final maxWidth = constraints.maxWidth;
              // 最窄留 6 像素，否则金额很小的分类在长条上几乎看不见
              final barWidth = (maxWidth * barRatio).clamp(maxWidth < 6 ? maxWidth : 6.0, maxWidth);

              return SizedBox(
                height: 8,
                child: Stack(
                  children: <Widget>[
                    Container(
                      width: double.infinity,
                      height: 8,
                      decoration: BoxDecoration(
                        color: scheme.outlineVariant.withAlpha(90),
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    Container(
                      width: barWidth,
                      height: 8,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
