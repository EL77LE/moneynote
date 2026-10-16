import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// 后端地址的唯一出处。
///
/// 这里是新手最容易翻车的地方，说清楚为什么：
///
///   * Android 模拟器里的 `localhost` 指的是「模拟器自己」，不是你的电脑。
///     要访问电脑上的服务，必须用特殊地址 `10.0.2.2`。
///   * iOS 模拟器跟 macOS 共享网络栈，所以 `localhost` 就是对的。
///   * 真机（无论安卓还是 iPhone）两者都不对，必须填电脑的局域网 IP，
///     也就是后端启动时日志里打印的 `局域网真机 http://192.168.x.x:3000`。
///   * 浏览器里跑的 Web 版，`localhost` 就是你自己的电脑，所以也对。
///
/// 真机调试、连线上后端、打包 Web 版时，用 --dart-define 覆盖，不用改代码：
///
///   flutter run   --dart-define=API_BASE_URL=http://192.168.1.7:3000
///   flutter build web --dart-define=API_BASE_URL=https://moneynote-api.onrender.com
class AppConfig {
  const AppConfig._();

  /// 编译期注入的地址，优先级最高
  static const String _override = String.fromEnvironment('API_BASE_URL');

  /// 本机后端。Android 模拟器要换成 10.0.2.2，其余情况 localhost 都对。
  static const String _localAndroid = 'http://10.0.2.2:3000';
  static const String _localOther = 'http://localhost:3000';

  static String get apiBaseUrl {
    if (_override.isNotEmpty) return _override;
    if (kIsWeb) return _localOther;
    // 这里用 defaultTargetPlatform 而不是 dart:io 的 Platform.isAndroid：
    // dart:io 在 Web 上不存在，一 import 就编译不过，整个 Web 版直接没了。
    // defaultTargetPlatform 是纯 Dart 的，五个平台都能用。
    // 顺序不能反 —— 必须先判 kIsWeb，再判平台。
    if (defaultTargetPlatform == TargetPlatform.android) return _localAndroid;
    return _localOther;
  }

  /// 单个请求的超时时间。太长会让"后端挂了"表现为界面卡死。
  static const Duration requestTimeout = Duration(seconds: 8);

  /// 配置自检：把"一定会失败"的配置提前拦下来，给一句人话。
  /// 没问题时返回 null。
  ///
  /// 目前只覆盖一个场景，但它是 Web 版最常踩的坑：
  /// 浏览器有一条「混合内容」策略 —— **https 页面不许调用 http 接口**，
  /// 请求会被浏览器直接掐掉，连服务器都碰不到，报错信息也语焉不详。
  /// GitHub Pages / Netlify / Vercel 给的都是 https 域名，
  /// 所以部署 Web 版时后端**必须**也是 https。
  static String? get misconfigurationHint {
    if (!kIsWeb) return null;

    // Uri.base 在 Web 上是当前页面的地址，其它平台上是无效的 file://
    final pageScheme = Uri.base.scheme;
    if (pageScheme != 'https') return null;
    if (apiBaseUrl.startsWith('https://')) return null;

    return '这个页面是 https 的，而接口地址是 $apiBaseUrl。'
        '浏览器会拦截这种「混合内容」请求，必须把后端也部署成 https，'
        '然后用 --dart-define=API_BASE_URL=https://… 重新构建。';
  }
}
