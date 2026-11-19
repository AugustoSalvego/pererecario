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
| `chanceDeLagoinha` | 0,75 | quer lagoinha em todo ponto da grade | 1 |
| `raioDaLagoinhaM` | 30 | pererecas muito longe da lagoinha | 25 |
| `metrosPorPerereca` | 7 | poucas pererecas por lagoinha | 5 (lagoinha de 30 m fica com 6) |
| `trocaACadaMin` | 15 | as pererecas acabam rápido | 10 (**só mude antes do evento**, nunca no meio) |
| `capturaAteM` | 10 | o GPS é ruim no lugar, não alcança | 15 |
| `revelaMatinhoAteM` | 20 | difícil abrir o matinho | 30 |
| `vePererecasAteM` | 70 | quer ver pererecas de mais longe | 100 |
| `veLagoinhasAteM` | 400 | quer o mapa mais limpo | 250 |
| `vaoEntrePererecasM` | 12 | pererecas grudadas | 15 |
| `noModoControle.rare` | 0,35 | quer o modo controle mais generoso | 0,6 |
| `noModoControle.special` | 0,15 | quer a especial quase só no GPS | 0,05 |

**Raridade, XP e toques** ficam em `client/assets/species.json`, no bloco `tiers`: `weight` é a chance de cada raridade (hoje 55 / 28 / 13 / 4, somando 100), `xp` é quanto cada uma vale e `taps` é o mínimo de toques para capturar. Para a especial aparecer mais, troque 55/28/13/4 por, por exemplo, 52/28/14/6.

## Contas rápidas para o dia do evento

- Lagoinhas em volta de quem joga: ~6 num raio de 200 m, ~23 num raio de 400 m, ~140 num raio de 1 km.
- Uma lagoinha a cada ~1,5 min de caminhada. Com 4 pererecas por lagoinha e troca a cada 15 min, um jogador parado numa lagoinha pega até **16 pererecas por hora** só ali.
- A especial tem 4 % de chance por perereca: num raio de 400 m (23 lagoinhas × 4 pererecas) nascem umas **3 a 4 especiais a cada 15 minutos**.

## Cuidados

- **Não mude `trocaACadaMin` com gente jogando:** as capturas feitas offline no horário antigo seriam recusadas pelo servidor.
- Mudar `lagoinhaACadaM` ou `chanceDeLagoinha` **muda o lugar das lagoinhas**. Capturas já feitas continuam valendo, mas as lagoinhas "mudam de lugar" no mapa.
- As lagoinhas automáticas não sabem onde ficam os prédios: se uma cair num lugar ruim, crie um brejo à mão no lugar certo (ele tem prioridade e esconde a automática que estiver em cima).
