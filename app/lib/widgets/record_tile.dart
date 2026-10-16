import 'package:flutter/material.dart';

import '../core/categories.dart';
import '../core/format.dart';
import '../models/money_record.dart';
import '../theme.dart';

/// 明细列表里的一行。
class RecordTile extends StatelessWidget {
  const RecordTile({super.key, required this.record, this.onTap});

  final MoneyRecord record;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    final accent = record.isExpense ? expenseColorOf(context) : incomeColorOf(context);

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: <Widget>[
            CircleAvatar(
              radius: 20,
              backgroundColor: accent.withAlpha(31),
              child: Icon(categoryIcon(record.category), size: 20, color: accent),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    record.category,
                    style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w500),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    record.note.isEmpty ? '无备注' : record.note,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              // 数据库里的 amount 永远是正数（后端有 CHECK (amount_cents > 0)），
              // "这是支出还是收入"是靠 type 字段表达的。
              // 所以不能直接 formatYuan(record.amount, showSign: true) ——
              // 那样支出也会显示成 +¥42.00，红字配加号，看着就是错的。
              // 支出取负号进函数，才有 -¥42.00 / +¥5,000.00 的效果。
              formatYuan(
                record.isExpense ? -record.amount : record.amount,
                showSign: true,
              ),
              style: theme.textTheme.titleMedium?.copyWith(
                color: accent,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
