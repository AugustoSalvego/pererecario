// O que aparece em cada trabalho: cenário de cada etapa, marcador do que falta e o efeito do toque.
// As posições e os pedaços de cada etapa vêm de jobcells.js (gerado por scripts/gerar_trabalhos.py).
// kind: 'reveal' = cada toque revela um pedaço da imagem `to`; 'items' = cada toque tira um objeto da cena.
// marker: sprite job-alvo-<marker>.png em cada ponto que falta (null = só um círculo em volta da mancha).
// fx (items): fly = sai voando, screw = aperta e some, pluck = arrancado para cima, basket = voa para o cesto.
// fade: camada por cima que vai sumindo a cada toque (a fumaça do motor).
export const SCENE_W = 96;
export const SCENE_H = 72;

export const JOBS = {
  casa: {
    talk: 'Opa! Tô levantando uma casinha aqui e preciso de uma mão. <b>Me ajuda?</b>',
    rounds: [
      { scene: 'casa-1', kind: 'reveal', to: 'casa-2', marker: 'vaga', label: 'Assentar os tijolos', unit: 'tijolos',
        help: 'Toque nas vagas para assentar os tijolos!', cheer: ['Isso!', 'Boa, firme!', 'Tá subindo a parede!'] },
      { scene: 'casa-2', kind: 'reveal', to: 'casa-3', marker: 'prego', label: 'Martelar o telhado', unit: 'pregos',
        help: 'Toque nos pregos para martelar o telhado!', cheer: ['Toc toc!', 'Na mosca!', 'Esse telhado não cai!'] },
      { scene: 'casa-3', kind: 'reveal', to: 'casa-4', marker: 'tinta', label: 'Pintar a casa', unit: 'partes pintadas',
        help: 'Toque na tinta para pintar a parede!', cheer: ['Que cor bonita!', 'Capricho!', 'Quase lá!'] },
    ],
  },
  carro: {
    talk: 'Ei! Esse carro chegou todo estropiado na oficina. <b>Me dá uma força?</b>',
    rounds: [
      { scene: 'carro-1', kind: 'items', marker: 'porca', fx: 'fly', label: 'Soltar a roda furada', unit: 'porcas',
        help: 'Toque nas porcas para soltar a roda!', cheer: ['Soltou!', 'Mais uma!', 'A roda já vai sair!'] },
      { scene: 'carro-2', kind: 'items', marker: 'parafuso', fx: 'screw', fade: 'carro-2-fumaca', label: 'Apertar o motor', unit: 'parafusos',
        help: 'Toque nos parafusos soltos para apertar!', cheer: ['Bem apertado!', 'A fumaça tá sumindo!', 'Vrum!'] },
      { scene: 'carro-3', kind: 'reveal', to: 'carro-4', marker: null, fx: 'bolha', label: 'Lavar o carro', unit: 'manchas',
        help: 'Toque no barro para esfregar!', cheer: ['Brilhando!', 'Sai, barro!', 'Tá ficando novo!'] },
    ],
  },
  horta: {
    talk: 'Bom dia! A horta tá precisando de cuidado. <b>Me ajuda?</b>',
    rounds: [
      { scene: 'horta-1', kind: 'items', marker: 'mato', fx: 'pluck', label: 'Arrancar o mato', unit: 'matinhos',
        help: 'Toque no mato para arrancar!', cheer: ['Arrancou!', 'Xô, mato!', 'Tá limpinho!'] },
      { scene: 'horta-2', kind: 'reveal', to: 'horta-3', marker: 'gota', label: 'Regar', unit: 'trechos regados',
        help: 'Toque nas gotas para regar a terra!', cheer: ['Que água fresquinha!', 'As plantas amaram!', 'Isso!'] },
      { scene: 'horta-3', kind: 'items', marker: 'tomate', fx: 'basket', label: 'Colher', unit: 'tomates',
        help: 'Toque nos tomates para colher!', cheer: ['Que tomatão!', 'Pro cesto!', 'Colheita boa!'] },
    ],
  },
  entrega: {
    talk: 'Opa! Tenho uma encomenda urgente. <b>Leva pra mim?</b>',
    rounds: [],
  },
};
