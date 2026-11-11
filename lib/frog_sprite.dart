import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';

enum FrogMotion { idle, hop, camera, captured }

/// One approved atlas pose animated without generating alternate artwork.
/// Supply a shared decoded atlas; its owner must dispose it after all widgets.
class FrogSprite extends StatefulWidget {
  const FrogSprite({super.key, required this.atlas, required this.source,
    this.motion = FrogMotion.idle, this.silhouette = false,
    this.reducedMotion = false, this.amplitude = 0.08,
    this.period = const Duration(milliseconds: 3800), this.trait = '',
    this.phaseOffset = 0, this.onTap});
  final ui.Image atlas;
  final Rect source;
  final FrogMotion motion;
  final bool silhouette, reducedMotion;
  final double amplitude;
  final Duration period;
  final String trait;
  final double phaseOffset;
  final VoidCallback? onTap;
  @override
  State<FrogSprite> createState() => _FrogSpriteState();
}

class _FrogSpriteState extends State<FrogSprite>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final AnimationController _controller;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _controller = AnimationController(vsync: this, duration: widget.period);
    _configure();
  }
  void _configure() {
    _controller.stop();
    _controller.value = 0;
    if (widget.reducedMotion || widget.silhouette) return;
    if (widget.motion == FrogMotion.hop || widget.motion == FrogMotion.captured) {
      _controller.duration = const Duration(milliseconds: 600);
      _controller.forward();
    } else {
      _controller.duration = widget.period;
      _controller.repeat();
    }
  }
  @override
  void didUpdateWidget(covariant FrogSprite oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.motion != widget.motion ||
        oldWidget.reducedMotion != widget.reducedMotion ||
        oldWidget.silhouette != widget.silhouette || oldWidget.trait != widget.trait ||
        oldWidget.period != widget.period || oldWidget.source != widget.source) {
      _configure();
    }
  }
  @override
  void dispose() { WidgetsBinding.instance.removeObserver(this); _controller.dispose(); super.dispose(); }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) { _configure(); } else { _controller.stop(); }
  }
  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: widget.onTap,
    child: AnimatedBuilder(animation: _controller, builder: (context, child) =>
      CustomPaint(painter: _FrogPainter(widget, _controller.value),
        child: const SizedBox.expand())),
  );
}

class _FrogPainter extends CustomPainter {
  _FrogPainter(this.sprite, this.phase);
  final FrogSprite sprite;
  final double phase;
  @override
  void paint(Canvas canvas, Size size) {
    final angle = phase * math.pi * 2;
    final moving = !sprite.reducedMotion && !sprite.silhouette;
    final camera = sprite.motion == FrogMotion.camera;
    final hopping = sprite.motion == FrogMotion.hop ||
      sprite.motion == FrogMotion.captured;
    final dx = moving && camera ? math.sin(angle) * sprite.amplitude * size.width : 0.0;
    final dy = !moving ? 0.0 : hopping ? -math.sin(phase * math.pi) * size.height * .12
      : camera ? -math.max(0.0, math.sin(angle * 2)) * size.height * .05 : 0.0;
    final breathe = moving && !hopping ? 1 + math.sin(angle) * .012 : 1.0;
    final scale = math.min(size.width * .65 / sprite.source.width,
      size.height * .65 / sprite.source.height);
    final width = sprite.source.width * scale;
    final height = sprite.source.height * scale * breathe;
    final base = size.height * .83;
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    canvas.drawOval(Rect.fromCenter(center: Offset(size.width / 2 + dx, base + 5),
      width: width * .55, height: 12), Paint()..color = const Color(0x22233f28));
    final paint = Paint()..filterQuality = FilterQuality.none;
    if (sprite.silhouette) {
      paint.colorFilter = const ColorFilter.mode(Color(0xff5f6470), BlendMode.srcIn);
    }
    final traitPhase = (phase + sprite.phaseOffset) % 1;
    final u = traitPhase / .28;
    final active = u < 1;
    final pulse = active ? math.pow(math.sin(u * math.pi), 2).toDouble() : 0.0;
    final twice = active ? math.pow(math.sin(u * math.pi * 2), 2).toDouble() : 0.0;
    double sx = 1, sy = 1, lift = 0, rotation = 0, hue = 0, light = 1, puff = 0, zone = .5;
    if (moving && sprite.motion == FrogMotion.idle) {
      switch (sprite.trait) {
        case 'color_shift': hue = pulse * 38; break;
        case 'jade_shift': hue = pulse * 32; break;
        case 'cheeks': puff = pulse * .17; zone = .40; break;
        case 'throat': puff = pulse * .20; zone = .58; break;
        case 'double_croak': puff = twice * .18; zone = .56; break;
        case 'puff': sx += pulse * .10; sy += pulse * .045; break;
        case 'double_hop': lift = -twice * height * .09; break;
        case 'crouch_hop':
          if (active) {
            if (u < .3) { sy -= math.sin(u / .3 * math.pi) * .10; sx += math.sin(u / .3 * math.pi) * .05; }
            else { lift = -math.sin((u - .3) / .7 * math.pi) * height * .12; }
          }
          break;
        case 'breath': sx += pulse * .035; sy += pulse * .05; break;
        case 'warm_glow': hue = -pulse * 9; light += pulse * .08; break;
        case 'starlight': light += pulse * .17; break;
        case 'look_around': rotation = active ? math.sin(u * math.pi * 2) * .075 * pulse : 0; break;
        case 'shy': sy -= pulse * .09; sx -= pulse * .025; break;
        case 'stretch': sy += pulse * .10; sx -= pulse * .04; break;
        case 'sway': rotation = active ? math.sin(u * math.pi * 2) * .055 * pulse : 0; break;
      }
    }
    if (!sprite.silhouette && (hue != 0 || light != 1)) {
      final c = math.cos(hue * math.pi / 180), s = math.sin(hue * math.pi / 180);
      paint.colorFilter = ColorFilter.matrix([
        (.213+.787*c-.213*s)*light, (.715-.715*c-.715*s)*light, (.072-.072*c+.928*s)*light, 0, 0,
        (.213-.213*c+.143*s)*light, (.715+.285*c+.140*s)*light, (.072-.072*c-.283*s)*light, 0, 0,
        (.213-.213*c-.787*s)*light, (.715-.715*c+.715*s)*light, (.072+.928*c+.072*s)*light, 0, 0,
        0, 0, 0, 1, 0,
      ]);
    }
    canvas.translate(size.width / 2 + dx, base + dy + lift);
    canvas.rotate(rotation);
    canvas.scale(sx, sy);
    if (puff > 0) {
      for (double row = 0; row < sprite.source.height; row += 2) {
        final slice = math.min(2.0, sprite.source.height - row);
        final expand = 1 + puff * math.exp(-math.pow((row / sprite.source.height - zone) / .115, 2));
        canvas.drawImageRect(sprite.atlas,
          Rect.fromLTWH(sprite.source.left, sprite.source.top + row, sprite.source.width, slice),
          Rect.fromLTWH(-width * expand / 2, -height + row / sprite.source.height * height,
            width * expand, slice / sprite.source.height * height), paint);
      }
    } else {
      canvas.drawImageRect(sprite.atlas, sprite.source,
        Rect.fromLTWH(-width / 2, -height, width, height), paint);
    }
    canvas.restore();
  }
  @override
  bool shouldRepaint(covariant _FrogPainter oldDelegate) => true;
}
