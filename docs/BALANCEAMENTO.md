# Balanceamento: como regular onde e quanto as pererecas aparecem

Todos os números ficam num bloco só, no começo de `client/js/shared/game.js` (o objeto `BALANCO`). O celular e o servidor leem o mesmo arquivo, então nunca discordam.

**Depois de mudar:** reinicie o servidor (`npm start`) e recarregue o app duas vezes no celular.

## Como funciona, em 4 passos

1. **Área do campus.** O organizador define um círculo (centro + raio) no painel. O jogo põe uma grade invisível sobre ele, com um ponto a cada ~130 m.
2. **Lagoinhas.** Cada ponto da grade tem 75 % de chance de virar lagoinha (com um leve desvio para não ficar tudo alinhado). Num campus de 500 m de raio, isso dá umas 33 lagoinhas.
3. **Pererecas.** Cada lagoinha tem 4 pererecas em volta, que mudam a cada 15 minutos. As **comuns** ficam à vista dando pulinhos; as **incomuns, raras e a especial** ficam escondidas num **matinho**.
4. **O que aparece na tela.** Só as pererecas a até 70 m do jogador (mais longe, somem) e as lagoinhas a até 400 m. Sem nada por perto, a setinha no topo aponta a lagoinha mais próxima.

Tudo isso vem de um sorteio com "semente" fixa: a mesma lagoinha, no mesmo horário, sempre tem as mesmas pererecas, em qualquer celular, mesmo offline.

## Valores atuais e o que mexer

| Número (em `BALANCO`) | Valor | Se acontecer isto... | ...faça isto |
|---|---|---|---|
| raio do campus (no painel) | 500 m | o público anda longe sem achar nada | diminua para 300–400 m (concentra o jogo) |
| `lagoinhaACadaM` | 130 | poucas lagoinhas, anda muito | 100 (fica ~1,7× mais lagoinhas) |
| `lagoinhaACadaM` | 130 | lagoinha demais, mapa poluído | 160 |
| `chanceDeLagoinha` | 0,75 | quer lagoinha em todo ponto da grade | 1 |
| `raioDaLagoinhaM` | 30 | pererecas muito longe da lagoinha | 25 |
| `metrosPorPerereca` | 7 | poucas pererecas por lagoinha | 5 (lagoinha de 30 m fica com 6) |
| `trocaACadaMin` | 15 | as pererecas acabam rápido | 10 (**só mude antes do evento**, nunca no meio) |
| `capturaAteM` | 10 | o GPS do campus é ruim, não alcança | 15 |
| `revelaMatinhoAteM` | 20 | difícil abrir o matinho | 30 |
| `vePererecasAteM` | 70 | quer ver pererecas de mais longe | 100 |
| `veLagoinhasAteM` | 400 | quer o mapa mais limpo | 250 |
| `vaoEntrePererecasM` | 12 | pererecas grudadas | 15 |

**Raridade, XP e toques** ficam em `client/assets/species.json`, no bloco `tiers`: `weight` é a chance de cada raridade (hoje 55 / 28 / 13 / 4, somando 100), `xp` é quanto cada uma vale e `taps` é o mínimo de toques para capturar. Para a especial aparecer mais, troque 55/28/13/4 por, por exemplo, 52/28/14/6.

## Contas rápidas para o dia do evento

- Campus de 300 m → ~14 lagoinhas; 400 m → ~25; 500 m → ~33; 700 m → ~73.
- Com 4 pererecas por lagoinha e troca a cada 15 min, um jogador parado numa lagoinha pega até **16 pererecas por hora** só ali. Andando entre lagoinhas (uma a cada ~1,5 min de caminhada), pega bem mais.
- A especial tem 4 % de chance por perereca: com 33 lagoinhas × 4 pererecas, nascem umas **5 especiais a cada 15 minutos** no campus inteiro.

## Cuidados

- **Não mude `trocaACadaMin` com gente jogando:** as capturas feitas offline no horário antigo seriam recusadas pelo servidor.
- Mudar `lagoinhaACadaM`, `chanceDeLagoinha` ou a área do campus **muda o lugar das lagoinhas**. Capturas já feitas continuam valendo, mas as lagoinhas "mudam de lugar" no mapa.
- As lagoinhas automáticas não sabem onde ficam os prédios: se uma cair num lugar ruim, crie brejos à mão nos lugares certos (eles têm prioridade e escondem a automática que estiver em cima).
