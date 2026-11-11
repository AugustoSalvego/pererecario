import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'frog_sprite.dart';

void main() => runApp(const VisualDemo());
class VisualDemo extends StatelessWidget {
  const VisualDemo({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Pererecário • visual', debugShowCheckedModeBanner: false,
    theme: ThemeData(useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff315c44)),
      scaffoldBackgroundColor: const Color(0xfff6f3e8)),
    home: const CatalogScreen());
}
class CatalogScreen extends StatefulWidget {
  const CatalogScreen({super.key});
  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}
class _CatalogScreenState extends State<CatalogScreen> {
  ui.Image? atlas;
  List<Map<String, dynamic>> species = [];
  String? error;
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async {
    try {
      final bytes = await rootBundle.load('assets/frogs_atlas.png');
      final codec = await ui.instantiateImageCodec(bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes));
      final frame = await codec.getNextFrame();
      codec.dispose();
      final data = jsonDecode(await rootBundle.loadString('assets/species.json')) as Map<String, dynamic>;
      if (!mounted) { frame.image.dispose(); return; }
      setState(() { atlas = frame.image;
        species = (data['species'] as List).cast<Map<String, dynamic>>(); });
    } catch (e) { if (mounted) setState(() => error = e.toString()); }
  }
  Rect rect(Map<String,dynamic> frog) {
    final r = (frog['rect'] as List).cast<num>();
    return Rect.fromLTWH(r[0].toDouble(), r[1].toDouble(), r[2].toDouble(), r[3].toDouble());
  }
  @override
  void dispose() { atlas?.dispose(); super.dispose(); }
  void showFrog(Map<String, dynamic> frog) {
    bool silhouette = false;
    FrogMotion motion = FrogMotion.idle;
    int replay = 0;
    showModalBottomSheet<void>(context: context, isScrollControlled: true,
      builder: (context) => StatefulBuilder(builder: (context, update) => SafeArea(
        child: SingleChildScrollView(child: Padding(padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(silhouette ? '???' : frog['name'] as String,
              style: Theme.of(context).textTheme.headlineMedium),
            SizedBox(height: 260, child: FrogSprite(key: ValueKey(replay), atlas: atlas!,
              source: rect(frog), motion: motion, silhouette: silhouette,
              trait: frog['albumInteraction']['type'] as String,
              phaseOffset: (frog['albumInteraction']['phaseOffset'] as num).toDouble(),
              period: Duration(milliseconds: frog['albumInteraction']['periodMs'] as int),
              reducedMotion: MediaQuery.of(context).disableAnimations,
              onTap: () => update(() { motion = FrogMotion.hop; replay++; }))),
            Text(silhouette ? 'Uma espécie esperando para ser descoberta.' : frog['description'] as String),
            const SizedBox(height: 8),
            if (!silhouette) Text(frog['albumInteraction']['description'] as String),
            const SizedBox(height: 16),
            Wrap(spacing: 8, runSpacing: 8, children: [
              FilledButton(onPressed: () => update(() { motion = FrogMotion.hop; replay++; }), child: const Text('Pular')),
              OutlinedButton(onPressed: () => update(() { motion = FrogMotion.camera; replay++; }), child: const Text('Movimento na câmera')),
              OutlinedButton(onPressed: () => update(() { motion = FrogMotion.captured; replay++; }), child: const Text('Comemorar')),
              OutlinedButton(onPressed: () => update(() => silhouette = !silhouette), child: const Text('Silhueta')),
            ]),
            const SizedBox(height: 16),
            const Text('Demonstração visual: câmera, GPS e progresso não conectados.'),
          ]))))));
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Pererecário • coleção visual')),
    body: SafeArea(child: error != null ? Center(child: Text(error!)) : atlas == null
      ? const Center(child: CircularProgressIndicator())
      : Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 1100),
        child: GridView.builder(padding: const EdgeInsets.all(16),
          gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
            maxCrossAxisExtent: 240, mainAxisExtent: 250, crossAxisSpacing: 12, mainAxisSpacing: 12),
          itemCount: species.length, itemBuilder: (context, index) {
            final frog = species[index];
            return Card(child: InkWell(onTap: () => showFrog(frog), child: Padding(
              padding: const EdgeInsets.all(12), child: Column(children: [
                Expanded(child: FrogSprite(atlas: atlas!, source: rect(frog),
                  trait: frog['albumInteraction']['type'] as String,
                  phaseOffset: (frog['albumInteraction']['phaseOffset'] as num).toDouble(),
                  period: Duration(milliseconds: frog['albumInteraction']['periodMs'] as int),
                  reducedMotion: MediaQuery.of(context).disableAnimations)),
                Text(frog['name'] as String, style: Theme.of(context).textTheme.titleMedium),
                const Text('Toque para conhecer'),
              ]))));
          })))));
}
