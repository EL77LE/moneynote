import 'dart:convert';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/money_record.dart';
import '../models/month_stats.dart';

class CachedMonth {
  const CachedMonth({required this.records, required this.stats});

  final List<MoneyRecord> records;
  final MonthStats? stats;
}

/// 本地缓存：按月份存一份 JSON。
///
/// 意义不是"省流量"，而是：打开 App 立刻有内容，不用瞪着白屏等网络。
/// 后端挂了 / 地铁里没信号的时候，照样能看到上次的数据。
class LocalCache {
  static const String _recordsPrefix = 'cache.records.';
  static const String _statsPrefix = 'cache.stats.';

  Future<SharedPreferences> get _prefs => SharedPreferences.getInstance();

  Future<CachedMonth?> read(String month) async {
    try {
      final prefs = await _prefs;
      final rawRecords = prefs.getString('$_recordsPrefix$month');
      if (rawRecords == null) return null;

      final records = (jsonDecode(rawRecords) as List<dynamic>)
          .map((e) => MoneyRecord.fromJson(e as Map<String, dynamic>))
          .toList();

      final rawStats = prefs.getString('$_statsPrefix$month');
      return CachedMonth(
        records: records,
        stats: rawStats == null
            ? null
            : MonthStats.fromJson(jsonDecode(rawStats) as Map<String, dynamic>),
      );
    } catch (_) {
      // 缓存格式对不上（比如升级了字段）就当没有，绝不能因此让 App 起不来
      return null;
    }
  }

  Future<void> write(String month, List<MoneyRecord> records, MonthStats? stats) async {
    try {
      final prefs = await _prefs;
      await prefs.setString(
        '$_recordsPrefix$month',
        jsonEncode(records.map((e) => e.toJson()).toList()),
      );
      if (stats != null) {
        await prefs.setString('$_statsPrefix$month', jsonEncode(stats.toJson()));
      }
    } catch (e) {
      // 写缓存失败不影响主流程，所以不往外抛。
      // 但也不静默吞掉 —— 留着这行日志，真出问题时能看见。
      debugPrint('写本地缓存失败（已忽略，不影响使用）：$e');
    }
  }
}
