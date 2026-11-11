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
    this.phaseOffset = 0, this.immediateTrait = false, this.onTap});
  final ui.Image atlas;
  final Rect source;
  final FrogMotion motion;
  final bool silhouette, reducedMotion;
  final double amplitude;
  final Duration period;
  final String trait;
  final double phaseOffset;
  final bool immediateTrait;
  final VoidCallback? onTap;
  @override
  State<FrogSprite> createState() => _FrogSpriteState();
}

class _FrogSpriteState extends State<FrogSprite>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final AnimationController _controller;
  bool _playingBurst = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _controller = AnimationController(vsync: this, duration: widget.period);
    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed && _playingBurst && mounted) {
        _playingBurst = false;
        // Returning to idle lets the unique album trait repeat after a tap.
        _controller.duration = widget.period;
        _controller.repeat();
      }
    });
    _configure();
  }
  void _configure() {
    _controller.stop();
    _playingBurst = false;
    _controller.value = 0;
    if (widget.reducedMotion || widget.silhouette) return;
    if (widget.motion == FrogMotion.hop || widget.motion == FrogMotion.captured) {
      _playingBurst = true;
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
        oldWidget.period != widget.period || oldWidget.source != widget.source ||
        oldWidget.immediateTrait != widget.immediateTrait) {
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
    child: AnimatedBuilder(animation: _controller, builder: (context, child) {
      final motion = _playingBurst ? widget.motion
        : (widget.motion == FrogMotion.hop || widget.motion == FrogMotion.captured)
          ? FrogMotion.idle : widget.motion;
      return CustomPaint(painter: _FrogPainter(widget, _controller.value, motion),
        child: const SizedBox.expand());
    }),
  );
}

class _FrogPainter extends CustomPainter {
  _FrogPainter(this.sprite, this.phase, this.motion);
  final FrogSprite sprite;
  final double phase;
  final FrogMotion motion;
  @override
  void paint(Canvas canvas, Size size) {
    final angle = phase * math.pi * 2;
    final moving = !sprite.reducedMotion && !sprite.silhouette;
    final camera = motion == FrogMotion.camera;
    final hopping = motion == FrogMotion.hop || motion == FrogMotion.captured;
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
    final traitPhase = (phase + (sprite.immediateTrait ? 0 : sprite.phaseOffset)) % 1;
    // Start soon after opening: repeat after a short, visible rest.
    final u = (traitPhase - .025) / .47;
    final active = u > 0 && u < 1;
    final pulse = active ? math.pow(math.sin(u * math.pi), 2).toDouble() : 0.0;
    final twice = active ? math.pow(math.sin(u * math.pi * 2), 2).toDouble() : 0.0;
    double sx = 1, sy = 1, lift = 0, rotation = 0, hue = 0, light = 1;
    if (moving && motion == FrogMotion.idle) {
      switch (sprite.trait) {
        case 'color_shift': hue = pulse * 38; break;
        case 'jade_shift': hue = pulse * 32; break;
        case 'cheeks': sx += pulse * .045; sy += pulse * .015; break;
        case 'throat': sx += pulse * .02; sy += pulse * .03; break;
        case 'double_croak': sx += twice * .035; sy += twice * .02; break;
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
        case 'starlight':
          light += pulse * .42;
          lift = -pulse * height * .035;
          break;
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
    // Special album magic: an instant soft aura with independent star twinkles.
    // Keep effects separate from the sprite to preserve the pixel-art outlines.
    final special = moving && motion == FrogMotion.idle && sprite.trait == 'starlight';
    final glow = .52 + pulse * .48;
    if (special) {
      final center = Offset(0, -height * .52);
      final radius = math.max(width, height) * .78;
      canvas.drawCircle(center, radius, Paint()
        ..shader = ui.Gradient.radial(center, radius, [
          Color.fromRGBO(255, 245, 174, .30 + glow * .30),
          Color.fromRGBO(168, 217, 255, .13 + glow * .20),
          const Color(0x00a8d9ff),
        ], [0.0, .48, 1.0]));
    }
    // Draw one intact atlas sprite. Stretching 2px rows distorted cheek/throat pixels.
    canvas.drawImageRect(sprite.atlas, sprite.source,
      Rect.fromLTWH(-width / 2, -height, width, height), paint);
    if (special) {
      final spots = <Offset>[
        Offset(-width * .54, -height * .83),
        Offset(width * .57, -height * .79),
        Offset(-width * .61, -height * .40),
        Offset(width * .62, -height * .32),
        Offset(-width * .13, -height * 1.10),
        Offset(width * .27, -height * 1.04),
      ];
      for (var i = 0; i < spots.length; i++) {
        final shimmer = .56 + .44 * math.sin(angle + i * 1.7);
        final r = math.max(2.2, math.min(width, height) * (.018 + .014 * shimmer))
          * (i % 3 == 0 ? 1.25 : 1.0);
        final o = spots[i];
        final p = Path()
          ..moveTo(o.dx, o.dy - r * 1.75)
          ..lineTo(o.dx + r * .25, o.dy - r * .25)
          ..lineTo(o.dx + r * 1.5, o.dy)
          ..lineTo(o.dx + r * .25, o.dy + r * .25)
          ..lineTo(o.dx, o.dy + r * 1.75)
          ..lineTo(o.dx - r * .25, o.dy + r * .25)
          ..lineTo(o.dx - r * 1.5, o.dy)
          ..lineTo(o.dx - r * .25, o.dy - r * .25)
          ..close();
        final alpha = ((.38 + .62 * shimmer) * (.55 + .45 * glow))
          .clamp(0.0, 1.0).toDouble();
        canvas.drawPath(p, Paint()..color = i.isEven
          ? Color.fromRGBO(255, 245, 179, alpha)
          : Color.fromRGBO(216, 242, 255, alpha));
      }
    }
    canvas.restore();
  }
  @override
  bool shouldRepaint(covariant _FrogPainter oldDelegate) => true;
}
