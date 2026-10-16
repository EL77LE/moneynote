import 'package:flutter/material.dart';

/// 统一的圆角卡片。用 Card 而不是自己拼 Container，
/// 这样深色/浅色模式、阴影、圆角都跟着主题走。
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.elevation = 0,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  /// 默认 0（扁平，靠描边分隔）。
  /// 只有"主卡"（首页那张汇总卡）会用 2 来做出悬浮感。
  final double elevation;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    final content = Padding(padding: padding, child: child);

    return Card(
      elevation: elevation,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: onTap == null
          ? content
          : InkWell(onTap: onTap, child: content),
    );
  }
}
