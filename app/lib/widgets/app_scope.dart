import 'package:flutter/widgets.dart';

import '../state/app_state.dart';

/// 把 AppState 送到整棵 widget 树里，并且状态一变就自动重建用到它的页面。
///
/// InheritedNotifier 是 Flutter 框架自带的，不需要任何第三方包。
/// main.dart 里把它套在 MaterialApp 外面。
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({
    super.key,
    required AppState state,
    required super.child,
  }) : super(notifier: state);

  static AppState of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    if (scope == null) {
      throw FlutterError(
        'AppScope.of() 找不到 AppScope。\n'
        '请确认 main.dart 里 AppScope 是包在 MaterialApp 外面的。',
      );
    }
    return scope.notifier!;
  }
}
