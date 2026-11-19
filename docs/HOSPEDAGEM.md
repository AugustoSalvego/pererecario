# Hospedagem e segurança dos dados

Este guia coloca o Pererecário no ar de graça e garante que os jogadores não percam o progresso.
São três peças, cada uma num serviço diferente:

| Peça | Serviço | Para quê | Custo |
|---|---|---|---|
| Servidor (Node.js) | **Render** (web service) | entrega o jogo (PWA) e recebe a sincronização | grátis |
| Banco de dados (PostgreSQL) | **Neon** | guarda contas, capturas, trabalhos, vendas, compras | grátis, sem prazo de validade |
| Backup | **GitHub Actions** (deste repositório) | copia o banco inteiro a cada 6 horas, criptografado | grátis |

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
| Jogador esquecer a senha (não há e-mail) | No `/admin`, o organizador define uma senha nova; o progresso continua todo lá |
| Jogador trocar de celular ou perder o celular | É só entrar com usuário e senha no outro aparelho |
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

### 4. Antes do evento (checklist)

- [ ] `/healthz` responde `ok` e os logs dizem `banco: postgres`.
- [ ] Uma conta de teste no celular: capturar, fechar o app, abrir de novo, conferir que continua lá.
- [ ] Modo avião: capturar duas pererecas, voltar a internet, conferir que chegaram ao `/admin`.
- [ ] Rodar o backup na mão (Actions → backup → Run workflow) e ver o ✅.
- [ ] Baixar um backup também pelo `/admin` ("Baixar backup agora") e guardar no computador.
- [ ] Testar a redefinição de senha no `/admin` com a conta de teste.
- [ ] Gerar o QR code da URL para o público.

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

**Um jogador esqueceu a senha:** `/admin` → "Redefinir senha" → usuário dele e uma senha nova.

**Um jogador diz que perdeu capturas:** peça para ele abrir o jogo com internet e esperar a nuvem do topo ficar verde. Se ele tiver saído da conta ou limpado o navegador antes de sincronizar, o que estava só no celular não chegou ao servidor. No `/admin`, a tabela de operações mostra tudo o que chegou de cada aparelho.
