import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/app_config.dart';
import 'data/api_client.dart';
import 'data/local_cache.dart';
import 'data/repository.dart';
import 'demo/demo_tour.dart';
import 'pages/root_page.dart';
import 'state/app_state.dart';
import 'theme.dart';
import 'widgets/app_scope.dart';

void main() {
  // 在 runApp 之前动 SharedPreferences 这类插件，必须先初始化绑定
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MoneyNoteApp());
}

class MoneyNoteApp extends StatefulWidget {
  const MoneyNoteApp({super.key});

  @override
  State<MoneyNoteApp> createState() => _MoneyNoteAppState();
}

class _MoneyNoteAppState extends State<MoneyNoteApp> {
  late final AppState _state;

  // 录屏演示需要在没有手指点击的情况下跳页面、切 Tab，
  // 所以这两个 Key 只在 DEMO_MODE 下会被用到。
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  final GlobalKey<RootPageState> _rootKey = GlobalKey<RootPageState>();
  DemoVideoTour? _demoTour;

  @override
  void initState() {
    super.initState();

    // 依赖自下而上组装：ApiClient -> Repository -> AppState
    _state = AppState(
      Repository(
        api: ApiClient(baseUrl: AppConfig.apiBaseUrl),
        cache: LocalCache(),
      ),
    );

    // 不等它返回，先让界面渲染出来。加载中的状态由 AppState 自己通知。
    _state.load();

    if (AppConfig.demoMode) {
      final tour = DemoVideoTour(
        state: _state,
        navigatorKey: _navigatorKey,
        rootKey: _rootKey,
      );
      _demoTour = tour;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        unawaited(tour.start());
      });
    }
  }

  @override
  void dispose() {
    _demoTour?.dispose();
    _state.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // AppScope 放在 MaterialApp 外面，
    // 这样每个页面都能通过 AppScope.of(context) 拿到状态。
    return AppScope(
      state: _state,
      child: MaterialApp(
        title: 'MoneyNote',
        debugShowCheckedModeBanner: false,
        navigatorKey: _navigatorKey,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        themeMode: ThemeMode.system,
        // 不加这一段，日期选择器会是英文的
        locale: const Locale('zh', 'CN'),
        supportedLocales: const <Locale>[
          Locale('zh', 'CN'),
          Locale('en', 'US'),
        ],
        localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: RootPage(key: _rootKey),
      ),
    );
  }
}
