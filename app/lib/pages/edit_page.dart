import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/categories.dart';
import '../core/format.dart';
import '../data/api_client.dart';
import '../models/money_record.dart';
import '../theme.dart';
import '../widgets/app_card.dart';
import '../widgets/app_scope.dart';

/// 新增 / 编辑一条记录。
/// 传了 [existing] 就是编辑，没传就是新增。
class EditPage extends StatefulWidget {
  const EditPage({super.key, this.existing, this.defaultDate});

  final MoneyRecord? existing;
  final String? defaultDate;

  @override
  State<EditPage> createState() => _EditPageState();
}

class _EditPageState extends State<EditPage> {
  late String _type;
  late String _category;
  late String _date;

  final TextEditingController _amountCtrl = TextEditingController();
  final TextEditingController _noteCtrl = TextEditingController();

  bool _saving = false;

  bool get _isEditing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;

    _type = existing?.type ?? expenseType;
    _category = existing?.category ?? categoriesFor(_type).first.name;
    _date = existing?.date ?? widget.defaultDate ?? today();

    if (existing != null) {
      _amountCtrl.text = _amountToText(existing.amount);
      _noteCtrl.text = existing.note;
    }
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  /// 25.5 -> '25.5'，42.0 -> '42'。不要显示成 '25.50' 让用户去删多余的 0。
  ///
  /// 注意别偷懒写成 `if (text.endsWith('.00')) 去掉后三位`：
  /// 那样只能处理 42.00，处理不了 25.50（末尾是 0 但不是 .00），
  /// 用户打开编辑页会看到 '25.50'，还得自己删掉那个 0。
  /// 正确做法是"去掉末尾所有的 0"，再"去掉可能剩下的那个小数点"。
  String _amountToText(double value) {
    var text = value.toStringAsFixed(2); // 25.5 -> '25.50'，42 -> '42.00'
    if (text.contains('.')) {
      text = text.replaceFirst(RegExp(r'0+$'), ''); // '25.50' -> '25.5'，'42.00' -> '42.'
      text = text.replaceFirst(RegExp(r'\.$'), ''); // '42.' -> '42'
    }
    return text;
  }

  /// 服务端可能存着我们本地列表里没有的分类（比如以后加了新分类），
  /// 这时临时补一个 chip 上去，保证当前值一定是可见可选的。
  List<CategorySpec> get _availableCategories {
    final base = categoriesFor(_type);
    if (_category.isEmpty || base.any((CategorySpec c) => c.name == _category)) {
      return base;
    }
    return <CategorySpec>[
      ...base,
      CategorySpec(_category, categoryIcon(_category)),
    ];
  }

  void _onTypeChanged(String type) {
    if (type == _type) return;
    setState(() {
      _type = type;
      // 支出和收入的分类不通用，切类型就重置成第一个
      _category = categoriesFor(type).first.name;
    });
  }

  Future<void> _pickDate() async {
    // 这个日期的来源是"当前在看的那个月"（见 core/format.dart 的
    // defaultDateInMonth），用户能通过翻月份把它带到**任意年份**。
    //
    // 所以可选范围的边界不能写死。之前写的是
    //   firstDate: DateTime(2020, 1, 1)
    //   lastDate:  DateTime(DateTime.now().year + 1, 12, 31)
    // —— 那个范围是围着"今天"定的，而 initialDate 是围着"在看的月份"定的。
    // 两者不同源，就会打架：翻到 2028 年点"记一笔"，initialDate 是
    // 2028-01-01，落在 lastDate(2027-12-31) 之外，
    // showDatePicker 内部的断言直接失败 —— 调试模式下是整个界面崩掉。
    // （release 版断言被剥掉，不崩，但日历上每天都是灰的，用户选不了日期。）
    //
    // 修法就是让两者同源：范围跟着 initialDate 走。
    // 这样"initialDate 一定落在范围内"是推论出来的，不是碰巧对的。
    final initial = DateTime.tryParse(_date) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(initial.year - 1, 1, 1),
      lastDate: DateTime(initial.year + 1, 12, 31),
    );
    if (picked == null) return;
    setState(() => _date = ymd(picked));
  }

  Future<void> _save() async {
    final amount = double.tryParse(_amountCtrl.text.trim());
    if (amount == null || amount <= 0) {
      _toast('请输入大于 0 的金额');
      return;
    }
    // 后端是按"分"存的，最小单位 0.01 元。
    // 0.001 这种会被四舍五入成 0 分，后端直接拒掉。
    // 与其等一个来回再看服务端报错，不如在这儿就说清楚。
    if (amount < 0.005) {
      _toast('金额最小是 0.01 元');
      return;
    }
    if (amount > 10000000) {
      _toast('金额超过一千万，确认一下是不是输错了');
      return;
    }
    if (_category.isEmpty) {
      _toast('请先选一个分类');
      return;
    }

    // 这几个都必须在 await 之前取好。
    // await 之后 widget 可能已经被销毁，那时再用 context 就是错的。
    final state = AppScope.of(context);
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final note = _noteCtrl.text.trim();
    final existing = widget.existing;

    setState(() => _saving = true);

    try {
      if (existing == null) {
        final created = await state.addRecord(
          type: _type,
          amount: amount,
          category: _category,
          note: note,
          date: _date,
        );
        if (!mounted) return;

        // 记到了别的月份：说清楚，不然用户会以为没保存上
        final recordMonth = monthOfYmd(created.date);
        if (recordMonth != state.month) {
          _showBar(
            messenger,
            '已保存到${monthLabel(recordMonth)}，当前看的是${monthLabel(state.month)}',
          );
        }
      } else {
        await state.updateRecord(
          existing.copyWith(
            type: _type,
            amount: amount,
            category: _category,
            note: note,
            date: _date,
          ),
        );
      }

      if (!mounted) return;
      navigator.pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _showBar(messenger, e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _showBar(messenger, '保存失败：$e');
    }
  }

  Future<void> _confirmDelete() async {
    final existing = widget.existing;
    if (existing == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: const Text('删除这条记录？'),
        content: Text('${existing.category} ${formatYuan(existing.amount)}，删掉就找不回来了。'),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('删除'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    // 分开写两句，而不是合成 `!mounted || confirmed != true`：
    // use_build_context_synchronously 这条 lint 只认单独成句的 mounted 检查。
    if (!mounted) return;

    final state = AppScope.of(context);
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);

    setState(() => _saving = true);
    try {
      await state.deleteRecord(existing.id);
      if (!mounted) return;
      navigator.pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _showBar(messenger, e.message);
    }
  }

  /// 同步场景用：调用点一定在 await 之前
  void _toast(String message) {
    _showBar(ScaffoldMessenger.of(context), message);
  }

  void _showBar(ScaffoldMessengerState messenger, String message) {
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final amountColor =
        _type == expenseType ? expenseColorOf(context) : incomeColorOf(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? '编辑记录' : '记一笔'),
        actions: <Widget>[
          if (_isEditing)
            IconButton(
              tooltip: '删除',
              onPressed: _saving ? null : _confirmDelete,
              icon: const Icon(Icons.delete_outline),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
        children: <Widget>[
          Center(
            child: SegmentedButton<String>(
              segments: const <ButtonSegment<String>>[
                ButtonSegment<String>(
                  value: expenseType,
                  label: Text('支出'),
                  icon: Icon(Icons.arrow_upward),
                ),
                ButtonSegment<String>(
                  value: incomeType,
                  label: Text('收入'),
                  icon: Icon(Icons.arrow_downward),
                ),
              ],
              selected: <String>{_type},
              onSelectionChanged: (Set<String> selection) =>
                  _onTypeChanged(selection.first),
              showSelectedIcon: false,
            ),
          ),
          const SizedBox(height: 20),

          AppCard(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  '金额',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: <Widget>[
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        '¥',
                        style: theme.textTheme.headlineSmall?.copyWith(color: amountColor),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _amountCtrl,
                        autofocus: !_isEditing,
                        keyboardType:
                            const TextInputType.numberWithOptions(decimal: true),
                        inputFormatters: <TextInputFormatter>[
                          FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                          LengthLimitingTextInputFormatter(12),
                        ],
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: amountColor,
                        ),
                        decoration: const InputDecoration(
                          hintText: '0.00',
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: EdgeInsets.zero,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          Text(
            '分类',
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              for (final spec in _availableCategories)
                ChoiceChip(
                  label: Text(spec.name),
                  avatar: Icon(spec.icon, size: 16),
                  selected: _category == spec.name,
                  onSelected: (_) => setState(() => _category = spec.name),
                ),
            ],
          ),
          const SizedBox(height: 20),

          AppCard(
            padding: EdgeInsets.zero,
            child: ListTile(
              leading: const Icon(Icons.event_outlined),
              title: const Text('日期'),
              subtitle: Text('$_date · ${friendlyDate(_date)}'),
              trailing: const Icon(Icons.chevron_right),
              onTap: _pickDate,
            ),
          ),
          const SizedBox(height: 20),

          TextField(
            controller: _noteCtrl,
            maxLength: 200,
            maxLines: 2,
            minLines: 1,
            textInputAction: TextInputAction.done,
            decoration: const InputDecoration(
              labelText: '备注（可以不填）',
              hintText: '比如：和朋友聚餐',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),

          SizedBox(
            height: 52,
            child: FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.check),
              label: Text(_saving ? '保存中…' : '保存'),
            ),
          ),
        ],
      ),
    );
  }
}
