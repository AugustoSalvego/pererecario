# Roteiro da apresentação (23/11)

Os 6 testes obrigatórios do enunciado, passo a passo.

## Preparação (antes de começar)

- **Dois celulares** (A e B) com o jogo aberto no link do servidor, logados **na mesma conta** de demonstração (ex.: `demo`).
- **Notebook no projetor** com o painel do servidor aberto: `https://SEU-APP.onrender.com/admin` (com a `ADMIN_KEY`). Ele mostra capturas, log de operações, conflitos e atualiza a cada 3 s.
- As lagoinhas aparecem sozinhas em qualquer lugar: o público só precisa abrir o link e criar uma conta.
- **Um brejo na sala**: no celular, Perfil → Painel de demonstração → chave de admin → nome "Brejo da Sala" → raio 40 → **Criar brejo onde estou**. (Faça isso antes, no lugar da apresentação.)
- Se o GPS dentro do prédio estiver ruim, ligue **GPS simulado** no painel de demonstração e toque no mapa para o explorador andar (ou use "Ir" ao lado do brejo).
- Abra o servidor uns minutos antes: no plano grátis ele "dorme" e leva ~1 min para acordar.

## Teste 1: partida online com registro no servidor

1. No celular A (online, pílula verde **Online**), mostre o contador "hoje" no canto inferior esquerdo (a caçada do dia é a partida).
2. Ande até a lagoinha, chacoalhe o celular perto de um matinho, chegue a 10 m da perereca e capture.
3. No projetor (`/admin`): a captura aparece em **Capturas recebidas** e em **Log de operações** (`capture` → `applied`) com o aparelho de origem.

## Teste 2: perder a conexão durante a partida e continuar jogando

1. Ative o **modo avião** no celular A (ou "Simular modo avião" no painel de demonstração).
2. A pílula muda para **Offline**. Continue andando e capture outra perereca: ela aparece no Meu Brejo marcada como **pendente** e o contador da pílula sobe.
3. Mostre que o mapa, o Pererecário e o perfil continuam funcionando.

## Teste 3: fechar e abrir o app sem conexão

1. Ainda offline, **feche o app** de verdade (remova da lista de apps recentes).
2. Abra de novo: o jogo carrega (Service Worker), continua logado e as capturas offline estão lá, ainda pendentes (IndexedDB).

## Teste 4: restabelecer a conexão e enviar o que foi feito offline

1. Desligue o modo avião.
2. Em poucos segundos a pílula passa por **Sincronizando** e volta a **Online**; as capturas perdem a marca "pendente".
3. No projetor: as capturas chegam com a coluna **Atraso** mostrando quanto tempo ficaram só no celular.

## Teste 5: recuperar o progresso em outro aparelho

1. No celular B (ou num navegador anônimo), entre com a mesma conta.
2. O Pererecário, o Meu Brejo, o nível e o Diário de campo aparecem iguais aos do celular A. No `/admin`, a tabela **Partidas** mostra a caçada do dia com **2 aparelhos**.

## Teste 6: servidor indisponível, reenvio e conflito

**Servidor indisponível**
1. No `/admin`, clique **Derrubar servidor por 60 s**.
2. No celular, a pílula fica laranja (**Servidor fora**). Capture uma perereca: ela fica pendente.
3. Passados os 60 s (ou "Religar agora"), o app sincroniza sozinho. No celular, Perfil → Painel de demonstração mostra no registro as tentativas com intervalo crescente.

**Operação transmitida mais de uma vez**
1. Painel de demonstração → **Perder a resposta da próxima sincronização** → capture uma perereca.
2. O servidor grava a captura, mas a resposta "se perde": o celular reenvia e o servidor responde **duplicada, nada mudou** (veja no registro do celular e em "Reenvios ignorados" no `/admin`). Nada é duplicado no Meu Brejo.
3. Botão **Reenviar operação já confirmada**: mesma coisa, sob demanda.

**Informações conflitantes entre cliente e servidor**
1. Coloque **A e B offline**, os dois perto da **mesma perereca** (mesmo brejo, mesmo horário).
2. Capture-a **primeiro no A** e **depois no B**. Cada celular acha que pegou.
3. Ligue a internet do **A**, espere sincronizar; depois a do **B**.
4. O B mostra o aviso roxo: **"Conflito resolvido: a perereca já tinha sido capturada antes no aparelho A. Ficou a primeira captura."** Os dois aparelhos ficam com uma única captura.
5. No projetor: a seção **Conflitos resolvidos** mostra qual captura foi mantida e qual foi descartada, com aparelho e horário.
6. Explique a política (docs/RELATORIO.md, seção 6): vence a captura mais antiga, independentemente de quem sincroniza primeiro.

## Extras de computação ubíqua (para mostrar)

- **Chacoalhar** o celular perto de um matinho com "?" faz as pererecas saírem.
- **QR code**: dois colegas abrem a aba Amigos e um escaneia o QR do outro: a perereca-presente aparece.
