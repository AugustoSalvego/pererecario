# Pererecário — decisões de interação v1

## Escopo entregue
Kit visual: arte aprovada preservada em atlas RGBA, recortes descritos em JSON, componente Flutter e demonstração HTML offline. Não é o jogo completo: login, GPS, câmera real, banco, trocas e sincronização ainda não estão implementados. O cenário da prévia é ilustrado e a foto é simulada. Uma pose original por espécie, animada por transformações; não há novos quadros de patas ou piscadas.

## Pererecário
Grade estática para evitar excesso de movimento. Espécies não descobertas aparecem como silhueta e nome ???. Toque abre ficha; na ficha a criatura respira suavemente. Toque na criatura reproduz salto curto de 600 ms. Descoberta exibe nome, descrição e raridade. Descobertas são permanentes mesmo depois de trocar o último exemplar. Favorito é uma propriedade do exemplar no Meu Brejo, não da espécie.

## Câmera e fotografia
GPS libera encontro a até 35 m, valor inicial ajustável. Se a precisão estiver pior que 40 m, informar posição imprecisa e aguardar; não inventar distância nem exigir caminhar para lugar inseguro. A perereca é uma sobreposição em tela, sem ancoragem espacial. Câmera real deve preservar proporção. Obturador fixo e grande; alvo central; criatura move-se devagar. Captura se o centro da criatura estiver na moldura ao clicar. Falha mostra dica e permite nova tentativa. Após dois erros, assistência centraliza a criatura e mantém a assistência até o sucesso. Sem fuga, energia, consumível, limite de tentativas ou penalidade. Opção de movimento reduzido também centraliza. Captura congela a pose, confirma com pulinho/brilho suave e abre ficha. Evitar flash branco piscante. Fotografar várias vezes o mesmo encontro não pode produzir vários exemplares.

## Dificuldade justa
Pesos por categoria: comum 60%, incomum 28%, rara 10%, especial 2%; primeiro selecionar categoria, depois espécie (não aplicar 60% a cada comum). Seis comuns, cinco incomuns, três raras e uma especial. Tamanhos sorteados em intervalos, apenas cosméticos nesta versão. Dificuldade não exige horário noturno, clima, compra, distância maior ou locais perigosos. Todas podem aparecer nas áreas acessíveis cadastradas.

Garantias propostas para a integração: após quatro encontros concluídos consecutivos com espécies já descobertas, o próximo terá espécie nova enquanto faltarem espécies; após nove sem rara/especial, o próximo será rara/especial; após dezenove sem especial, o próximo será especial. Combinar garantias quando possível; prioridade especial, depois descoberta nova, depois rara. Se uma garantia for adiada, permanece pendente até ser atendida. O encontro inicial é Folhinha. Esses mecanismos de seleção NÃO estão implementados na prévia visual. Contadores e encontros devem ser persistidos atomicamente e sincronizados; uma coleção completa não ativa garantia de espécie nova.

## Persistência e integração futura
IDs frog_* são permanentes. Cada encontro tem ID e atributos fixos antes da captura, inclusive tamanho; reiniciar ou trocar de aparelho não deve sortear outra recompensa para o mesmo encontro. Separar operação única, exemplar, espécie descoberta e pontuação. Captura offline grava exemplar + operação pendente na mesma transação local. Falha de rede não bloqueia animação de resultado. Fotografia é local e opcional; progresso remoto não depende do upload da foto. Trocas apenas online, com exemplares sincronizados e transferência atômica. Conflito do mesmo encontro: uma captura por conta; operações diferentes concorrentes devem reconciliar para o resultado canônico.

## Layout e acessibilidade
Modo retrato recomendado. Grade adaptativa, área segura e conteúdo rolável. Não esticar arte. Botões de no mínimo 48 pixels lógicos. Texto pode crescer; não usar cores como único sinal de raridade. Respeitar movimento reduzido. Prévia HTML oferece filtro de raridade, ficha, salto, silhueta, animação de câmera, captura simulada e reinício do encontro. Sua navegação responsiva não é o layout final do app.

## Uso do atlas
Imagem original preservada; JSON contém retângulos em pixels. Flutter e HTML recortam na renderização, sem refazer a arte. Não dividir por células iguais: os desenhos da prancha têm larguras diferentes. Pequenas franjas de pixels da geração podem existir. Revisar no aparelho antes da publicação. Fonte: coleção gerada e aprovada nesta conversa, não a imagem de referência externa.


## Atualização v0.2 — peculiaridades no álbum principal

Esta seção substitui a decisão anterior de grade estática: espécies descobertas na grade principal executam sua peculiaridade com pausas, cerca de 72% do ciclo em repouso. Ritmos e fases variam por espécie. Silhuetas e lista de exemplares repetidos permanecem estáticas. Opção de movimento reduzido desliga os efeitos. Câmera mantém seus movimentos anteriores; peculiaridades pertencem ao álbum. Efeitos são estilizados e cosméticos, não uma simulação biológica. Cor temporária não altera espécie, raridade ou variante do exemplar.

- **Folhinha**: Muda suavemente do verde-folha para um tom mais azulado.
- **Pitanga**: Enche as bochechas e solta o ar devagar.
- **Gotinha**: Dá dois pulinhos pequenos, um depois do outro.
- **Musgo**: Infla a garganta uma vez e volta a descansar.
- **Mel**: Fica um pouquinho mais dourada por alguns instantes.
- **Jabuticaba**: Estufa o corpo e volta ao formato normal.
- **Barro**: Se abaixa antes de dar um salto curto.
- **Nuvem**: Respira fundo, enchendo e esvaziando o corpo.
- **Lagoa**: Inclina o corpo suavemente para os dois lados.
- **Goiabinha**: Se encolhe um pouco e depois se solta.
- **Estrelinha**: Ganha um brilho suave, sem piscar rapidamente.
- **Broto**: Se estica, como quem acabou de acordar.
- **Brasa**: Infla a garganta duas vezes seguidas.
- **Lavanda**: Balança o corpo devagar, com os pés no lugar.
- **Jade**: Alterna suavemente entre verde e turquesa.

Implementação usa a mesma pose aprovada com transformação, filtro de cor e deformação localizada por faixas para bochechas/garganta. Não há novas poses desenhadas. Na prévia HTML, atualização da grade limitada a 20 fps e cartões fora da área visível são ignorados. O código Flutter usa TickerMode e o ciclo do aplicativo para pausar as animações. A aparência das deformações precisa de validação visual no dispositivo.
