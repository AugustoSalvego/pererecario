// O que aparece em cada trabalho: cenário de cada etapa e alvos. Todos os trabalhos usam o toque
// (o motor do minijogo ainda aceita 'hold' e 'drag', caso um dia se queira variar o gesto).
// max: quantos alvos aparecem ao mesmo tempo (padrão 2).
// As posições dos alvos são em pixels do cenário (96 x 72) e batem com scripts/gerar_trabalhos.py.
export const SCENE_W = 96;
export const SCENE_H = 72;

export const JOBS = {
  casa: {
    gesture: 'tap',
    talk: 'Opa! Tô levantando uma casinha aqui e preciso de uma mão. <b>Me ajuda?</b>',
    rounds: [
      { scene: 'casa-1', target: 'vaga', hit: 'tijolo', need: 6, label: 'Assentar os tijolos', unit: 'tijolos',
        help: 'Toque nas vagas que piscam!', cheer: ['Isso!', 'Boa, firme!', 'Tá subindo a parede!'],
        slots: [[26, 38], [32, 38], [38, 38], [44, 38], [50, 38], [56, 38], [62, 38], [29, 32], [41, 32], [53, 32], [65, 32]] },
      { scene: 'casa-2', target: 'prego', hit: 'prego', need: 6, label: 'Martelar o telhado', unit: 'pregos',
        help: 'Toque nos pregos para martelar!', cheer: ['Toc toc!', 'Na mosca!', 'Esse telhado não cai!'],
        slots: [[30, 20], [38, 17], [46, 13], [54, 17], [62, 20], [26, 23], [68, 23], [42, 21], [50, 21]] },
      { scene: 'casa-3', target: 'reboco', hit: 'tinta', need: 6, label: 'Pintar a casa', unit: 'partes pintadas',
        help: 'Toque nas manchas cinzas para pintar!', cheer: ['Que cor bonita!', 'Capricho!', 'Quase lá!'],
        slots: [[28, 30], [40, 30], [52, 30], [62, 30], [30, 46], [56, 46], [64, 48], [36, 50]] },
    ],
  },
  carro: {
    gesture: 'tap',
    talk: 'Ei! Esse carro chegou todo estropiado na oficina. <b>Me dá uma força?</b>',
    rounds: [
      { scene: 'carro-1', target: 'parafuso', hit: null, need: 4, label: 'Soltar o pneu furado', unit: 'parafusos', max: 1,
        help: 'Toque nos parafusos para soltar!', cheer: ['Soltou!', 'Mais um!', 'Pneu quase fora!'],
        slots: [[60, 52], [66, 52], [63, 48], [63, 56]] },
      { scene: 'carro-2', target: 'parafuso', hit: null, need: 5, label: 'Apertar o motor', unit: 'parafusos', max: 1,
        help: 'Toque nos parafusos para apertar!', cheer: ['Bem apertado!', 'O motor agradece!', 'Vrum!'],
        slots: [[62, 30], [70, 30], [66, 34], [62, 36], [72, 36]] },
      { scene: 'carro-3', target: 'lama', hit: 'bolha', need: 6, label: 'Lavar o carro', unit: 'manchas',
        help: 'Toque no barro para esfregar!', cheer: ['Brilhando!', 'Sai, barro!', 'Tá ficando novo!'],
        slots: [[28, 36], [38, 34], [48, 40], [58, 38], [66, 42], [34, 44], [52, 46]] },
    ],
  },
  horta: {
    gesture: 'tap',
    talk: 'Bom dia! A horta tá precisando de cuidado. <b>Me ajuda?</b>',
    rounds: [
      { scene: 'horta-1', target: 'mato', hit: null, need: 7, label: 'Arrancar o mato', unit: 'matinhos',
        help: 'Toque no mato para arrancar!', cheer: ['Arrancou!', 'Xô, mato!', 'Tá limpinho!'],
        slots: [[14, 30], [32, 30], [52, 42], [70, 42], [20, 54], [44, 54], [78, 54]] },
      { scene: 'horta-2', target: 'seca', hit: 'molhada', need: 6, label: 'Regar', unit: 'canteiros',
        help: 'Toque na terra seca para regar!', cheer: ['Que água fresquinha!', 'As plantas amaram!', 'Isso!'],
        slots: [[10, 33], [34, 33], [58, 45], [82, 45], [22, 57], [70, 57]] },
      { scene: 'horta-3', target: 'tomate', hit: null, need: 7, label: 'Colher', unit: 'tomates',
        help: 'Toque nos tomates para colher!', cheer: ['Que tomatão!', 'Pro cesto!', 'Colheita boa!'],
        slots: [[8, 30], [32, 30], [56, 42], [80, 42], [20, 54], [44, 54], [68, 54]] },
    ],
  },
  entrega: {
    gesture: 'walk',
    talk: 'Opa! Tenho uma encomenda urgente. <b>Leva pra mim?</b>',
    rounds: [],
  },
};
