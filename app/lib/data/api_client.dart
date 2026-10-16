import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/app_config.dart';
import '../core/net_error.dart';
import '../models/money_record.dart';
import '../models/month_stats.dart';

/// 业务层唯一需要认识的异常类型。
/// 把 SocketException / TimeoutException / HTTP 4xx 全部收口成一句人话，
/// UI 层就能直接把它显示给用户，不用关心底层是什么。
class ApiException implements Exception {
  ApiException(this.message, {this.code, this.statusCode});

  final String message;
  final String? code;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({String? baseUrl, http.Client? client})
      : baseUrl = _normalizeBaseUrl(baseUrl ?? AppConfig.apiBaseUrl),
        _client = client ?? http.Client();

  /// 去掉地址末尾的斜杠（以及首尾空格）。
  ///
  /// **为什么非要去**：请求地址是拼出来的 —— `'$baseUrl$path'`。
  /// 如果 `API_BASE_URL` 写成 `https://x.onrender.com/`（**末尾一个斜杠**），
  /// 拼出来就是 `https://x.onrender.com//api/health`。
  ///
  /// 双斜杠**不是**等价写法。实测过：
  ///   GET /api/health   -> 200
  ///   GET //api/health  -> 404 {"message":"没有这个接口：GET //api/health"}
  ///
  /// 后果是每个请求都 404，而错误信息会把人往"后端没部署好"的方向带，
  /// 实际上只是地址多打了一个斜杠。
  ///
  /// 偏偏末尾多一个斜杠是人手输和复制粘贴时**最容易发生**的事，
  /// 部署到云平台时（Render / Railway 给的地址常带斜杠）尤其容易中招。
  /// 所以在这儿统一削掉，让上层随便传。
  static String _normalizeBaseUrl(String url) {
    var normalized = url.trim();
    while (normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    return normalized;
  }

  final String baseUrl;
  final http.Client _client;

  void dispose() => _client.close();

  Future<http.Response> _dispatch(
    String method,
    Uri uri,
    Map<String, String> headers,
    String? body,
  ) {
    switch (method) {
      case 'GET':
        return _client.get(uri, headers: headers);
      case 'POST':
        return _client.post(uri, headers: headers, body: body);
      case 'PUT':
        return _client.put(uri, headers: headers, body: body);
      case 'DELETE':
        return _client.delete(uri, headers: headers);
      default:
        throw ArgumentError('不支持的 HTTP 方法：$method');
    }
  }

  /// 所有请求的唯一出口：统一超时、统一错误转译、统一 JSON 解析。
  Future<dynamic> _send(String method, String path, {Object? body}) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json; charset=utf-8',
    };
    final encoded = body == null ? null : jsonEncode(body);

    http.Response res;
    try {
      res = await _dispatch(method, uri, headers, encoded)
          .timeout(AppConfig.requestTimeout);
    } on TimeoutException {
      throw ApiException(
        '请求超时（超过 ${AppConfig.requestTimeout.inSeconds} 秒没响应），检查后端是否在运行',
      );
    } catch (e) {
      // 这里 catch 得"宽"是故意的，不是偷懒：
      // try 块里只有这一次网络调用，从这里抛出来的必然是网络层的问题。
      // 而各平台抛的类型并不统一（见 core/net_error.dart 的说明），
      // 按类型分支一定会漏掉某一端，所以统一交给它按文案归类。
      //
      // 但有一种失败是"配置就错了"，跟网络无关：https 页面调 http 接口。
      // 这种情况浏览器只会给一句 "Failed to fetch"，让人完全摸不着头脑，
      // 所以优先报配置问题——它比"后端没启动"更准确，也更可操作。
      throw ApiException(
        AppConfig.misconfigurationHint ?? describeNetworkError(e, baseUrl),
      );
    }

    // 必须走 bodyBytes 手动按 UTF-8 解码。
    // 直接用 res.body 的话，服务端没声明 charset 时 http 包会按 latin1 解，
    // 中文分类和备注就会变成乱码。
    final text = utf8.decode(res.bodyBytes);

    if (text.isEmpty) {
      if (res.statusCode >= 400) {
        throw ApiException('服务器返回 ${res.statusCode}', statusCode: res.statusCode);
      }
      return null; // 204 No Content
    }

    dynamic decoded;
    try {
      decoded = jsonDecode(text);
    } on FormatException {
      throw ApiException('服务器返回的不是合法 JSON（HTTP ${res.statusCode}）',
          statusCode: res.statusCode);
    }

    if (res.statusCode >= 400) {
      final error = decoded is Map<String, dynamic> ? decoded['error'] : null;
      if (error is Map<String, dynamic>) {
        throw ApiException(
          error['message']?.toString() ?? '请求失败',
          code: error['code']?.toString(),
          statusCode: res.statusCode,
        );
      }
      throw ApiException('请求失败（HTTP ${res.statusCode}）', statusCode: res.statusCode);
    }

    return decoded;
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    throw ApiException('服务器返回的数据结构不是预期格式');
  }

  /// 单页条数。同时也是后端 `MAX_LIMIT` 的值 —— 后端一次最多给这么多。
  static const int _pageSize = 1000;

  /// 最多翻多少页，纯粹是防御性的兜底，正常永远碰不到。
  static const int _maxPages = 50;

  /// 取某个月的全部记录。
  ///
  /// **为什么要翻页**：后端一次最多返回 1000 条（`MAX_LIMIT`）。
  /// 以前这里写死 `limit=1000` 就完事了，没有翻页 ——
  /// 某个月一旦超过 1000 条，会出两个问题，而且是**同一屏上互相打脸**：
  ///
  ///   - 列表只有 1000 行；而顶部卡片的"笔数"来自 `/api/stats`，
  ///     那里算的是真实的 1001。
  ///   - 按日分组的"支出 ¥X"是把列表里的金额加起来算的，
  ///     所以它显示 1000 元，卡片显示 1001 元。
  ///
  /// 用户看到两个数字对不上，还少一条记录，而且**不知道怎么才能看到那一条**。
  ///
  /// 正常情况下这个循环只跑一轮（不满一页就退出），
  /// 所以对普通月份来说，请求次数和以前一模一样，没有额外开销。
  Future<List<MoneyRecord>> fetchRecords(String month) async {
    final all = <MoneyRecord>[];
    for (int page = 0; page < _maxPages; page++) {
      final data = _asMap(await _send(
        'GET',
        '/api/records?month=$month&limit=$_pageSize&offset=${all.length}',
      ));
      final items = (data['items'] as List<dynamic>?) ?? const <dynamic>[];
      all.addAll(
        items.map((e) => MoneyRecord.fromJson(e as Map<String, dynamic>)),
      );

      // 出口一：不满一页，说明后面没有了。
      if (items.length < _pageSize) break;

      // 出口二：后端每个响应都带 total（这个月一共多少条）。
      // 拿它比对一下就知道取完没有 —— 少了这一步的话，
      // 当这个月**正好**是 1000 的整数倍时（1000 条、2000 条……），
      // 上面那个出口会放行，循环就得多跑一轮、多打一次
      // 注定返回空数组的请求，纯粹浪费一个来回。
      //
      // 这个 case 是写测试时才发现的：造了正好 1000 条数据，
      // 断言"只请求一次"，结果它请求了两次。
      final total = (data['total'] as num?)?.toInt();
      if (total != null && all.length >= total) break;
    }
    return List<MoneyRecord>.unmodifiable(all);
  }

  Future<MonthStats> fetchStats(String month) async {
    final data = _asMap(await _send('GET', '/api/stats?month=$month'));
    return MonthStats.fromJson(data);
  }

  Future<MoneyRecord> createRecord(MoneyRecord draft) async {
    final data = _asMap(await _send('POST', '/api/records', body: draft.toRequestJson()));
    return MoneyRecord.fromJson(data);
  }

  Future<MoneyRecord> updateRecord(MoneyRecord record) async {
    final data = _asMap(
      await _send('PUT', '/api/records/${record.id}', body: record.toRequestJson()),
    );
    return MoneyRecord.fromJson(data);
  }

  Future<void> deleteRecord(int id) async {
    await _send('DELETE', '/api/records/$id');
  }
}
