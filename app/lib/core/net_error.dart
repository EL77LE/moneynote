/// 网络层原始异常 → 给用户看的一句话。
///
/// 为什么要有这个文件？
///
/// 最直觉的写法是 `on SocketException catch (e)`，但那**在 Web 上编译不过**——
/// `dart:io` 这个库在浏览器里根本不存在，一 import 整个 Web 版就没了。
///
/// 而且各平台抛出来的东西本来就不一样：
///
///   * 手机 / 桌面：底层是 `SocketException`，经 `package:http` 包装后
///     变成 `ClientException` 抛出来
///   * 浏览器：压根没有 `SocketException` 这个类，
///     抛的是 `ClientException("Failed to fetch")`
///
/// 所以按**异常类型**分支在五个平台上凑不齐，
/// 只能按**文案特征**归类。这个做法看着土，但它是唯一到处都成立的做法。
///
/// 放在 lib/core/ 而不是 lib/data/：它不 import 任何东西，
/// 纯 Dart，单元测试里直接调，不需要起 Flutter 环境。
library;

/// 这些文案都意味着同一件事：包没能送到服务器手上。
/// 具体措辞随操作系统和浏览器变，所以列了一串。
const List<String> _unreachableMarkers = <String>[
  // —— 手机 / 桌面 ——
  'connection refused', // 后端没启动（最常见）
  'connection attempt failed', // Windows 上"连接被拒"的另一种措辞
  'failed host lookup', // 域名或 IP 解析不了：地址填错了
  'network is unreachable',
  'no route to host',
  'connection reset',
  'connection closed',
  'software caused connection abort',
  'timed out', // 连上了但没响应，比如被防火墙静默丢包

  // —— 浏览器 ——
  'failed to fetch', // Chrome / Edge：一句话打发你
  'xmlhttprequest error', // Firefox
  'load failed', // Safari
];

/// 把任意网络异常翻译成用户能看懂、且能据此行动的一句话。
///
/// [baseUrl] 会写进提示里 —— 十次"连不上"里有八次是地址填错了，
/// 让用户直接看见当前用的是什么地址，比让他去翻代码快得多。
String describeNetworkError(Object error, String baseUrl) {
  final raw = error.toString();
  final lower = raw.toLowerCase();

  // Android 9（API 28）起默认禁止明文 HTTP。这个跟"后端没开"是两码事，
  // 修法也完全不同，所以单独给一句，别混进下面那一堆。
  if (lower.contains('cleartext')) {
    return 'Android 拦下了明文 HTTP 请求。'
        '检查 app/android/app/src/main/AndroidManifest.xml 里 '
        'android:usesCleartextTraffic="true" 加了没有（见 docs/03 第 4.1 节）。';
  }

  for (final marker in _unreachableMarkers) {
    if (lower.contains(marker)) {
      return '连不上 $baseUrl，后端没启动或地址填错了';
    }
  }

  // 认不出来就把原文带上。宁可不好看，也别把线索吞掉。
  return '网络请求失败：$raw';
}
