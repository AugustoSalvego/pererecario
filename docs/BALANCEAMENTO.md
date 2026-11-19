# Balanceamento: como regular onde e quanto as pererecas aparecem

Todos os números ficam num bloco só, no começo de `client/js/shared/game.js` (o objeto `BALANCO`). O celular e o servidor leem o mesmo arquivo, então nunca discordam.

**Depois de mudar:** reinicie o servidor (`npm start`) e recarregue o app duas vezes no celular.

## Como funciona, em 4 passos

1. **Grade invisível.** O mundo inteiro é coberto por uma grade com um ponto a cada ~130 m. Não precisa cadastrar nada: funciona em qualquer cidade.
2. **Lagoinhas.** Cada ponto da grade tem 75 % de chance de virar lagoinha (com um leve desvio para não ficar tudo alinhado). Isso dá umas 23 lagoinhas num raio de 400 m em volta de você.
3. **Pererecas.** Cada lagoinha tem 4 pererecas em volta, que mudam a cada 15 minutos. As **comuns** ficam à vista dando pulinhos; as **incomuns, raras e a especial** ficam escondidas num **matinho**.
4. **O que aparece na tela.** Só as pererecas a até 70 m do jogador (mais longe, somem) e as lagoinhas a até 400 m. Sem perereca por perto, a setinha no topo aponta a lagoinha mais próxima.

**Modo controle.** Quem anda com o joystick vê só uma parte das pererecas mais raras: 80 % das incomuns, 35 % das raras e 15 % das especiais (`noModoControle`). No modo GPS aparecem todas.

**Cada jogador tem as suas.** O sorteio usa o id do jogador, então cada um tem lagoinhas e pererecas próprias.

Tudo isso vem de um sorteio com "semente" fixa: o mesmo ponto da grade sempre tem a mesma lagoinha, e a mesma lagoinha, no mesmo horário, sempre tem as mesmas pererecas, em qualquer celular, mesmo offline.

## Valores atuais e o que mexer

| Número (em `BALANCO`) | Valor | Se acontecer isto... | ...faça isto |
|---|---|---|---|
| `lagoinhaACadaM` | 130 | o público anda muito sem achar nada | 100 (fica ~1,7× mais lagoinhas) |
| `lagoinhaACadaM` | 130 | lagoinha demais, mapa poluído | 160 |
| `chanceDeLagoinha` | 0,85 | quer lagoinha em todo ponto da grade | 1 |
| `raioDaLagoinhaM` | 30 | pererecas muito longe da lagoinha | 25 |
| `metrosPorPerereca` | 5 | poucas pererecas por lagoinha (hoje 6 por lagoinha, entre `minPererecas` 4 e `maxPererecas` 8) | 4 (fica com 8) |
| `trocaACadaMin` | 15 | as pererecas acabam rápido | 10 (**só mude antes do evento**, nunca no meio) |
| `capturaAteM` | 10 | o GPS é ruim no lugar, não alcança | 15 |
| `revelaMatinhoAteM` | 20 | difícil abrir o matinho | 30 |
| `vePererecasAteM` | 90 | quer ver pererecas de mais longe | 120 |
| `moitaACadaM` | 70 | quer mais pererecas soltas no mato (fora das lagoinhas) | 55 |
| `chanceDeMoita` | 0,7 | mato com perereca demais | 0,4 |
| `pererecasNaMoita` | 2 | quer até 3 por moitinha | 3 |
| `veLagoinhasAteM` | 400 | quer o mapa mais limpo | 250 |
| `vaoEntrePererecasM` | 12 | pererecas grudadas | 15 |
| `noModoControle.rare` | 0,35 | quer o modo controle mais generoso | 0,6 |
| `noModoControle.special` | 0,15 | quer a especial quase só no GPS | 0,05 |

**Raridade, XP e toques** ficam em `client/assets/species.json`, no bloco `tiers`: `weight` é a chance de cada raridade (hoje 55 / 28 / 13 / 4, somando 100), `xp` é quanto cada uma vale e `taps` é o mínimo de toques para capturar. Para a especial aparecer mais, troque 55/28/13/4 por, por exemplo, 52/28/14/6.

## Trabalhos, Brejais e carros

Os moradores que pedem ajuda seguem a mesma ideia das lagoinhas: uma grade invisível de 140 m, e a cada 15 minutos cada ponto da grade sorteia se tem um morador (80 %), qual serviço e onde fica. Os números ficam no mesmo bloco `BALANCO`; os carros ficam na lista `CARS`, logo abaixo, em `client/js/shared/game.js`.

| Número | Valor | Se acontecer isto... | ...faça isto |
|---|---|---|---|
| `trabalhoACadaM` | 140 | o público quase não acha morador | 110 |
| `chanceDeTrabalho` | 0,8 | morador demais no mapa | 0,55 |
| `pagamento` | casa 35 · carro 30 · horta 25 · entrega 40 | carro demora demais para sair | aumente uns 30 % |
| `bonusNoGps` | 1,5 | quer premiar mais quem anda de verdade | 2 |
| `veTrabalhosAteM` | 200 | quer ver moradores de mais longe | 260 |
| `entregaDistM` | 140–260 | a entrega está longe demais | 100–180 |
| `entregaMin` | 5 | o prazo da entrega está apertado | 7 |

| Carro | Preço | Velocidade (joystick) |
|---|---|---|
| A pé | – | 3,5 m/s |
| Hatch | B$ 150 | 6 m/s |
| Sedã | B$ 250 | 7 m/s |
| Picape | B$ 400 | 7,5 m/s |
| Jipe | B$ 600 | 8 m/s, e revela matinhos a 30 m |
| Superesportivo | B$ 1500 | 12 m/s |

Contas rápidas: um trabalho paga em média ~B$ 32 no modo Controle e ~B$ 49 no GPS. O Hatch sai com uns **5 trabalhos** no Controle (3 no GPS); o Superesportivo, com uns 45 (30 no GPS). Cada trabalho leva de 1 a 2 minutos, e a entrega até 5. Num raio de 200 m costuma haver uns 4 moradores, renovados a cada 15 min.

Cuidado: mudar `pagamento` ou o preço de um carro vale para os próximos trabalhos e compras; o que já foi pago fica gravado no servidor como foi. Não mude `trabalhoACadaM` com gente jogando (o mesmo cuidado das lagoinhas).

### Venda de pererecas (Meu Brejo)

| Número | Valor | O que é |
|---|---|---|
| `venda` | comum 6 · incomum 14 · rara 35 · especial 90 | B$ que cada raridade vale na venda |
| `bonusTamanho` | 0,5 | a maior perereca da espécie vale até +50 % (a menor vale o preço base) |

Contas rápidas: 5 comuns valem mais ou menos um trabalho; uma rara vale um trabalho; uma especial vale quase três. Para a venda pesar mais na economia, suba os preços uns 30 %.

## Contas rápidas para o dia do evento

- Em média, num raio de 150 m: ~4 lagoinhas com ~22 pererecas e ~8 moitinhas com ~11 pererecas soltas no mato. No mapa (até 90 m) aparecem umas **12 pererecas** ao mesmo tempo.

- Lagoinhas em volta de quem joga: ~6 num raio de 200 m, ~23 num raio de 400 m, ~140 num raio de 1 km.
- Uma lagoinha a cada ~1,5 min de caminhada. Com 6 pererecas por lagoinha e troca a cada 15 min, um jogador parado numa lagoinha pega até **24 pererecas por hora** só ali.
- A especial tem 4 % de chance por perereca: num raio de 400 m (23 lagoinhas × 4 pererecas) nascem umas **3 a 4 especiais a cada 15 minutos**.

## Cuidados

- **Não mude `trocaACadaMin` com gente jogando:** as capturas feitas offline no horário antigo seriam recusadas pelo servidor.
- Mudar `lagoinhaACadaM` ou `chanceDeLagoinha` **muda o lugar das lagoinhas**. Capturas já feitas continuam valendo, mas as lagoinhas "mudam de lugar" no mapa.
- As lagoinhas automáticas não sabem onde ficam os prédios: se uma cair num lugar ruim, crie um brejo à mão no lugar certo (ele tem prioridade e esconde a automática que estiver em cima).
