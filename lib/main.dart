import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'frog_sprite.dart';

const pine = Color(0xff27543d);
const paper = Color(0xfffaf7ee);
const leaf = Color(0xffe5edde);
const ink = Color(0xff203e30);
const lilac = Color(0xffe9e1f7);
const gold = Color(0xfff7e5ba);

void main() => runApp(const PererecarioVisualDemo());

/// Visual-only prototype. No camera, persistent database, GPS or online account.
class PererecarioVisualDemo extends StatelessWidget {
  const PererecarioVisualDemo({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Pererecário',
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: paper,
      colorScheme: ColorScheme.fromSeed(seedColor: pine, surface: paper),
      appBarTheme: const AppBarTheme(backgroundColor: paper, foregroundColor: ink),
      cardTheme: CardThemeData(color: const Color(0xfffffdf6), elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: Color(0xffdce5d6)))),
    ),
    home: const VisualHome(),
  );
}

class VisualHome extends StatefulWidget {
  const VisualHome({super.key});
  @override
  State<VisualHome> createState() => _VisualHomeState();
}

class _VisualHomeState extends State<VisualHome> {
  ui.Image? atlas;
  List<Map<String,dynamic>> species = [];
  final Set<String> discovered = {'frog_leaf','frog_pitanga','frog_drop','frog_moss',
    'frog_honey','frog_lagoon','frog_star'};
  final List<String> inventory = ['frog_leaf','frog_pitanga','frog_drop',
    'frog_pitanga','frog_moss','frog_honey','frog_star','frog_leaf','frog_lagoon'];
  String? error;
  int tab = 0;
  String filter = 'all';
  String query = '';
  String captureId = 'frog_guava';
  bool revealAll = false;
  bool reduced = false;
  int misses = 0;
  bool help = false;
  String captureHint = 'Aponte para a moldura e fotografe quando quiser.';
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    try {
      final bytes = await rootBundle.load('assets/frogs_atlas.png');
      final codec = await ui.instantiateImageCodec(
        bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes));
      final frame = await codec.getNextFrame(); codec.dispose();
      final data = jsonDecode(await rootBundle.loadString('assets/species.json')) as Map<String,dynamic>;
      if (!mounted) { frame.image.dispose(); return; }
      setState(() { atlas = frame.image;
        species = (data['species'] as List).cast<Map<String,dynamic>>(); });
    } catch (e) { if (mounted) setState(() => error = e.toString()); }
  }
  @override
  void dispose() { atlas?.dispose(); super.dispose(); }
  Rect _crop(Map<String,dynamic> f) {
    final r = (f['rect'] as List).cast<num>();
    return Rect.fromLTWH(r[0].toDouble(),r[1].toDouble(),r[2].toDouble(),r[3].toDouble());
  }
  String _id(Map<String,dynamic> f) => f['id'] as String;
  bool _known(Map<String,dynamic> f) => revealAll || discovered.contains(_id(f));
  int _owned(Map<String,dynamic> f) => inventory.where((id)=>id==_id(f)).length;
  Color _tierColor(String tier) => switch(tier){
    'common'=>const Color(0xffe4edd8), 'uncommon'=>const Color(0xffdcf0e9),
    'rare'=>lilac, _=>gold,
  };
  String _tierLabel(String tier) => switch(tier){
    'common'=>'Comum','uncommon'=>'Incomum','rare'=>'Rara',_=>'Especial',
  };
  Widget _rarity(Map<String,dynamic> f) {
    final tier=f['tier'] as String;
    return Container(padding:const EdgeInsets.symmetric(horizontal:10,vertical:5),
      decoration:BoxDecoration(color:_tierColor(tier),borderRadius:BorderRadius.circular(50)),
      child:Text('${tier=='special'?'✧ ':''}${_tierLabel(tier)}',
        style:const TextStyle(fontSize:11,fontWeight:FontWeight.bold,color:ink)));
  }
  Widget _frog(Map<String,dynamic> f,{bool locked=false,bool active=false,int replay=0,FrogMotion motion=FrogMotion.idle}) {
    return FrogSprite(key:ValueKey(active ? replay : 0),atlas:atlas!,source:_crop(f),silhouette:locked,
      motion:motion,trait:active?(f['albumInteraction']['type'] as String):'',
      immediateTrait:true,
      period:Duration(milliseconds:f['albumInteraction']['periodMs'] as int),
      phaseOffset:(f['albumInteraction']['phaseOffset'] as num).toDouble(),
      reducedMotion:reduced||MediaQuery.of(context).disableAnimations);
  }
  void _showFrog(Map<String,dynamic> f) {
    bool known=_known(f);
    FrogMotion motion=FrogMotion.idle;
    int replay=0;
    showModalBottomSheet<void>(context:context,isScrollControlled:true,
      backgroundColor:const Color(0xfffffdf6),showDragHandle:true,
      builder:(sheet)=>StatefulBuilder(builder:(sheet,update)=>SafeArea(
        child:SingleChildScrollView(child:Padding(padding:const EdgeInsets.fromLTRB(24,6,24,28),
          child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('ESPÉCIE ${(f['index'] as int).toString().padLeft(2,'0')} / 15',
              style:const TextStyle(letterSpacing:2,color:Color(0xff799080),fontSize:11,fontWeight:FontWeight.bold)),
            const SizedBox(height:8),Text(known?f['name'] as String:'???',
              style:const TextStyle(fontFamily:'serif',fontSize:34,color:ink,fontWeight:FontWeight.bold)),
            const SizedBox(height:8),if(known)_rarity(f),
            const SizedBox(height:12),Container(height:255,decoration:BoxDecoration(
              color:f['tier']=='special'&&known?const Color(0xff28365c):leaf,
              borderRadius:BorderRadius.circular(23)),
              child:_frog(f,locked:!known,active:known,motion:motion,replay:replay)),
            const SizedBox(height:17),Text(known?f['description'] as String:
              'Esta espécie ainda espera para ser encontrada.',
              style:const TextStyle(fontSize:14,color:ink)),
            const SizedBox(height:13),if(known)Container(width:double.infinity,
              padding:const EdgeInsets.all(14),decoration:BoxDecoration(
                color:const Color(0xfff0eee1),borderRadius:BorderRadius.circular(14)),
              child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Text('✧ ${f['albumInteraction']['name']}',style:const TextStyle(fontWeight:FontWeight.bold)),
                const SizedBox(height:4),Text(f['albumInteraction']['description'] as String),
                Text('${_owned(f)} exemplares no Meu Brejo',style:const TextStyle(fontSize:12,color:Color(0xff748477))),
              ])),
            const SizedBox(height:18),Wrap(spacing:10,runSpacing:9,children:[
              if(known)FilledButton.icon(onPressed:()=>update(() {motion=FrogMotion.hop;replay++;}),
                icon:const Icon(Icons.emoji_nature),label:const Text('Dar um pulinho')),
              OutlinedButton.icon(onPressed:(){Navigator.pop(sheet);setState(() {captureId=_id(f);tab=1;misses=0;help=false;captureHint='Pronta para fotografar!';});},
                icon:const Icon(Icons.photo_camera_outlined),label:Text(known?'Encontrar outra':'Simular encontro')),
            ]),
          ]))))) );
  }
  Widget _hero() => Container(width:double.infinity,padding:const EdgeInsets.all(25),
    decoration:BoxDecoration(color:pine,borderRadius:BorderRadius.circular(27)),
    child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Text('✧ BEM-VINDO AO SEU ÁLBUM',style:TextStyle(color:Color(0xffd2e6bd),fontSize:11,letterSpacing:2,fontWeight:FontWeight.bold)),
      const SizedBox(height:10),const Text('Pequenas criaturas.\nGrandes descobertas.',
        style:TextStyle(fontFamily:'serif',fontSize:30,height:1.16,color:Colors.white,fontWeight:FontWeight.bold)),
      const SizedBox(height:13),const Text('Um cantinho para conhecer cada habitante desse brejo encantado.',
        style:TextStyle(color:Color(0xffd2e6cb))),
      const SizedBox(height:16),FilledButton.tonalIcon(onPressed:()=>setState(()=>tab=1),
        icon:const Icon(Icons.photo_camera_outlined),label:const Text('Explorar o brejo')),
    ]));
  Widget _stat(String icon,String value,String title) => Expanded(child:Card(
    child:Padding(padding:const EdgeInsets.all(13),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text(icon,style:const TextStyle(fontSize:20)),const SizedBox(height:5),Text(value,
        style:const TextStyle(fontFamily:'serif',fontWeight:FontWeight.bold,fontSize:24,color:ink)),
      Text(title,style:const TextStyle(fontSize:11,color:Color(0xff748477))),
    ]))));
  Widget _albumTab(){
    final matched=species.where((f)=>(filter=='all'||f['tier']==filter)&&
      (f['name'] as String).toLowerCase().contains(query.toLowerCase())).toList();
    return ListView(padding:const EdgeInsets.all(16),children:[
      _hero(),const SizedBox(height:16),Row(children:[
        _stat('🐸','${discovered.length}/15','Espécies'),
        _stat('🌱','${inventory.length}','Exemplares'),
        _stat('✧','${(discovered.length*100/15).round()}%','Completo'),
      ]),const SizedBox(height:25),const Text('O Pererecário',style:TextStyle(fontFamily:'serif',fontSize:28,color:ink,fontWeight:FontWeight.bold)),
      const Text('Toque em uma espécie para conhecer seu jeitinho.',style:TextStyle(color:Color(0xff748477))),
      const SizedBox(height:13),ClipRRect(borderRadius:BorderRadius.circular(20),child:LinearProgressIndicator(
        value:discovered.length/15,minHeight:8,backgroundColor:leaf,color:const Color(0xff8eae7c))),
      const SizedBox(height:16),TextField(onChanged:(v)=>setState(()=>query=v),
        decoration:InputDecoration(prefixIcon:const Icon(Icons.search),hintText:'Buscar perereca...',
          filled:true,fillColor:Colors.white,border:OutlineInputBorder(borderRadius:BorderRadius.circular(14)))),
      const SizedBox(height:10),SingleChildScrollView(scrollDirection:Axis.horizontal,
        child:Row(children:['all','common','uncommon','rare','special'].map((t)=>Padding(
          padding:const EdgeInsets.only(right:7),child:ChoiceChip(label:Text(t=='all'?'Todas':_tierLabel(t)),
            selected:filter==t,onSelected:(_)=>setState(()=>filter=t)))).toList())),
      const SizedBox(height:14),LayoutBuilder(builder:(context,constraints){
        final cols=constraints.maxWidth>=850?4:constraints.maxWidth>=480?3:2;
        return GridView.builder(shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),
          itemCount:matched.length,gridDelegate:SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount:cols,crossAxisSpacing:9,mainAxisSpacing:9,childAspectRatio:.76),
          itemBuilder:(context,index){final f=matched[index];final locked=!_known(f);
            return Card(clipBehavior:Clip.antiAlias,child:InkWell(onTap:()=>_showFrog(f),
              child:Padding(padding:const EdgeInsets.all(8),child:Column(children:[
                Expanded(child:Container(decoration:BoxDecoration(
                  color:f['tier']=='special'&&!locked?const Color(0xff343d71):locked?const Color(0xffdce3df):leaf,
                  borderRadius:BorderRadius.circular(14)),child:_frog(f,locked:locked))),
                const SizedBox(height:7),Align(alignment:Alignment.centerLeft,
                  child:Text(locked?'???':f['name'] as String,style:const TextStyle(fontWeight:FontWeight.bold,color:ink))),
                Align(alignment:Alignment.centerLeft,child:Text('Nº ${(f['index'] as int).toString().padLeft(2,'0')} · ${locked?'A descobrir':_tierLabel(f['tier'] as String)}',
                  style:const TextStyle(color:Color(0xff748477),fontSize:11))),
              ]))));});}),
      const SizedBox(height:14),const Text('Demonstração visual: algumas espécies começam ocultas. As capturas não são salvas.',
        style:TextStyle(color:Color(0xff748477),fontSize:12)),
    ]);
  }
  Widget _captureTab(){
    final f=species.firstWhere((s)=>_id(s)==captureId,orElse:()=>species.first);
    return ListView(padding:const EdgeInsets.all(16),children:[
      const Text('Hora de explorar!',style:TextStyle(fontFamily:'serif',fontSize:30,color:ink,fontWeight:FontWeight.bold)),
      const Text('Câmera ilustrativa — não utiliza o dispositivo.',style:TextStyle(color:Color(0xff748477))),
      const SizedBox(height:16),Container(height:365,clipBehavior:Clip.antiAlias,
        decoration:BoxDecoration(borderRadius:BorderRadius.circular(24),
          gradient:const LinearGradient(begin:Alignment.topCenter,end:Alignment.bottomCenter,
            colors:[Color(0xff94c3cd),Color(0xffc4dbb9),Color(0xff56885a)])),
        child:Stack(children:[
          Positioned.fill(child:_frog(f)),
          Positioned.fill(child:Center(child:Container(width:195,height:205,
            decoration:BoxDecoration(border:Border.all(color:Colors.white70,width:2),
              borderRadius:BorderRadius.circular(23))))),
          const Positioned(top:18,left:15,child:Text('● ENCONTRO DE DEMONSTRAÇÃO',
            style:TextStyle(color:ink,fontSize:11,fontWeight:FontWeight.bold))),
          Positioned(bottom:15,left:0,right:0,child:Center(child:IconButton.filledTonal(
            onPressed:()=>_capture(f),iconSize:38,tooltip:'Fotografar',
            icon:const Icon(Icons.camera_alt),style:IconButton.styleFrom(
              backgroundColor:const Color(0xfffff7dc),fixedSize:const Size(75,75))))),
        ])),
      const SizedBox(height:16),Card(child:Padding(padding:const EdgeInsets.all(18),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('ENCONTRO ATUAL',style:TextStyle(fontSize:11,letterSpacing:2,color:Color(0xff748477))),
          const SizedBox(height:8),Text(f['name'] as String,style:const TextStyle(fontFamily:'serif',fontSize:24)),
          const SizedBox(height:9),_rarity(f),const SizedBox(height:12),DropdownButtonFormField<String>(
            value:captureId,decoration:const InputDecoration(labelText:'Espécie para testar',border:OutlineInputBorder()),
            items:species.map((s)=>DropdownMenuItem(value:_id(s),child:Text(s['name'] as String))).toList(),
            onChanged:(v){if(v!=null)setState(() {captureId=v;misses=0;help=false;captureHint='Pronta para fotografar!';});}),
          const SizedBox(height:12),Container(width:double.infinity,
            padding:const EdgeInsets.all(12),decoration:BoxDecoration(
              color:help?const Color(0xffe2efdb):const Color(0xfff5f1df),
              borderRadius:BorderRadius.circular(12)),
            child:Text(captureHint,style:const TextStyle(fontSize:13,color:ink))),
          const SizedBox(height:10),OutlinedButton.icon(
            onPressed:()=>setState(() {misses++;help=misses>=2;
              captureHint=help?'🌿 Ajuda ativada! A perereca fica no centro.':'Quase! Tente fotografar de novo.';}),
            icon:const Icon(Icons.center_focus_weak),
            label:const Text('Simular foto fora da moldura')),
          const SizedBox(height:7),const Text('Tentativas ilimitadas e assistência após dois erros.',
            style:TextStyle(fontSize:12,color:Color(0xff748477))),
        ]))),
    ]);
  }
  void _capture(Map<String,dynamic> f){
    // Visual prototype: a successful, non-persistent example capture.
    final repeat=discovered.contains(_id(f));
    setState(() {discovered.add(_id(f));inventory.add(_id(f));misses=0;help=false;captureHint='Aponte para a moldura e fotografe quando quiser.';});
    showDialog<void>(context:context,builder:(context)=>AlertDialog(
      title:Text(repeat?'Mais um ${f['name']}!':'Você encontrou ${f['name']}!'),
      content:Column(mainAxisSize:MainAxisSize.min,children:[
        SizedBox(height:160,child:_frog(f)),
        const SizedBox(height:12),Text(repeat?'Um novo exemplar entrou no Meu Brejo.':
          'Uma nova espécie foi revelada no seu álbum.'),
        const SizedBox(height:12),const Text('Captura simulada · progresso temporário',
          style:TextStyle(fontSize:12,color:Color(0xff748477))),
      ]),actions:[
        TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Explorar mais')),
        FilledButton(onPressed:(){Navigator.pop(context);setState(()=>tab=0);_showFrog(f);},
          child:const Text('Ver no álbum')),
      ]));
  }
  Widget _inventoryTab(){
    return ListView(padding:const EdgeInsets.all(16),children:[
      const Text('Meu Brejo',style:TextStyle(fontFamily:'serif',fontSize:30,color:ink,fontWeight:FontWeight.bold)),
      const Text('Seus exemplares ficam tranquilos aqui; peculiaridades ficam no álbum principal.',
        style:TextStyle(color:Color(0xff748477))),const SizedBox(height:16),
      ...inventory.asMap().entries.map((entry){
        final f=species.firstWhere((s)=>_id(s)==entry.value);
        return Card(child:Padding(padding:const EdgeInsets.all(10),child:Row(children:[
          Container(width:94,height:92,decoration:BoxDecoration(color:leaf,borderRadius:BorderRadius.circular(13)),
            child:_frog(f)),const SizedBox(width:16),Expanded(child:Column(
              crossAxisAlignment:CrossAxisAlignment.start,children:[
                Text(f['name'] as String,style:const TextStyle(fontWeight:FontWeight.bold,fontSize:16)),
                Text('Exemplar #${(entry.key+1).toString().padLeft(4,'0')}',
                  style:const TextStyle(color:Color(0xff748477),fontSize:12)),
                Text('≈ ${((f['sizeCm'][0] as num).toDouble() +
                    ((f['sizeCm'][1] as num).toDouble()-(f['sizeCm'][0] as num).toDouble())*
                    ((entry.key%4)+2)/7).toStringAsFixed(1)} cm',
                  style:const TextStyle(fontSize:11,color:Color(0xff748477))),
                const SizedBox(height:7),_rarity(f),
              ])),
        ])));
      }),
    ]);
  }
  Widget _guideTab(){return ListView(padding:const EdgeInsets.all(16),children:[
    const Text('Guia de campo',style:TextStyle(fontFamily:'serif',fontSize:30,color:ink,fontWeight:FontWeight.bold)),
    const Text('Conheça as regras e personalize esta prévia visual.',style:TextStyle(color:Color(0xff748477))),
    const SizedBox(height:16),Card(child:Padding(padding:const EdgeInsets.all(18),child:Column(
      crossAxisAlignment:CrossAxisAlignment.start,children:[
        const Text('As raridades',style:TextStyle(fontSize:21,fontFamily:'serif',fontWeight:FontWeight.bold)),
        const SizedBox(height:10),Wrap(spacing:9,runSpacing:9,children:
          ['common','uncommon','rare','special'].map((t)=>_rarity({'tier':t})).toList()),
        const SizedBox(height:14),const Text('Pesos planejados por encontro: 60% comuns, 28% incomuns, 10% raras e 2% especiais. O sorteio ainda não está ativo.'),
      ]))),const SizedBox(height:12),Card(child:Column(children:[
        SwitchListTile(title:const Text('Revelar todas as espécies'),
          subtitle:const Text('Para revisar as artes ainda ocultas'),value:revealAll,
          onChanged:(v)=>setState(()=>revealAll=v)),
        SwitchListTile(title:const Text('Reduzir animações'),
          subtitle:const Text('Evita movimentação desnecessária'),value:reduced,
          onChanged:(v)=>setState(()=>reduced=v)),
      ])),const SizedBox(height:12),const Card(child:Padding(padding:EdgeInsets.all(18),
        child:Text('Prévia visual: a câmera, o GPS, o banco de dados, o login, as trocas e a sincronização online ainda não foram implementados.'))),
  ]);}
  @override
  Widget build(BuildContext context){
    final ready=atlas!=null&&species.isNotEmpty;
    return Scaffold(
      appBar:AppBar(title:const Row(children:[Text('🐸 '),Text('Pererecário',
        style:TextStyle(fontFamily:'serif',fontWeight:FontWeight.bold))]),
        actions:[const Padding(padding:EdgeInsets.only(right:16),child:Center(child:Text('PRÉVIA V0.4',
          style:TextStyle(fontSize:11,fontWeight:FontWeight.bold,color:Color(0xff78906b)))))]),
      body:!ready?Center(child:error!=null?Text(error!):const CircularProgressIndicator()):
        IndexedStack(index:tab,children:[_albumTab(),_captureTab(),_inventoryTab(),_guideTab()]),
      bottomNavigationBar:NavigationBar(selectedIndex:tab,onDestinationSelected:(index)=>setState(()=>tab=index),
        destinations:const [NavigationDestination(icon:Icon(Icons.auto_stories_outlined),label:'Álbum'),
          NavigationDestination(icon:Icon(Icons.photo_camera_outlined),label:'Explorar'),
          NavigationDestination(icon:Icon(Icons.spa_outlined),label:'Meu Brejo'),
          NavigationDestination(icon:Icon(Icons.menu_book_outlined),label:'Guia')]),
    );
  }
}
