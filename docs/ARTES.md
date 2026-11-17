# Artes do jogo: o que trocar e em que formato

Todas as artes ficam em **`client/assets/sprites/`**. As atuais são provisórias, geradas por `scripts/gerar_sprites.py`. Para trocar, salve o seu PNG **com o mesmo nome por cima do arquivo antigo**: o jogo carrega sozinho, sem mexer em código.

Regras gerais (o matinho e o balão "?" já são arte definitiva em alta resolução e são reduzidos suavemente; o resto é pixel art pequena):
- **PNG com fundo transparente**.
- Pixel art pode ficar pequena: o jogo amplia sem borrar (`image-rendering: pixelated`). Desenhe no tamanho "de pixel" e não amplie antes.
- Depois de trocar, aumente a versão em `client/sw.js` (`const VERSION = 'pererecario-v1.1.1'`, por exemplo). Sem isso, celulares que já abriram o jogo continuam com a arte antiga guardada no cache.

## Bonecos: `char-<modelo>-<gênero>-<tom>.png` (12 arquivos)

| Modelo | Gênero | Tom de pele |
|---|---|---|
| `froghood` (capuz de sapinho), `explorer` (explorador de chapéu) | `masculino`, `feminino` | `clara`, `media`, `escura` |

Exemplo: `char-froghood-feminino-media.png`. Hoje os arquivos `feminino` são **cópias provisórias** dos `masculino`: é só desenhar por cima.

Cada arquivo é uma **folha de 3 colunas × 4 linhas**, todos os quadros do mesmo tamanho:

```
            coluna 0      coluna 1      coluna 2
linha 0     parado        passo 1       passo 2      ← de frente (andando para baixo)
linha 1     parado        passo 1       passo 2      ← virado para a esquerda
linha 2     parado        passo 1       passo 2      ← virado para a direita
linha 3     parado        passo 1       passo 2      ← de costas (andando para cima)
```

- Hoje cada quadro tem **20 × 27 pixels** (folha de 60 × 108).
- **Quer outro tamanho** (por exemplo 32 × 32)? Mude uma linha em `client/js/ui/sprites.js`:
  ```js
  export const CHAR = { fw: 20, fh: 27, head: 15 };
  ```
  `fw`/`fh` são a largura e a altura de **um quadro**, e `head` é quantas linhas de pixel, de cima para baixo, formam a "cabeça" usada no avatar do topo, na barra de navegação e no perfil.
- O pé do boneco deve encostar na **borda de baixo** do quadro: é esse ponto que fica sobre a posição do GPS.
- A animação de andar segue a ordem passo 1 → parado → passo 2 → parado.

Quer um terceiro boneco ou mais tons de pele? Me avise: aí é preciso mexer nas listas `LOOK_MODELS`/`LOOK_SKINS` (`client/js/shared/game.js`) e na validação do servidor.

## Cenário e efeitos

| Arquivo | Onde aparece | Tamanho atual (px) | Observações |
|---|---|---|---|
| `pond-big.png` | Lagoinha no mapa (metade dos brejos) e tela de login | 60 × 34 | Mostrada com ~132 px de largura no mapa |
| `pond-small.png` | Lagoinha no mapa (outra metade) e ícone "Meu Brejo" | 40 × 24 | Mostrada com ~100 px no mapa |
| `bush.png` | Matinho escondendo uma perereca (incomum, rara ou especial) | 118 × 84 ✅ arte definitiva | Exibido com 56 px de largura, redução suave |
| `bush-peek.png` | Matinho quando você chega a 20 m (olhinhos espiando) | 126 × 125 ✅ arte definitiva | Exibido com 60 px; os risquinhos amarelos ficam no próprio PNG |
| `bubble-q.png` | Balão "?" em cima do matinho | 52 × 56 ✅ arte definitiva | Exibido com 26 px |
| `bubble-ex.png` | Balão "!" quando a perereca sai do matinho | 11 × 13 | |
| `lilypad.png` | Vitórias-régias da captura e do login | 16 × 7 | |
| `sparkle.png` | Brilho quando a perereca aparece | 44 × 11 | **Tira de 4 quadros de 11 × 11** lado a lado |
| `icon-book.png` | Ícone "Pererecário" na barra de baixo | 16 × 14 | |
| `icon-heart.png` | Ícone "Amigos" na barra de baixo | 13 × 12 | |

As **15 pererecas** continuam vindo do atlas original (`client/assets/frogs_atlas.png`), com os recortes descritos em `client/assets/species.json`. Se redesenhar alguma, mantenha a posição e o tamanho do recorte, ou atualize o `rect` dela no JSON.

## Conferindo

1. `npm start` e abra `http://localhost:8080`.
2. Perfil → **Como jogar**: o tutorial mostra os bonecos parados e andando, e a última tela mostra os 3 tons.
3. No mapa, ligue o **GPS simulado** (painel de demonstração) e toque no mapa: o boneco anda nas 4 direções.
