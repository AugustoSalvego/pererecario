# Artes do jogo: o que trocar e em que formato

Todas as artes ficam em **`client/assets/sprites/`**. Os bonecos são gerados por `scripts/gerar_bonecos.py` (versão 2, aprovada); lagoinhas, vitória-régia, ícones e efeitos por `scripts/gerar_sprites.py`; o matinho e o balão "?" são arte desenhada à parte. Para trocar, salve o seu PNG **com o mesmo nome por cima do arquivo antigo**: o jogo carrega sozinho, sem mexer em código.

Regras gerais (o matinho e o balão "?" já são arte definitiva em alta resolução e são reduzidos suavemente; o resto é pixel art pequena):
- **PNG com fundo transparente**.
- Pixel art pode ficar pequena: o jogo amplia sem borrar (`image-rendering: pixelated`). Desenhe no tamanho "de pixel" e não amplie antes.
- Depois de trocar, aumente a versão em `client/sw.js` (`const VERSION = 'pererecario-v1.1.1'`, por exemplo). Sem isso, celulares que já abriram o jogo continuam com a arte antiga guardada no cache.

## Bonecos: `char-<estilo>-<gênero>-<tom>.png` (108 arquivos)

18 estilos × 2 gêneros × 3 tons de pele, todos gerados por `python3 scripts/gerar_bonecos.py` (cores e formas de cada estilo ficam no dicionário `MODELS` do script). Para conferir todos de uma vez: `python3 scripts/gerar_bonecos.py --previa previa.png`.

| Estilos | Gênero | Tom de pele |
|---|---|---|
| `froghood` (Capuz de Sapo), `explorer` (Explorador), `dartfrog` (Rã-Flecha), `raincoat` (Capa de Chuva), `scientist` (Cientista), `fisher` (Pescador), `sporty` (Esportista), `farmer` (Jardineiro), `student` (Universitário), `lantern` (Caçador Noturno), `mage` (Mago do Brejo), `royal` (Realeza do Brejo), `ninja` (Ninja), `samurai` (Samurai), `knight` (Cavaleiro), `pirate` (Pirata), `magical` (Mágica), `pilot` (Piloto de Robô) | `masculino`, `feminino` | `clara`, `media`, `escura` |

Os estilos são personagens originais. Não use personagens de anime, de jogos ou de desenhos (nem partes marcantes deles, como um cabelo ou um chapéu característico): eles têm direitos autorais.

Exemplo: `char-froghood-feminino-media.png`.

Cada arquivo é uma **folha de 3 colunas × 4 linhas**, todos os quadros do mesmo tamanho:

```
            coluna 0      coluna 1      coluna 2
linha 0     parado        passo 1       passo 2      ← de frente (andando para baixo)
linha 1     parado        passo 1       passo 2      ← virado para a esquerda
linha 2     parado        passo 1       passo 2      ← virado para a direita
linha 3     parado        passo 1       passo 2      ← de costas (andando para cima)
```

- Hoje cada quadro tem **24 × 32 pixels** (folha de 72 × 128).
- **Quer outro tamanho** (por exemplo 32 × 32)? Mude uma linha em `client/js/ui/sprites.js`:
  ```js
  export const CHAR = { fw: 24, fh: 32, head: 19 };
  ```
  `fw`/`fh` são a largura e a altura de **um quadro**, e `head` é quantas linhas de pixel, de cima para baixo, formam a "cabeça" usada no avatar do topo, na barra de navegação e no perfil.
- O pé do boneco deve encostar na **borda de baixo** do quadro: é esse ponto que fica sobre a posição do GPS.
- A animação de andar segue a ordem passo 1 → parado → passo 2 → parado.

Quer outro estilo ou mais tons de pele? Além do script, é preciso acrescentar o nome em `LOOK_MODELS` (`client/js/shared/game.js`), em `LOOK_NAMES` (`client/js/ui/sprites.js`) e na lista de bonecos do `client/sw.js`.

## Moradores, carros e trabalhos

| Arquivos | Script | Formato |
|---|---|---|
| `npc-<serviço>-<gênero>-<tom>.png` (24 arquivos: pedreiro, mecanico, agricultor, carteiro) | `scripts/gerar_bonecos.py` (dicionário `NPCS`) | Mesmo formato dos bonecos: 72 × 128, 3 colunas × 4 linhas (quadros de 24 × 32) |
| `car-<modelo>.png` (hatch, sedan, pickup, jeep, super) | `scripts/gerar_carros.py` | 64 × 112: **2 colunas × 4 linhas** de quadros de 32 × 28 (linhas: para baixo, esquerda, direita, para cima; as 2 colunas são o balanço da roda) |
| `bubble-job-<serviço>.png` | `scripts/gerar_carros.py` (`ICONS`) | 16 × 18, balãozinho com o ícone do serviço em cima do morador |
| `job-<casa\|carro\|horta>-<1..4>.png` | `scripts/gerar_trabalhos.py` | 96 × 72, a cena de cada etapa do minijogo (a 4 é a cena pronta, mostrada no pagamento) |
| `job-alvo-<nome>.png` (13 arquivos) | `scripts/gerar_trabalhos.py` | 12 × 12, os alvos do minijogo (tijolo, prego, tinta, parafuso, lama, mato, tomate...) |

O sedã é desenhado pixel por pixel num bloco de texto (`SEDAN` em `gerar_carros.py`): cada letra é uma cor. Para conferir as cenas: `python3 scripts/gerar_trabalhos.py --previa previa.png`. Ao acrescentar ou renomear algum desses arquivos, atualize também a lista do `client/sw.js`.

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
3. No mapa, toque no botão **GPS** para mudar para o **modo controle** e ande com o joystick: o boneco anda nas 4 direções.
4. Faça alguns trabalhos, compre um carro na loja e mude para o modo controle: o carro aparece nas 4 direções, com o balãozinho do rosto.
