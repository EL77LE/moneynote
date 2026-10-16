import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:money_note/core/net_error.dart';

/// describeNetworkError 的单元测试。
///
/// 为什么值得单独测这个函数？
///
/// 因为它是"异常分类"逻辑，靠的是**字符串特征**而不是异常类型
/// （原因见 lib/core/net_error.dart 里的说明）。
/// 字符串匹配最怕两件事：漏掉某个平台的措辞、以及误伤——
/// 而这两件事在真机上要复现一次很麻烦（要分别断开后端、改防火墙、
/// 换浏览器……）。放成单元测试，改一行就能验证五个平台。
///
/// 测试里用的是真实的 http.ClientException（两端实际抛的就是它，
/// 只是 message 文案不同），不是自己编的假类。
void main() {
  const String base = 'http://10.0.2.2:3000';

  /// 造一个跟线上同样形状的异常：ClientException 的 toString()
  /// 会把 message 和 uri 都带上，标记词得能被从里面找出来。
  http.ClientException boom(String message) =>
      http.ClientException(message, Uri.parse('$base/api/records'));

  group('认得出来的失败，都给同一句人话', () {
    test('后端没启动（手机 / 桌面）', () {
      // Linux/macOS 上是这个措辞
      final msg = describeNetworkError(boom('Connection refused'), base);
      expect(msg, contains('连不上'));
      expect(msg, contains(base));
    });

    test('后端没启动（Windows 上的另一种措辞）', () {
      final msg = describeNetworkError(boom('Connection attempt failed'), base);
      expect(msg, contains('连不上'));
    });

    test('地址填错了：DNS / 主机解析不了', () {
      final msg =
          describeNetworkError(boom('Failed host lookup: \'192.168.1.99\''), base);
      expect(msg, contains('连不上'));
    });

    test('浏览器：Chrome / Edge', () {
      final msg = describeNetworkError(boom('Failed to fetch'), base);
      expect(msg, contains('连不上'));
    });

    test('浏览器：Firefox', () {
      final msg = describeNetworkError(boom('XMLHttpRequest error.'), base);
      expect(msg, contains('连不上'));
    });

    test('浏览器：Safari', () {
      final msg = describeNetworkError(boom('Load failed'), base);
      expect(msg, contains('连不上'));
    });

    test('连上了但被防火墙静默丢包', () {
      final msg = describeNetworkError(boom('Connection timed out'), base);
      expect(msg, contains('连不上'));
    });
  });

  group('明文 HTTP 被 Android 拦下 —— 跟"连不上"不是一回事', () {
    test('给的是改配置的指引，不是"后端没启动"', () {
      final msg = describeNetworkError(
        boom('Cleartext HTTP traffic to 192.168.1.7 not permitted'),
        base,
      );
      expect(msg, contains('AndroidManifest'));
      // 不能混成通用文案，否则用户会一直去查后端，而问题在前端配置
      expect(msg, isNot(contains('后端没启动')));
    });
  });

  group('认不出来的时候', () {
    test('不吞线索：原文要带上', () {
      final msg = describeNetworkError(boom('某种没见过的新错误'), base);
      expect(msg, contains('某种没见过的新错误'));
    });

    test('不抛异常', () {
      expect(() => describeNetworkError(boom(''), base), returnsNormally);
    });
  });

  group('提示里必须带上当前用的地址', () {
    test('因为十次"连不上"里有八次是地址填错了', () {
      const other = 'https://moneynote-api.onrender.com';
      final msg = describeNetworkError(boom('Connection refused'), other);
      expect(msg, contains(other));
    });
  });
}
