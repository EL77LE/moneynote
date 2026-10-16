import 'dart:async';

import '../models/money_record.dart';
import '../models/month_stats.dart';
import 'api_client.dart';
import 'local_cache.dart';

class MonthData {
  const MonthData({required this.records, required this.stats});

  final List<MoneyRecord> records;
  final MonthStats stats;
}

/// 把「网络」和「缓存」拼在一起，对上层只暴露"要这个月的数据"这一件事。
/// UI 层不需要知道数据是从网络来的还是从缓存来的。
class Repository {
  Repository({required ApiClient api, required LocalCache cache})
      : _api = api,
        _cache = cache;

  final ApiClient _api;
  final LocalCache _cache;

  Future<CachedMonth?> readCache(String month) => _cache.read(month);

  Future<MonthData> fetchMonth(String month) async {
    // 两个 Future 先启动再 await —— 这样两个请求是并发的，
    // 总耗时 = 较慢的那个，而不是两个相加。
    final recordsFuture = _api.fetchRecords(month);
    // 那个 ..ignore() 不是可有可无的，去掉会出问题：
    // 两个请求并发发出去了，但下面只能一个一个 await。
    // 如果第一个就抛了异常，第二个的异常就**永远没人 await** ——
    // Dart 把它算作"未处理的异步错误"报到 zone 上，
    // 控制台会多一条红色的 Unhandled Exception，看着像程序崩了。
    // ignore() 给它挂一个"已接收"的空处理，消掉那条重复报错；
    // 真正的异常仍然由下面的 await 正常抛出去，一个都不会丢。
    final statsFuture = _api.fetchStats(month)..ignore();

    final records = await recordsFuture;
    final stats = await statsFuture;

    await _cache.write(month, records, stats);
    return MonthData(records: records, stats: stats);
  }

  Future<MoneyRecord> create(MoneyRecord draft) => _api.createRecord(draft);

  Future<MoneyRecord> update(MoneyRecord record) => _api.updateRecord(record);

  Future<void> delete(int id) => _api.deleteRecord(id);

  void dispose() => _api.dispose();
}
