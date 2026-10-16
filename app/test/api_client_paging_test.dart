import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:money_note/data/api_client.dart';

/// `fetchRecords` 的翻页测试。
///
/// **为什么要测它**：后端一个请求最多返回 1000 条（`MAX_LIMIT`）。
/// 如果客户端只发一次请求就完事，某个月超过 1000 条时会出现
/// "同一屏上两个数字对不上"—— 卡片说 1001 笔（数字来自统计接口，是真的），
/// 列表只有 1000 行，而且有一条记录用户永远看不到。
///
/// 这种 bug 的特点：**只有当数据量超过一个门槛才会出现**。
/// 种子数据只有 65 条，手工点一百遍也点不出来。
/// 所以只能靠测试来守 —— 这正是"为什么要写测试"的又一个实例。
///
/// 这里用 `MockClient` 伪造 HTTP 层，不去连真后端。
/// 好处是：能精确构造出"正好 1001 条"这种现实里很难摆出来的数据，
/// 而且跑得飞快、不依赖任何外部进程。
void main() {
  /// 造一个假的后端：总共 [total] 条，按 offset/limit 切页返回。
  /// 同时把每次请求的 offset 记下来，好断言"确实翻页了"。
  ({ApiClient api, List<int> offsets}) fakeBackend(int total) {
    final offsets = <int>[];

    final client = MockClient((http.Request req) async {
      final offset = int.parse(req.url.queryParameters['offset'] ?? '0');
      final limit = int.parse(req.url.queryParameters['limit'] ?? '500');
      offsets.add(offset);

      final items = <Map<String, dynamic>>[];
      for (int i = offset; i < total && i < offset + limit; i++) {
        items.add(<String, dynamic>{
          'id': i + 1,
          'type': 'expense',
          'amount': 1.0,
          'category': '餐饮',
          'note': '',
          'date': '2026-12-05',
        });
      }

      return http.Response(
        jsonEncode(<String, dynamic>{'total': total, 'items': items}),
        200,
        headers: <String, String>{'content-type': 'application/json; charset=utf-8'},
      );
    });

    return (
      api: ApiClient(baseUrl: 'http://example.invalid', client: client),
      offsets: offsets,
    );
  }

  test('记录数正好一页时，只请求一次', () async {
    final fake = fakeBackend(1000);
    final records = await fake.api.fetchRecords('2026-12');

    expect(records.length, 1000);
    // 关键：没有多打一次"空请求"。
    expect(fake.offsets, <int>[0]);
  });

  test('不满一页时，只请求一次', () async {
    final fake = fakeBackend(27);
    final records = await fake.api.fetchRecords('2026-12');

    expect(records.length, 27);
    expect(fake.offsets, <int>[0]);
  });

  test('超过一页时会自动翻页，一条都不少', () async {
    // 1001 条 —— 比一页多一条。这正是修复前会丢记录的那个临界点。
    final fake = fakeBackend(1001);
    final records = await fake.api.fetchRecords('2026-12');

    expect(records.length, 1001, reason: '不能少任何一条记录');
    expect(records.first.id, 1);
    expect(records.last.id, 1001, reason: '最后一条必须是第 1001 条');
    // 翻了两次：offset=0 和 offset=1000。
    expect(fake.offsets, <int>[0, 1000]);
  });

  test('翻多页时顺序正确、不重复', () async {
    final fake = fakeBackend(2500);
    final records = await fake.api.fetchRecords('2026-12');

    expect(records.length, 2500);
    expect(fake.offsets, <int>[0, 1000, 2000]);
    // 每条的 id 严格递增 —— 说明既没重复也没漏。
    for (int i = 0; i < records.length; i++) {
      expect(records[i].id, i + 1);
    }
  });

  test('空月份不会无限翻页', () async {
    final fake = fakeBackend(0);
    final records = await fake.api.fetchRecords('2026-12');

    expect(records, isEmpty);
    expect(fake.offsets, <int>[0], reason: '空结果必须立刻停下，不能一直请求');
  });
}
