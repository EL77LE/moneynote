import 'package:flutter/foundation.dart';

import '../core/format.dart';
import '../data/api_client.dart';
import '../data/repository.dart';
import '../models/money_record.dart';
import '../models/month_stats.dart';

enum RecordFilter { all, expense, income }

/// 全局状态。用最朴素的 ChangeNotifier，不引 Provider / Riverpod / Bloc ——
/// 这个体量的 App 引状态管理框架是纯负担。
/// 界面通过 AppScope.of(context) 拿到它，并在它变化时自动重建。
class AppState extends ChangeNotifier {
  AppState(this._repo);

  final Repository _repo;

  String _month = currentMonth();
  List<MoneyRecord> _records = const <MoneyRecord>[];
  MonthStats? _stats;
  bool _loading = false;
  String? _error;
  bool _showingCache = false;
  RecordFilter _filter = RecordFilter.all;

  /// 请求序号。快速连点"上个月"时，先发的请求可能后返回，
  /// 落地后会把新月份的数据覆盖掉。靠这个序号丢弃过期响应。
  int _seq = 0;

  String get month => _month;
  MonthStats? get stats => _stats;
  bool get loading => _loading;
  String? get error => _error;
  bool get showingCache => _showingCache;
  RecordFilter get filter => _filter;
  bool get isCurrentMonth => _month == currentMonth();

  /// 当前筛选下的记录
  List<MoneyRecord> get visibleRecords {
    switch (_filter) {
      case RecordFilter.all:
        return _records;
      case RecordFilter.expense:
        return _records.where((r) => r.isExpense).toList();
      case RecordFilter.income:
        return _records.where((r) => !r.isExpense).toList();
    }
  }

  void setFilter(RecordFilter value) {
    if (_filter == value) return;
    _filter = value;
    notifyListeners();
  }

  void setMonth(String value) {
    if (value == _month) return;
    _month = value;
    notifyListeners();
    load();
  }

  void shiftMonth(int delta) => setMonth(shiftMonthStr(_month, delta));

  void goToCurrentMonth() => setMonth(currentMonth());

  void clearError() {
    if (_error == null) return;
    _error = null;
    notifyListeners();
  }

  /// 加载当前月份的数据。
  ///
  /// 顺序是刻意设计的：先亮出缓存让界面有内容，再去请求网络。
  /// 网络失败也不清空界面，只在顶部挂一条错误提示。
  Future<void> load({bool silent = false}) async {
    final seq = ++_seq;
    if (!silent) {
      _loading = true;
      _error = null;
      notifyListeners();
    }

    final cached = await _repo.readCache(_month);
    if (seq != _seq) return; // 期间用户切了月份，这次结果作废

    if (cached != null) {
      _records = cached.records;
      _stats = cached.stats;
      _showingCache = true;
      _loading = false;
      notifyListeners();
    } else {
      // 这个月本地没有缓存。两件事都得做，少一件界面就是错的：
      //
      //   1. 清掉"正在显示缓存"的横幅。它不会自己变 false ——
      //      从上个月（有缓存）切过来时会一直挂着，可这次显示的根本不是缓存。
      //   2. 清空列表。否则在新月份的标题底下，显示的是**上个月的数据**。
      //      数字明显对不上，比一个空列表更让人摸不着头脑。
      //      下面网络回来就填上了；网络失败的话也正好是空的。
      _records = const <MoneyRecord>[];
      _stats = null;
      _showingCache = false;
    }

    try {
      final data = await _repo.fetchMonth(_month);
      if (seq != _seq) return;

      _records = data.records;
      _stats = data.stats;
      _showingCache = false;
      _error = null;
    } on ApiException catch (e) {
      if (seq != _seq) return;
      _error = e.message;
      // 有缓存就继续显示缓存；没有才清空
      if (cached == null) {
        _records = const <MoneyRecord>[];
        _stats = null;
      }
    } catch (e) {
      if (seq != _seq) return;
      _error = '出了点问题：$e';
      if (cached == null) {
        _records = const <MoneyRecord>[];
        _stats = null;
      }
    } finally {
      if (seq == _seq) {
        _loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> refresh() => load(silent: true);

  Future<MoneyRecord> addRecord({
    required String type,
    required double amount,
    required String category,
    required String note,
    required String date,
  }) async {
    final created = await _repo.create(
      MoneyRecord.draft(
        type: type,
        amount: amount,
        category: category,
        note: note,
        date: date,
      ),
    );
    await load(silent: true);
    return created;
  }

  Future<void> updateRecord(MoneyRecord record) async {
    await _repo.update(record);
    await load(silent: true);
  }

  Future<void> deleteRecord(int id) async {
    await _repo.delete(id);
    await load(silent: true);
  }

  @override
  void dispose() {
    _repo.dispose();
    super.dispose();
  }
}
