// kIsWeb 在这个文件里要单独 import。
// 网上很多说法是"material.dart 已经连带导出了，不用加"——那是错的，
// 实际编译会报 `Undefined name 'kIsWeb'`。加上这一行才过。
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

/// 主题色。绿色系，符合记账 App 的调性。
const Color seedColor = Color(0xFF12B886);

/// 支出用红、收入用绿。这两个色号在两个主题下都够对比度。
const Color expenseColor = Color(0xFFE03131);
const Color incomeColor = Color(0xFF2F9E44);

/// 深色模式下红绿要调亮一点，否则在黑底上发闷。
Color expenseColorOf(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFFFF8787)
        : expenseColor;

Color incomeColorOf(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF69DB7C)
        : incomeColor;

/// Web 上要用的中文字体名，必须和 pubspec.yaml 里 `family:` 写的一致。
///
/// **为什么 Web 需要专门带一个字体，手机却不需要？**
///
/// 手机的渲染是靠操作系统的字体系统，中文字体系统里本来就有，
/// 所以 Flutter 只要说"用默认字体"，中文就出来了。
///
/// Web 不是这样。Flutter 网页版默认的 CanvasKit 引擎是**自己画字**的，
/// 它看不见、也用不了浏览器的系统字体。遇到一个它手里没有的字形，
/// 它会去 `fonts.gstatic.com` 下载对应的 Noto 字体 ——
/// 而那个域名在国内访问不了，于是整屏中文变成 □□□ 方块。
///
/// 这个坑是实测出来的，不是猜的：把 `fonts.gstatic.com` 屏蔽掉再打开
/// 网页版，界面、数字、图标全都正常，唯独每一个汉字都是方块。
///
/// 解法就是让"它手里本来就有"：把字体打进产物里，就不需要联网下载了。
/// 字体文件在 assets/fonts/，声明在 pubspec.yaml。
///
/// **为什么只在 Web 上用，不干脆全平台都用？**
/// 因为带的是单字重（Regular）。手机上用系统字体，粗体是**真粗体**；
/// 用这个只有 Regular 的字体，粗体得靠引擎"描边加粗"凑出来，反而更糊。
/// 手机系统字体本来就是中文的，没必要换。
const String webFontFamily = 'NotoSansSC';

ThemeData buildTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(
    seedColor: seedColor,
    brightness: brightness,
  );

  // 只设 colorScheme，其余交给 Material 3 的默认值。
  // 不去覆盖 CardTheme / AppBarTheme 这类对象 ——
  // 它们在 Flutter 版本之间改过类型名（XxxTheme -> XxxThemeData），
  // 覆盖它们会让代码在某个版本上直接编译不过。
  return ThemeData(
    colorScheme: scheme,
    // 只在 Web 上指定字体；手机上传 null 就是"用系统默认"。
    // （kIsWeb 是靠文件开头那行 import 来的 —— 别删，删了就编译不过。
    //  这条踩过坑，原因写在文件开头。）
    fontFamily: kIsWeb ? webFontFamily : null,
  );
}
