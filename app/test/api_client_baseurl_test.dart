import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:money_note/data/api_client.dart';

/// 后端地址里末尾那个斜杠的测试。
///
/// **为什么值得单独测**：部署到云平台时（Render、Railway、Fly……），
/// 控制台给你的地址经常是带斜杠的，复制粘贴过来就带上了。
/// 而 `'$baseUrl$path'` 这么一拼，就变成 `https://x.com//api/health`。
///
/// 双斜杠不是等价写法 —— 实测后端会返回 404「没有这个接口」。
/// 于是每个请求都失败，而错误信息会把人往"后端没部署好"上带，
/// 真正的病因（多了一个斜杠）完全看不出来。
///
/// 这类 bug 的特点：**代码没错，是配置的边界情况没处理**。
void main() {
  /// 记录下客户端真正请求的那个 URL。
  ({ApiClient api, List<String> urls}) clientWith(String baseUrl) {
    final urls = <String>[];
    final client = MockClient((http.Request req) async {
      urls.add(req.url.toString());
      return http.Response(
        jsonEncode(<String, dynamic>{
          'expenseTotal': 0,
          'incomeTotal': 0,
          'balance': 0,
          'count': 0,
          'byCategory': <dynamic>[],
          'daily': <dynamic>[],
        }),
        200,
        headers: <String, String>{'content-type': 'application/json; charset=utf-8'},
      );
    });
    return (api: ApiClient(baseUrl: baseUrl, client: client), urls: urls);
  }

  test('地址不带斜杠时，请求路径正常', () async {
    final c = clientWith('http://127.0.0.1:3000');
    await c.api.fetchStats('2026-10');
    expect(c.urls.single, 'http://127.0.0.1:3000/api/stats?month=2026-10');
  });

  test('地址带末尾斜杠时，不能拼出双斜杠', () async {
    final c = clientWith('http://127.0.0.1:3000/');
    await c.api.fetchStats('2026-10');
    expect(c.urls.single, 'http://127.0.0.1:3000/api/stats?month=2026-10');
    expect(c.urls.single.contains('//api'), isFalse, reason: '不能出现双斜杠');
  });

  test('地址带多个末尾斜杠也不怕', () async {
    final c = clientWith('http://127.0.0.1:3000///');
    await c.api.fetchStats('2026-10');
    expect(c.urls.single, 'http://127.0.0.1:3000/api/stats?month=2026-10');
  });

  test('地址首尾有多余空格时，自动去掉', () async {
    // 从网页/文档里复制地址时，很容易连空格一起复制进来
    final c = clientWith('  https://api.example.com  ');
    await c.api.fetchStats('2026-10');
    expect(c.urls.single, 'https://api.example.com/api/stats?month=2026-10');
  });

  test('https 地址也照常处理', () async {
    final c = clientWith('https://moneynote-api.onrender.com/');
    await c.api.fetchStats('2026-10');
    expect(
      c.urls.single,
      'https://moneynote-api.onrender.com/api/stats?month=2026-10',
    );
  });

  test('规范化之后，错误提示里显示的地址也是干净的', () async {
    // describeNetworkError 会把当前地址显示给用户。
    // 如果里面带个多余斜杠，用户复制它去排查，反而更乱。
    // 抛一个会被归类成"连不上"的错误 —— 这一类提示里才会带上地址，
    // 正好用来验证带出去的那个地址是干净的。
    final client = MockClient((http.Request req) async {
      throw http.ClientException('Connection refused');
    });
    final api = ApiClient(baseUrl: 'http://127.0.0.1:3000/', client: client);

    expect(api.baseUrl, 'http://127.0.0.1:3000');
    await expectLater(
      api.fetchStats('2026-10'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.message,
          'message',
          contains('http://127.0.0.1:3000'),
        ),
      ),
    );
  });
}
