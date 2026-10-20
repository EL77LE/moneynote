import 'dart:async';

import 'package:flutter/material.dart';

import '../core/format.dart';
import '../pages/edit_page.dart';
import '../pages/root_page.dart';
import '../state/app_state.dart';

/// 录屏专用的一次性功能演示。
///
/// **只在 `--dart-define=DEMO_MODE=true` 时启动**（见 core/app_config.dart），
/// 正常安装包永远不会跑这段。
///
/// 为什么要它：原来 GitHub Actions 只把 App 启动起来录 30 秒，
/// 画面停在首页，HR 看不到「记账」到底能不能用。
/// 现在 CI 用演示模式构建，App 自己按下面的节奏走一遍：
///
///   0s    首页（已经加载出 60 多条演示数据）
///   2s    打开「记一笔」，金额 25.5、分类餐饮、备注午饭已经填好
///   5.5s  自动保存，回到首页，新记录出现在最上面
///   9s    切到「统计」，展示分类占比和每日趋势
///   13s   切到上个月，数据跟着变
///   16s   回到本月
///
/// 这不是"假动画"：每一步都走真实的页面跳转、真实的 POST /api/records、
/// 真实的 GET /api/stats。视频里看到的就是 App 的实际行为。
class DemoVideoTour {
  DemoVideoTour({
    required this.state,
    required this.navigatorKey,
    required this.rootKey,
  });

  final AppState state;
  final GlobalKey<NavigatorState> navigatorKey;
  final GlobalKey<RootPageState> rootKey;

  bool _cancelled = false;

  /// App 退出时调用，避免延时任务在 dispose 之后继续碰 state。
  void dispose() {
    _cancelled = true;
  }

  Future<void> start() async {
    await _waitForFirstLoad();
    if (_cancelled) return;

    // 先在首页停 2 秒，让观众看清汇总卡和明细列表。
    await _pause(const Duration(seconds: 2));
    if (_cancelled) return;

    final navigator = navigatorKey.currentState;
    if (navigator == null) return;

    // 打不开编辑页就什么也演示不了，直接结束。
    unawaited(
      navigator
          .push<void>(
            MaterialPageRoute<void>(
              builder: (_) => EditPage(
                defaultDate: defaultDateInMonth(state.month),
                demoAmount: 25.5,
                demoNote: '午饭',
                autoSave: true,
              ),
            ),
          )
          .then<void>((_) {}),
    );

    // EditPage 自己会在 3.5 秒后保存并 pop。
    // 多等 3.5 秒是留给网络请求和首页刷新。
    await _pause(const Duration(seconds: 7));
    if (_cancelled) return;

    // 万一本机后端没起来、保存失败，页面还停在编辑页。
    // 强制退回首页，至少后面的统计页还能演示。
    if (navigator.canPop()) navigator.pop();
    await _pause(const Duration(seconds: 3));
    if (_cancelled) return;

    rootKey.currentState?.showTab(1);
    await _pause(const Duration(seconds: 4));
    if (_cancelled) return;

    state.shiftMonth(-1);
    await _pause(const Duration(seconds: 3));
    if (_cancelled) return;

    state.goToCurrentMonth();
    await _pause(const Duration(seconds: 2));
  }

  /// 等首屏数据到齐。最多等 30 秒，避免后端挂了把录屏卡死。
  Future<void> _waitForFirstLoad() async {
    for (var i = 0; i < 60; i++) {
      if (_cancelled) return;
      if (!state.loading && state.stats != null) return;
      await _pause(const Duration(milliseconds: 500));
    }
  }

  Future<void> _pause(Duration duration) => Future<void>.delayed(duration);
}
