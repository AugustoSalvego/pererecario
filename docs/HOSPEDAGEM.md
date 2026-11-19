# Hospedagem e segurança dos dados

Este guia coloca o Pererecário no ar de graça e garante que os jogadores não percam o progresso.
São três peças, cada uma num serviço diferente (mais o login com o Google no passo 4 e o código por e-mail no passo 7, os dois opcionais e grátis):

| Peça | Serviço | Para quê | Custo |
|---|---|---|---|
| Servidor (Node.js) | **Render** (web service) | entrega o jogo (PWA) e recebe a sincronização | grátis |
| Banco de dados (PostgreSQL) | **Neon** | guarda contas, capturas, trabalhos, vendas, compras | grátis, sem prazo de validade |
| Backup | **GitHub Actions** (deste repositório) | copia o banco inteiro a cada 6 horas, criptografado | grátis |
| Login com Google (opcional) | **Google Cloud** | botão "Continuar com Google" | grátis |
| Código por e-mail (opcional) | **Brevo** | confirma o e-mail no cadastro e manda o código do "Esqueci a senha" | grátis (300 e-mails por dia) |

## Com o que o jogo foi feito (e por que não Firebase)

- **Cliente:** PWA em HTML, CSS e JavaScript puros (sem framework), com **Service Worker** (o jogo abre sem internet) e **IndexedDB** (as capturas e ações feitas offline ficam numa fila no celular até chegar ao servidor).
- **Servidor:** Node.js 22 sem framework, com **PostgreSQL** em produção (pacote `pg`) e SQLite embutido para rodar no computador e nos testes.
- **Sincronização e conflitos:** escritas por nós (operações com id único, idempotência, "primeira captura vence", última escrita vence, contador por aparelho, saldo conferido no servidor). É exatamente o conteúdo do trabalho de Sistemas Distribuídos.

O Firebase faria a sincronização sozinho, por dentro, e esconderia justamente o que o trabalho precisa mostrar. Trocar agora também seria reescrever o servidor a poucos dias da apresentação. A combinação Render + Neon + backup no GitHub dá a mesma segurança de dados sem mudar o jogo.

## Onde ficam os dados de um jogador

1. **No celular, na fila (IndexedDB):** tudo o que ele fez e ainda não chegou ao servidor. O jogo pede ao navegador armazenamento permanente, para não ser apagado quando falta espaço. A fila só sai do celular quando o servidor confirma o recebimento; se a internet cair no meio, ela é reenviada sem duplicar nada. Sair da conta ou entrar com outra **não apaga** a fila: ela fica guardada no aparelho e volta quando a conta entrar de novo ali.
2. **No servidor (Neon):** a cópia oficial. Entrando em qualquer celular, o jogador recebe tudo de volta.
3. **Nos backups (GitHub):** uma cópia do banco inteiro a cada 6 horas, guardada por 90 dias, fora do servidor e fora do banco.
4. **No celular, no histórico:** o celular também guarda tudo o que o servidor já confirmou. A cada sincronização o servidor diz quantas ações daquele celular ele tem; se for menos do que o celular sabe que mandou (o banco foi restaurado de um backup, ou voltado no tempo), o celular reenvia o histórico e o servidor recupera só o que faltava, sem duplicar. Assim, mesmo num desastre, o que foi feito depois do último backup volta assim que os jogadores abrirem o jogo.

Para o jogador, o estado aparece no canto de cima: **ponto verde "Online"**, **ponto vermelho "Offline"** com quantas ações estão guardadas no celular, **"Sincronizando…"** quando a internet volta e **"Tudo salvo"** quando o servidor confirma. Tocando ali, o jogo explica em palavras.

**Teste de resistência** (`test/navegador/resistencia.py`): dois celulares na mesma conta fazem centenas de ações enquanto a internet cai e volta, o servidor cai, o app é fechado e reaberto, respostas se perdem no meio do caminho e o banco "volta no tempo" várias vezes. Em todas as rodadas, nenhuma captura faltou nem duplicou, e os dois celulares terminaram iguais ao servidor. Com a recuperação pelo histórico desligada, a mesma bateria perdeu 27 de 60 capturas, o que mostra que o teste pega o problema quando ele existe.

O que pode fazer um jogador perder algo, e o que já protege:

| Risco | Proteção |
|---|---|
| O banco gratuito expirar ou ser apagado | Neon gratuito não expira; backups a cada 6 h no GitHub; restauração com um comando |
| O servidor reiniciar ou "dormir" | Os dados estão no banco, não no servidor. Sem `DATABASE_URL`, o servidor se recusa a subir, para não gravar num arquivo temporário |
| O banco reiniciar ou dormir com o servidor ligado | O servidor reabre a conexão sozinho (testado no GitHub contra um Postgres de verdade) |
| Alguém apagar dados por engano | Neon volta o banco para qualquer momento das últimas 6 horas; além disso, há os backups |
| Jogador sem internet | O jogo continua; a fila sincroniza quando a conexão voltar |
| Jogador esquecer a senha | Quem usa "Continuar com Google" não tem senha para esquecer. Para quem usa e-mail e senha, o próprio jogo resolve: "Esqueci a senha" → código no e-mail → senha nova (passo 7). Sem o Brevo, o organizador define uma senha nova no `/admin`. O progresso continua todo lá |
| Alguém criar conta com o e-mail de outra pessoa | Com o passo 7 feito, a conta só nasce depois do código que chega no e-mail. E o dono de verdade sempre recupera a conta pelo "Esqueci a senha" |
| Jogador trocar de celular ou perder o celular | É só entrar com e-mail e senha (ou com o Google) no outro aparelho |
| Sair da conta (ou entrar com outra) com ações não enviadas | O jogo tenta mandar antes de sair. O que não subir **não é apagado**: fica guardado no celular, a tela de entrada mostra de qual conta é, e volta para a fila quando essa conta entrar de novo ali |
| O banco perder dados (restaurado de um backup ou voltado no tempo) | Os celulares percebem e reenviam o que o servidor perdeu (ver item 4 acima). Testado: sem isso, 27 de 60 capturas sumiam; com isso, nenhuma |
| O backup automático parar sozinho | Em repositório público, o GitHub desliga agendamentos depois de 60 dias sem commits; o próprio backup se religa a cada execução. O `/admin` mostra a hora do último backup automático e fica vermelho se passar de 8 horas |
| A sessão do jogador deixar de valer no servidor (por exemplo, se a `TOKEN_SECRET` do Render mudar) | O jogo pede para entrar de novo **sem apagar nada** do celular e mostra quantas ações estão esperando; entrando com a mesma conta, elas sobem (testado no navegador) |
| Alguém de fora entrar no painel `/admin` | A chave é sorteada pelo Render (longa e aleatória) e só você a vê. Sem uma chave de 12 ou mais caracteres, o painel fica desligado. Errou a chave 20 vezes em 10 minutos, aquele aparelho fica bloqueado |
| Acabar a cota grátis do Neon no mês | São 100 CU-horas por mês, umas 400 horas com o banco acordado; ele dorme depois de 5 minutos sem uso, e o servidor só acorda o banco quando alguém joga. Mesmo ligado o dia inteiro, do dia 20 ao fim de novembro dá menos de 300 horas. O uso aparece no painel do Neon (**Monitoring**) |
| Limpar os dados do navegador antes de sincronizar | Esse é o único caso sem proteção: o que estava só na fila do celular se perde (o que já subiu está salvo). Com internet, a fila sobe em segundos, então o risco é só de quem jogou offline e apagou os dados antes de conectar |
| iPhone: o Safari apaga dados de sites que ficam 7 dias sem ser abertos | Afeta só o que ainda não subiu e quem não instalou o jogo. Peça para os jogadores **adicionarem à Tela de Início** (Compartilhar → Adicionar à Tela de Início): aí o iPhone não apaga |

## Passo a passo

### 1. Banco no Neon (5 min)

1. Crie uma conta em [neon.com](https://neon.com) (pode entrar com o GitHub; o plano gratuito não pede cartão).
2. **New project** → nome `pererecario` → região **AWS US East 1 (N. Virginia)** (a mesma do servidor; banco e servidor juntos deixam o jogo mais rápido) → Postgres 16 ou mais novo.
3. Em **Connect**, copie a *connection string*. Ela começa com `postgresql://` e termina com `?sslmode=require`. É ela que vai no `DATABASE_URL`. Não precisa criar tabelas: o servidor cria sozinho.

### 2. Servidor no Render (10 min)

1. Crie uma conta em [render.com](https://render.com) (pode entrar com o GitHub).
2. **New → Blueprint** e escolha este repositório (branch `main`). O arquivo [`render.yaml`](../render.yaml) já descreve tudo.
3. O Render vai pedir três valores:
   - `DATABASE_URL`: a connection string do Neon;
   - `CARTO_KEY`: opcional; deixe vazio para usar o mapa do OpenStreetMap;
   - `GOOGLE_CLIENT_ID`, `BREVO_API_KEY`, `EMAIL_FROM`: opcionais, deixe vazios por enquanto (passos 4 e 7).

   O `ADMIN_KEY` (senha do painel `/admin` e do backup) e o `TOKEN_SECRET` (assina as sessões dos jogadores) o Render sorteia sozinho. **Nunca troque nem apague o `TOKEN_SECRET`**: todo mundo teria de entrar de novo (sem perder nada, mas é chato no meio do evento).
4. Espere o deploy terminar e abra `https://pererecario-xxxx.onrender.com/healthz`: tem de aparecer `ok`. Nos *Logs* do Render deve aparecer `banco: postgres`.
5. **Pegue a chave do painel:** no Render, abra o serviço → **Environment** → na linha `ADMIN_KEY`, clique no olho para ver e copie. Guarde junto com suas senhas. É com ela que você entra em `https://pererecario-xxxx.onrender.com/admin` (o navegador lembra depois da primeira vez).
6. Abra a URL no celular, crie uma conta de teste e capture uma perereca. No `/admin`, a captura tem de aparecer.

### 3. Backup automático no GitHub (5 min)

1. No GitHub, abra o repositório → **Settings → Secrets and variables → Actions → New repository secret** e crie três segredos:
   - `GAME_URL`: a URL do jogo, por exemplo `https://pererecario-xxxx.onrender.com`;
   - `ADMIN_KEY`: a mesma do Render (a que você copiou no passo 2.5);
   - `BACKUP_PASSWORD`: uma senha **só para os backups**. Guarde num lugar seguro (gerenciador de senhas, por exemplo): sem ela, o backup não abre.
2. Vá em **Actions → backup → Run workflow**. Em 1 ou 2 minutos aparece um ✅ e, dentro da execução, um arquivo `backup-...` em *Artifacts*. A partir daí ele roda sozinho a cada 6 horas.
3. **Atenção, o repositório é público:** qualquer pessoa logada no GitHub consegue baixar os arquivos de backup. Por isso eles saem criptografados (têm nomes de usuário e as senhas, guardadas embaralhadas com scrypt), e o workflow se recusa a rodar sem `BACKUP_PASSWORD`. Use uma senha **longa** (por exemplo, quatro ou cinco palavras aleatórias) e não a reaproveite em nenhum outro lugar. Se puder deixar o repositório privado depois da avaliação, melhor ainda.

### 4. Login com o Google (Google Cloud, grátis, 10 min)

O botão "Continuar com Google" só aparece depois deste passo; até lá o jogo funciona só com e-mail e senha. Não tem custo e não precisa de cartão.

1. Entre em [console.cloud.google.com](https://console.cloud.google.com) com a sua conta Google e crie um projeto chamado `Pererecario` (no seletor de projetos, no topo → **Novo projeto**).
2. No menu, abra **APIs e serviços → Tela de permissão OAuth** (em algumas contas aparece como **Google Auth Platform**) e clique em **Começar**:
   - nome do app: `Pererecário`; e-mail de suporte: o seu;
   - público: **Externo**;
   - e-mail de contato: o seu; aceite os termos e conclua.
3. Em **Clientes** (ou **Credenciais → Criar credenciais → ID do cliente OAuth**): tipo **Aplicativo da Web**, nome `Pererecario web`. Em **Origens JavaScript autorizadas**, adicione:
   - `https://pererecario-xxxx.onrender.com` (o endereço exato do jogo, sem barra no fim);
   - `http://localhost:8080` (para testar no computador).
   Não precisa de "URIs de redirecionamento". Clique em **Criar** e copie o **ID do cliente** (termina em `.apps.googleusercontent.com`). Ele não é segredo: aparece na página do jogo. A "chave secreta do cliente" não é usada.
4. Em **Branding**, complete o que o Google pede para publicar (sem isso o botão "Publicar app" fica cinza):
   - **Página inicial do aplicativo:** `https://pererecario-xxxx.onrender.com`
   - **Link da Política de Privacidade:** `https://pererecario-xxxx.onrender.com/privacidade.html`
   - **Link dos Termos de Serviço:** `https://pererecario-xxxx.onrender.com/termos.html`
   - **Domínios autorizados:** `pererecario-xxxx.onrender.com` (o endereço sem `https://`; o `onrender.com` sozinho não vale, porque é de todos os sites do Render)
   - **Não envie logotipo:** com logotipo, o Google exige uma verificação de marca que leva semanas.
   As duas páginas já existem no jogo (`client/privacidade.html` e `client/termos.html`) e mostram como contato o e-mail que manda os códigos (`EMAIL_FROM`), ou `CONTACT_EMAIL` se você definir essa variável no Render.
5. Em **Público** (ou na própria Tela de permissão), clique em **Publicar app** e confirme. O jogo só pede nome, e-mail e foto do perfil, e para isso o Google não exige verificação. **Não pule este item:** enquanto o app está "em teste", só as contas cadastradas como usuários de teste conseguem entrar com o Google.
6. No Render, abra o serviço → **Environment** → **Edit** → **+ Add Environment Variable**: Key `GOOGLE_CLIENT_ID`, Value = o ID copiado → **Save and deploy**. O servidor reinicia sozinho.
7. Abra o jogo: o botão "Continuar com Google" aparece em cima de "ou com e-mail". Entre com uma conta Google de teste.

Se um dia o endereço do jogo mudar (outro nome no Render ou um domínio próprio), adicione o endereço novo nas **Origens JavaScript autorizadas**; senão o botão do Google mostra um erro.

### 5. Conta de demonstração e conta de administrador

São duas coisas diferentes:

- **Administrador = o painel `/admin`.** Não é uma conta do jogo: é uma página protegida pela `ADMIN_KEY`, que só você tem. Por ela você vê todos os jogadores e capturas, baixa backup, define senha nova para quem esqueceu, testa o e-mail e simula a queda do servidor na apresentação. Os jogadores não têm como entrar sem a chave.
- **Demonstração = uma conta normal do jogo, só sua.** No celular, **Criar conta** com o seu e-mail e uma senha que você não usa em nenhum outro lugar (com o passo 7 feito, chega o código no e-mail). Ninguém mais entra nela, porque só você sabe a senha. Depois, no `/admin` → "Conta de demonstração", escreva o e-mail dela e clique em **Marcar como organização**. Com isso:
  - ela some do ranking dos outros jogadores (você continua se vendo no seu ranking, para mostrar na apresentação);
  - ela não entra na contagem de **Jogadores externos** do painel, que é o número para o resultado de engajamento do dia 25/11;
  - ela continua aparecendo no mapa para quem estiver perto (bom para mostrar "jogadores juntos").

Para os testes da apresentação use **a mesma conta de demonstração** nos dois celulares (o roteiro explica por quê). Se quiser, marque também as contas de colegas que ajudarem nos testes.

### 6. Antes do evento (checklist)

- [ ] `/healthz` responde `ok` e os logs dizem `banco: postgres`.
- [ ] O `/admin` abre com a `ADMIN_KEY` do Render (e **não** abre com `brejo-admin`).
- [ ] A conta de demonstração foi criada e marcada como organização; ela entra nos dois celulares.
- [ ] Se fez o passo 7: no `/admin`, "Mandar e-mail de teste" chega; criar uma conta de teste com o código; testar o "Esqueci a senha".
- [ ] Uma conta de teste no celular: capturar, fechar o app, abrir de novo, conferir que continua lá.
- [ ] Modo avião: capturar duas pererecas, voltar a internet, conferir que chegaram ao `/admin`.
- [ ] Rodar o backup na mão (Actions → backup → Run workflow) e ver o ✅.
- [ ] Baixar um backup também pelo `/admin` ("Baixar backup agora") e guardar no computador.
- [ ] Testar a redefinição de senha no `/admin` com a conta de teste.
- [ ] Criar uma conta pelo **Continuar com Google** num Android e num iPhone, e outra com e-mail e senha.
- [ ] Gerar o QR code da URL para o público.

### 7. Código por e-mail com o Brevo (grátis, 15 min)

Com este passo, criar conta com e-mail e senha passa a pedir um **código de 6 números** que chega no e-mail (ninguém consegue criar conta com o e-mail de outra pessoa), e aparece o **"Esqueci a senha"** que funciona sozinho: código no e-mail → senha nova. Enquanto ele não estiver feito, o cadastro funciona como antes, sem código, e nada quebra.

O Brevo manda até **300 e-mails por dia** no plano gratuito, sem cartão. Cada cadastro gasta 1 ou 2 e-mails; o servidor para em 280 por dia para sobrar margem.

**Antes de começar: qual e-mail vai ser o remetente.** O ideal é criar um Gmail só do jogo (por exemplo `pererecario.jogo@gmail.com`), em vez de usar o seu pessoal. Os jogadores vão ver o nome **Pererecário**.

1. **Conta no Brevo.** Entre em [brevo.com](https://www.brevo.com) → **Sign up free** (pode usar a conta Google). Ele pede seu nome, um nome de empresa (coloque `Pererecário`), site (o endereço do jogo no Render) e endereço; pode pedir para confirmar o celular por SMS. Na escolha de plano, fique no **Free**.
2. **Remetente.** Clique no seu nome (canto de cima, à direita) → **Senders, Domains & Dedicated IPs** → aba **Senders** → **Add sender**:
   - *From name*: `Pererecário`;
   - *From email*: o Gmail do jogo.
   Salve. O Brevo manda um código de 6 números para esse Gmail: abra o Gmail, copie o código, cole no Brevo e clique em **Verify sender**.
3. **Chave da API.** Seu nome → **Settings** → **SMTP & API** → aba **API Keys** (às vezes "API Keys & MCP") → **Generate a new API key**, nome `pererecario-render`. Se ele perguntar o acesso, **Full** funciona; se preferir **Restricted**, deixe ligado só o envio de e-mails transacionais (*Transactional emails*). Copie a chave (começa com `xkeysib-`): ela só aparece uma vez. Ela **é segredo**: não coloque no GitHub nem mande para ninguém.
4. **Desligar o bloqueio por IP.** Seu nome → **Settings** → **Security** → **Authorized IPs**. Em *Blocking unauthorized IP addresses*, na linha **API keys**, clique em **Deactivate blocking**. Por quê: o Render gratuito muda o endereço de onde o servidor sai para a internet, e o Brevo passaria a recusar os e-mails (às vezes só semanas depois, sem aviso). A chave secreta continua protegendo a conta.
5. **No Render**, abra o serviço → **Environment** → **Add Environment Variable** e crie:
   - `BREVO_API_KEY` = a chave copiada no item 3;
   - `EMAIL_FROM` = o Gmail do jogo, **exatamente** o mesmo verificado no item 2.
   **Save**. O servidor reinicia sozinho.
6. **Testar.** Abra o `/admin`: no topo deve aparecer `E-mail (Brevo): ligado`. Em "Dados dos jogadores", escreva o seu e-mail e clique em **Mandar e-mail de teste**. Deve chegar em menos de 1 minuto. Se falhar, a mensagem mostra o motivo (veja a tabela abaixo).
7. **No jogo:** crie uma conta com e-mail e senha. Aparece a tela "Confira seu e-mail" e o código chega. Depois teste **Entrar → Esqueci a senha**.

**Sobre o spam (importante).** Gmail, Outlook e Yahoo só confiam de verdade em e-mails mandados de um domínio próprio (do tipo `contato@pererecario.com.br`). Como o remetente é um Gmail, o Brevo troca o endereço por um dele (termina em `@brevosend.com`), mantendo o nome Pererecário, e parte dos e-mails pode cair no **spam** ou em **Promoções**. Por isso a tela do código já avisa: "Não chegou? Olhe no spam". Para o evento isso basta. Se o jogo continuar depois, vale comprar um domínio (cerca de R$ 40 por ano no registro.br) e autenticá-lo no Brevo (**Senders, Domains & Dedicated IPs → Domains → Add a domain**): aí os e-mails chegam na caixa de entrada.

| O teste do `/admin` diz | O que fazer |
|---|---|
| `O e-mail está desligado` | Faltou `BREVO_API_KEY` ou `EMAIL_FROM` no Render (item 5) |
| `Brevo respondeu 401` com `Key not found` | A chave foi copiada errada ou pela metade: gere outra (item 3) |
| `Brevo respondeu 401` com `unrecognised IP address` | Desligue o bloqueio por IP (item 4) |
| `Brevo respondeu 400` falando de `sender` | `EMAIL_FROM` não é o remetente verificado (item 2), ou a verificação não terminou |
| `Brevo respondeu 403` ou fala de conta não ativada | A conta ainda está sendo liberada pelo Brevo. Espere algumas horas; se continuar, fale com o suporte deles (chat em brevo.com) |
| Enviado, mas não chegou | Olhe o spam e as Promoções. No Brevo, **Transactional → Logs** mostra se o e-mail saiu e se foi entregue |

## No dia do evento

- O servidor gratuito do Render "dorme" depois de 15 minutos sem acesso e leva cerca de 1 minuto para acordar. O jogo continua funcionando offline nesse tempo e sincroniza depois, mas o **primeiro login** de um jogador novo espera o servidor acordar. Abra o jogo uns minutos antes de começar.
- Para não ter essa espera durante a semana do evento, dá para mudar o servidor para o plano *Starter* do Render (US$ 7 por mês, cobrado proporcionalmente aos dias de uso) e voltar para o grátis depois. Não é necessário para os dados ficarem seguros.
- O banco do Neon também "dorme" depois de 5 minutos sem uso e acorda sozinho na primeira consulta, em poucos instantes.

## Se der problema

**Alguém apagou ou estragou dados há poucas horas:** no Neon, **Restore** → escolha um momento das últimas 6 horas. É o caminho mais rápido.

**O banco sumiu ou é preciso mudar de banco:**

1. Crie um banco novo (no Neon, por exemplo) e troque o `DATABASE_URL` no Render (*Environment*). O servidor cria as tabelas sozinho.
2. Baixe o backup mais recente em **Actions → backup → (última execução) → Artifacts** e descompacte o `.zip` (dentro tem um `pererecario-AAAA-MM-DD_HHMM.json.gz.enc`).
3. No computador, na pasta do projeto (com `npm install` feito uma vez), rode:
   ```
   BACKUP_PASSWORD="a senha dos backups" DATABASE_URL="postgresql://...(o banco novo)..." node scripts/restaurar_backup.js pererecario-AAAA-MM-DD_HHMM.json.gz.enc
   ```
   No Windows (PowerShell): `$env:BACKUP_PASSWORD="..."; $env:DATABASE_URL="..."; node scripts/restaurar_backup.js arquivo`.
4. O script mostra quantas linhas restaurou de cada tabela. Ele só acrescenta, então pode rodar de novo sem duplicar nada. O que os jogadores fizeram depois do backup e ainda estava na fila dos celulares chega sozinho na próxima sincronização.

Para conferir um backup sem mexer no banco de verdade, rode o mesmo comando **sem** `DATABASE_URL`: ele restaura num arquivo local (`data/pererecario.db`).

**Um jogador esqueceu a senha:** com o passo 7 feito, ele mesmo resolve no jogo: **Entrar → Esqueci a senha**. Se a conta é Gmail, também pode entrar com "Continuar com Google". Se nada disso der (o e-mail não chega, por exemplo), `/admin` → "Redefinir senha" → e-mail dele e uma senha nova (mínimo 8).

**O código não chega para ninguém:** no `/admin`, o topo mostra `E-mail (Brevo)` com as falhas e o último erro; use "Mandar e-mail de teste" e siga a tabela do passo 7. Enquanto isso, os jogadores podem criar conta pelo "Continuar com Google". Em último caso, apague `BREVO_API_KEY` no Render: o cadastro volta a funcionar sem código.

**Um jogador diz que perdeu capturas:** peça para ele abrir o jogo com internet e esperar a nuvem do topo ficar verde. Se ele tiver saído da conta ou limpado o navegador antes de sincronizar, o que estava só no celular não chegou ao servidor. No `/admin`, a tabela de operações mostra tudo o que chegou de cada aparelho.
