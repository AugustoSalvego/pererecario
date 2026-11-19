# Hospedagem e segurança dos dados

Este guia coloca o Pererecário no ar de graça e garante que os jogadores não percam o progresso.
São três peças, cada uma num serviço diferente (mais o login com o Google no passo 4 e o código por e-mail no passo 6, os dois opcionais e grátis):

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

1. **No celular (IndexedDB):** tudo o que ele fez e ainda não chegou ao servidor. O jogo pede ao navegador armazenamento permanente, para não ser apagado quando falta espaço. A fila só sai do celular quando o servidor confirma o recebimento; se a internet cair no meio, ela é reenviada sem duplicar nada.
2. **No servidor (Neon):** a cópia oficial. Entrando em qualquer celular, o jogador recebe tudo de volta.
3. **Nos backups (GitHub):** uma cópia do banco inteiro a cada 6 horas, guardada por 90 dias, fora do servidor e fora do banco.

O que pode fazer um jogador perder algo, e o que já protege:

| Risco | Proteção |
|---|---|
| O banco gratuito expirar ou ser apagado | Neon gratuito não expira; backups a cada 6 h no GitHub; restauração com um comando |
| O servidor reiniciar ou "dormir" | Os dados estão no banco, não no servidor. Sem `DATABASE_URL`, o servidor se recusa a subir, para não gravar num arquivo temporário |
| O banco reiniciar ou dormir com o servidor ligado | O servidor reabre a conexão sozinho (testado no GitHub contra um Postgres de verdade) |
| Alguém apagar dados por engano | Neon volta o banco para qualquer momento das últimas 6 horas; além disso, há os backups |
| Jogador sem internet | O jogo continua; a fila sincroniza quando a conexão voltar |
| Jogador esquecer a senha | Quem usa "Continuar com Google" não tem senha para esquecer. Para quem usa e-mail e senha, o próprio jogo resolve: "Esqueci a senha" → código no e-mail → senha nova (passo 6). Sem o Brevo, o organizador define uma senha nova no `/admin`. O progresso continua todo lá |
| Alguém criar conta com o e-mail de outra pessoa | Com o passo 6 feito, a conta só nasce depois do código que chega no e-mail. E o dono de verdade sempre recupera a conta pelo "Esqueci a senha" |
| Jogador trocar de celular ou perder o celular | É só entrar com e-mail e senha (ou com o Google) no outro aparelho |
| Sair da conta com ações não enviadas | O jogo avisa quantas operações ainda não chegaram e pede para esperar sincronizar |
| Limpar os dados do navegador antes de sincronizar | Esse é o único caso sem proteção: o que estava só na fila do celular se perde. Oriente os jogadores a não limpar o navegador durante o evento |

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
   - `ADMIN_KEY`: invente uma senha forte (é a do painel `/admin` e a do backup). Guarde;
   - `CARTO_KEY`: opcional; deixe vazio para usar o mapa do OpenStreetMap.
4. Espere o deploy terminar e abra `https://pererecario-xxxx.onrender.com/healthz`: tem de aparecer `ok`. Nos *Logs* do Render deve aparecer `banco: postgres`.
5. Abra a URL no celular, crie uma conta de teste e capture uma perereca. No `/admin` (com a `ADMIN_KEY`), a captura tem de aparecer.

### 3. Backup automático no GitHub (5 min)

1. No GitHub, abra o repositório → **Settings → Secrets and variables → Actions → New repository secret** e crie três segredos:
   - `GAME_URL`: a URL do jogo, por exemplo `https://pererecario-xxxx.onrender.com`;
   - `ADMIN_KEY`: a mesma do Render;
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
4. Em **Público** (ou na própria Tela de permissão), clique em **Publicar app** e confirme. O jogo só pede nome, e-mail e foto do perfil, e para isso o Google não exige verificação. Sem publicar, qualquer pessoa ainda consegue entrar, mas o Google mostra um aviso de "app em teste".
5. No Render, abra o serviço → **Environment** → **Add Environment Variable**: `GOOGLE_CLIENT_ID` = o ID copiado → **Save**. O servidor reinicia sozinho.
6. Abra o jogo: o botão "Continuar com Google" aparece em cima de "ou com e-mail". Entre com uma conta Google de teste.

Se um dia o endereço do jogo mudar (outro nome no Render ou um domínio próprio), adicione o endereço novo nas **Origens JavaScript autorizadas**; senão o botão do Google mostra um erro.

### 5. Antes do evento (checklist)

- [ ] `/healthz` responde `ok` e os logs dizem `banco: postgres`.
- [ ] Se fez o passo 6: no `/admin`, "Mandar e-mail de teste" chega; criar uma conta de teste com o código; testar o "Esqueci a senha".
- [ ] Uma conta de teste no celular: capturar, fechar o app, abrir de novo, conferir que continua lá.
- [ ] Modo avião: capturar duas pererecas, voltar a internet, conferir que chegaram ao `/admin`.
- [ ] Rodar o backup na mão (Actions → backup → Run workflow) e ver o ✅.
- [ ] Baixar um backup também pelo `/admin` ("Baixar backup agora") e guardar no computador.
- [ ] Testar a redefinição de senha no `/admin` com a conta de teste.
- [ ] Criar uma conta pelo **Continuar com Google** num Android e num iPhone, e outra com e-mail e senha.
- [ ] Gerar o QR code da URL para o público.

### 6. Código por e-mail com o Brevo (grátis, 15 min)

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

**Um jogador esqueceu a senha:** com o passo 6 feito, ele mesmo resolve no jogo: **Entrar → Esqueci a senha**. Se a conta é Gmail, também pode entrar com "Continuar com Google". Se nada disso der (o e-mail não chega, por exemplo), `/admin` → "Redefinir senha" → e-mail dele e uma senha nova (mínimo 8).

**O código não chega para ninguém:** no `/admin`, o topo mostra `E-mail (Brevo)` com as falhas e o último erro; use "Mandar e-mail de teste" e siga a tabela do passo 6. Enquanto isso, os jogadores podem criar conta pelo "Continuar com Google". Em último caso, apague `BREVO_API_KEY` no Render: o cadastro volta a funcionar sem código.

**Um jogador diz que perdeu capturas:** peça para ele abrir o jogo com internet e esperar a nuvem do topo ficar verde. Se ele tiver saído da conta ou limpado o navegador antes de sincronizar, o que estava só no celular não chegou ao servidor. No `/admin`, a tabela de operações mostra tudo o que chegou de cada aparelho.
