import 'package:flutter/material.dart';

/// 骨架屏（skeleton screen）。
///
/// **为什么要它**：成熟产品在等数据时**不会**给一个空白页加转圈。
/// 转圈只说明"在忙"，而骨架屏会**先把版式画出来**——
/// 用户一眼就知道"这里将来会有一张卡片、这几行是列表"，
/// 等内容到了直接填进去，观感上是"页面逐渐浮现"，不是"页面突然出现"。
/// 这就是大型 App 和课程作业在观感上的分水岭之一。
///
/// 用法：把要占位的那块内容包在 [Skeleton] 里，里面用 [SkeletonBox] 摆版式。
///
/// ```dart
/// Skeleton(child: Column(children: [
///   SkeletonBox(width: 120, height: 28),
///   SkeletonBox(height: 14),
/// ]))
/// ```
///
/// ⚠️ **写测试的人注意**：这个呼吸动画是**无限循环**的。
/// 所以对包含骨架屏的界面，测试里**不能用 `pumpAndSettle()`**——
/// 它要等到"没有动画在跑"才返回，而这里永远等不到，会直接超时。
/// 用 `await tester.pump(const Duration(milliseconds: 100))` 推进即可。
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, required this.child});

  final Widget child;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;
  Animation<double>? _animation;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    // 尊重系统的"减弱动态效果"（无障碍设置）。
    // 开了这个开关的用户，很多是对闪烁/位移动画敏感的人，
    // 无限循环的呼吸效果对他们不友好。这时就把动画停掉，只留静态灰块。
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    if (reduceMotion) {
      _controller?.dispose();
      _controller = null;
      _animation = null;
      return;
    }

    if (_controller == null) {
      final c = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1100),
      )..repeat(reverse: true);
      _controller = c;
      // 透明度在 0.35 ~ 0.75 之间来回呼吸，不做到全透明 ——
      // 全透明会让版式一闪一闪地"消失"，看着像 bug。
      _animation = c.drive(Tween<double>(begin: 0.35, end: 0.75));
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final animation = _animation;
    if (animation == null) {
      // 不动画时给个固定值，SkeletonBox 照常画灰色的块
      return _SkeletonScope(animation: const AlwaysStoppedAnimation<double>(0.55),
          child: widget.child);
    }
    return _SkeletonScope(animation: animation, child: widget.child);
  }
}

/// 把动画往下传给所有的 [SkeletonBox]，让它们**同步**呼吸。
///
/// 不这么做的话，每个格子各起一个 AnimationController，
/// 相位各不相同，整屏灰块此起彼伏地闪 —— 比不加动画还难看。
class _SkeletonScope extends InheritedWidget {
  const _SkeletonScope({required this.animation, required super.child});

  final Animation<double> animation;

  static Animation<double>? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_SkeletonScope>()?.animation;

  @override
  bool updateShouldNotify(_SkeletonScope oldWidget) =>
      animation != oldWidget.animation;
}

/// 骨架屏里的一个灰块。[width] 不传就撑满可用宽度。
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    super.key,
    this.width,
    required this.height,
    this.borderRadius = 8,
  });

  final double? width;
  final double height;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final animation = _SkeletonScope.maybeOf(context);

    Widget box(double opacity) => Container(
          width: width,
          height: height,
          decoration: BoxDecoration(
            // 用主题自己的 surfaceContainerHighest，深色/浅色都能自动适配，
            // 比写死一个灰色稳。
            color: scheme.surfaceContainerHighest.withAlpha((opacity * 255).round()),
            borderRadius: BorderRadius.circular(borderRadius),
          ),
        );

    if (animation == null) return box(0.55);

    return AnimatedBuilder(
      animation: animation,
      builder: (BuildContext context, Widget? _) => box(animation.value),
    );
  }
}
