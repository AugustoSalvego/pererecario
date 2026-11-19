# Pererecário 🐸

Jogo para celular no estilo "anda e captura": as pererecas ficam esperando nas **lagoinhas** espalhadas pelo mapa (em qualquer lugar, como no Pokémon GO), você caminha até elas com o GPS e **toca rápido** para capturá-las. O jogo funciona **online e offline**: tudo fica salvo no aparelho e é sincronizado com o servidor quando a conexão volta.

Trabalho prático de **Sistemas Distribuídos / Computação Móvel e Ubíqua**.

![Telas do jogo](docs/img/telas.jpg)

- **Documentação completa do trabalho:** [`docs/RELATORIO.md`](docs/RELATORIO.md) (armazenamento local, sincronização, conflitos, falhas, computação ubíqua)
- **Roteiro da apresentação (testes obrigatórios):** [`docs/ROTEIRO_APRESENTACAO.md`](docs/ROTEIRO_APRESENTACAO.md)
- **Artes (o que trocar e em que formato):** [`docs/ARTES.md`](docs/ARTES.md)
- **Hospedagem e segurança dos dados (deploy, backup, restauração):** [`docs/HOSPEDAGEM.md`](docs/HOSPEDAGEM.md)

## Como jogar

1. Abra o link do jogo no celular (Chrome no Android ou Safari no iPhone) e crie a conta: **apelido, e-mail e senha**, ou **Continuar com Google**. Depois permita **localização** e **sensores de movimento**.
2. Na primeira vez, um tutorial curto explica o jogo e você escolhe o seu boneco: são **18 estilos** (Capuz de Sapo, Explorador, Ninja, Samurai, Cavaleiro, Pirata, Mágica, Piloto de Robô e outros), masculino ou feminino, em 3 tons de pele.
3. Escolha como andar no botão do mapa: **GPS** (anda de verdade; aparecem todas as pererecas) ou **Controle** (joystick na tela; aparecem menos raras). Ande até uma **lagoinha** (a setinha no topo aponta a mais próxima). As pererecas comuns ficam à vista, pulando em volta dela; as mais raras se escondem nos **matinhos com "?"**.
4. Chegou a 20 m de um matinho? **Toque nele** ou **chacoalhe o celular** (revela todos por perto) para a perereca sair.
5. A até **10 m**, toque na perereca para escolhê-la. Na captura, **toque rápido** nela várias vezes, enquanto ela pula entre as vitórias-régias, até pegar.
6. Quem estiver jogando a até 300 m aparece no seu mapa, com o nome (dá para se esconder no Perfil). De dia o mapa é claro; à noite fica azulado, com vaga-lumes e uma luz em volta do seu boneco.
7. Encontrou outro jogador? Na aba **Amigos**, um escaneia o **QR code** do outro: vocês viram parceiros de brejo e quem escaneou ganha uma **perereca-presente** (uma por amigo por dia).
8. Complete o **Pererecário** (15 espécies, das comuns até a especial) e veja suas repetidas no **Meu Brejo**. Cada dia em que você joga é uma **caçada**; no Perfil ficam a caçada de hoje, o ranking e o **Diário de campo** com as últimas capturas.
9. Pelo mapa aparecem **moradores pedindo ajuda** (balãozinho em cima da cabeça): o pedreiro constrói uma casinha, a mecânica conserta um carro, o agricultor cuida da horta e o carteiro precisa de uma entrega. Chegue perto, toque nele e jogue o minijogo de 3 etapas (cada trabalho leva no máximo 5 minutos). No fim você recebe **Brejais (B$)**, a moeda do jogo; no GPS o pagamento é maior.
10. No **Meu Brejo** (a sua bolsa), venda pererecas por Brejais: cada uma tem um preço pela raridade e pelo tamanho, e dá para vender todas as repetidas de uma vez. Favoritas ficam guardadas.
11. Com os Brejais, compre um **carro** na **Loja do Brejo** (botão de sacola ou toque no saldo): Hatch, Sedã, Picape, Jipe ou Superesportivo. O carro só anda no **modo Controle** (no GPS você sempre vai a pé, por segurança) e quem estiver perto vê o seu carro com um balãozinho do seu rosto e do seu nome.

Para instalar como app: no Android, menu ⋮ → "Instalar app"/"Adicionar à tela inicial"; no iPhone, Compartilhar → "Adicionar à Tela de Início".

## Rodar localmente

Requer apenas **Node.js 22.13+** (o servidor não tem dependências para rodar com SQLite).

```bash
npm start            # http://localhost:8080  (usa SQLite em data/pererecario.db)
npm test             # 57 testes: sincronização, idempotência, conflitos, falhas, recuperação depois de perda no banco, trabalhos, loja, vendas, backup, contas, código por e-mail e painel protegido
```

Painel do servidor: `http://localhost:8080/admin` (chave padrão local: `brejo-admin`; hospedado, essa chave não vale: o Render sorteia a `ADMIN_KEY` e, sem uma chave de 12 ou mais caracteres, o painel fica desligado).

> No celular, GPS, câmera e sensores só funcionam com **HTTPS**. Para testar no aparelho use o deploy abaixo (ou um túnel HTTPS para o seu computador).

## Colocar no ar (grátis) e segurança dos dados

Passo a passo completo em [`docs/HOSPEDAGEM.md`](docs/HOSPEDAGEM.md). Em resumo:

1. **Banco no [Neon](https://neon.com)** (PostgreSQL grátis e sem prazo de validade): crie um projeto na região AWS US East 1 (N. Virginia) e copie a *connection string*.
2. **Servidor no [Render](https://render.com)**: **New → Blueprint** com este repositório. O [`render.yaml`](render.yaml) cria o servidor, pede a `DATABASE_URL` (a do Neon) e sorteia a `ADMIN_KEY` (senha do `/admin`, que você vê em **Environment**).
3. **Backup automático**: cadastre os segredos `GAME_URL`, `ADMIN_KEY` e `BACKUP_PASSWORD` no GitHub. O workflow [`backup`](.github/workflows/backup.yml) copia o banco inteiro a cada 6 horas, criptografado, e guarda por 90 dias. Para restaurar: `node scripts/restaurar_backup.js arquivo`.
4. **Opcionais e grátis:** `GOOGLE_CLIENT_ID` (botão "Continuar com Google") e `BREVO_API_KEY` + `EMAIL_FROM` (código de 6 números por e-mail no cadastro e no "Esqueci a senha"). Sem eles, o jogo funciona só com e-mail e senha, sem código.

Por que não o Postgres gratuito do próprio Render: ele expira 30 dias depois de criado e não tem backup. E por que não SQLite em produção: no plano grátis, os arquivos do servidor são apagados quando ele reinicia ou dorme (por isso o servidor nem sobe hospedado sem `DATABASE_URL`).

O servidor gratuito do Render "dorme" após 15 min sem acesso e leva cerca de 1 min para acordar; o jogo continua funcionando offline nesse meio-tempo e sincroniza depois.

## Onde aparecem as lagoinhas

**Em qualquer lugar, sem cadastro, e diferentes para cada jogador.** O mundo inteiro é coberto por uma grade invisível de ~130 m, e cada ponto da grade tem um sorteio fixo, feito com o id do jogador, que decide se ali existe uma lagoinha (85 % de chance). Cada lagoinha tem 6 pererecas, que mudam a cada **15 minutos**, e outra grade espalha pererecas soltas no mato, longe da água. Celular e servidor fazem o mesmo sorteio, então chegam às mesmas lagoinhas e pererecas, mesmo com o celular offline. Dois jogadores lado a lado veem lagoinhas diferentes; a mesma conta em dois celulares vê as mesmas.

No mapa, as pererecas e os matinhos só aparecem a até 90 m do jogador (mais longe, somem), e as lagoinhas a até 400 m. Quando não há perereca por perto, uma setinha no topo aponta a lagoinha mais próxima.

Se quiser uma lagoinha num ponto exato (por exemplo, a sala da apresentação), crie um **brejo à mão**: Perfil → Painel de demonstração → chave de administrador → "Criar brejo onde estou", ou `/admin` → Brejos. O brejo cadastrado esconde a lagoinha automática que estiver em cima dele, e dois brejos cadastrados não podem ficar colados (o servidor recusa).

Para deixar o jogo com mais ou menos pererecas, veja [`docs/BALANCEAMENTO.md`](docs/BALANCEAMENTO.md): todos os números ficam num lugar só.

## Estrutura

```
client/                 PWA (HTML/CSS/JS sem build)
  index.html, sw.js     app shell + Service Worker (offline)
  js/shared/game.js     regras determinísticas compartilhadas com o servidor
  js/db.js              IndexedDB (armazenamento local persistente)
  js/store.js           estado = último estado do servidor + fila de operações
  js/sync.js            módulo de sincronização (conectividade, reenvio, backoff)
  js/geo.js, sensors.js GPS (real ou simulado) e acelerômetro (chacoalhar)
  js/ui/                telas: login, mapa, captura, álbum, Meu Brejo, amigos, perfil, demonstração
  js/ui/jobs.js         conversa com os moradores, minijogos dos trabalhos e entrega
  js/ui/shop.js         Loja do Brejo (carros) e desenho do carro com o balão do rosto
  admin.html            painel do servidor (dados, conflitos, simulação de queda)
  assets/               atlas com as 15 pererecas, catálogo das espécies, bonecos, moradores, carros e cenas dos trabalhos
scripts/                geradores das artes em pixel (Python + Pillow)
server/                 Node.js (http nativo) + SQLite/PostgreSQL
  app.js                rotas REST
  sync.js               aplicação idempotente das operações e resolução de conflitos
  db.js                 camada de banco (mesmo SQL nos dois motores)
  mailer.js             envio do código por e-mail (Brevo)
  google.js             conferência do login com o Google
test/                   testes automatizados (sincronização, contas, código por e-mail, Postgres)
  navegador/            teste de resistência com dois celulares no Chrome (internet, servidor e banco caindo)
```

## Autor

**Danilo Augusto Salvego dos Santos** · GitHub: [AugustoSalvego](https://github.com/AugustoSalvego)

Mapa: © colaboradores do OpenStreetMap (ou CARTO Voyager, se o servidor tiver a variável `CARTO_KEY` com a chave gratuita de carto.com/basemaps/apikey). Bibliotecas incluídas: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) e [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0).
