# Roteiro de apresentação — Sistemas Distribuídos e Computação Ubíqua

**Apenas marcar um cenário como concluído quando for executado no dispositivo real.**

| Requisito do professor | Demonstração prática |
|---|---|
| Web adaptada ao celular e toque | Abrir por HTTPS no Android/iOS; tocar em Mapa, Álbum, Meu Brejo e Perfil |
| Computação ubíqua | GPS real marca a posição; a zona e a distância alteram a disponibilidade da captura |
| Comunicação e dados remotos | Registrar jogador, fotografar online, verificar `/api/v1/leaderboard` e SQLite no servidor |
| Perda de conexão | Com o jogo aberto, desligar Wi-Fi e dados; observar aviso Offline e continuar captura em encontro já iniciado |
| Funcionalidades offline | Demonstrar mapa ilustrado, catálogo, minijogo de fotografia e coleção sem requests ao servidor |
| Persistência offline | Capturar, fechar completamente a página ou PWA, abrir novamente sem internet e mostrar Meu Brejo |
| Sincronização automática | Reconectar com o jogo aberto, acompanhar pendências no Perfil e confirmar envio |
| Outro dispositivo | Copiar código de recuperação; entrar no celular 2 e recuperar os dados do servidor |
| Servidor indisponível | Temporariamente parar o backend com o cliente aberto; a interface mostra 'Servidor fora' e captura continua local; religar e esperar sincronizar |
| Falha na transmissão | Bloquear endpoint de sync ou simular timeout; reenvio automático não pode duplicar captura |
| Reenvio do mesmo evento | `python -m unittest tests.test_http_flow -v` mostra `duplicate` e uma única captura no servidor |
| Mesmo encontro em dois dispositivos | O servidor aceita primeira captura com `encounterId` e rejeita a segunda com `conflict`; pontuação não dobra |
| Favorito editado offline em dois aparelhos | Ambas edições partem do mesmo `baseEventId`; o servidor mantém a primeira confirmada, registra conflito e reconcilia UI |
| Engajamento externo | Mostrar número de IDs de jogadores registrados no servidor (`GET /api/v1/health` retorna `players`). IDs são aproximação de usuários, não identidades verificadas |

## Observações para a apresentação

- A criação do perfil é possível offline, mas a recuperação no segundo aparelho depende de a primeira instalação já ter sincronizado com o servidor.
- O Service Worker precisa ser instalado no primeiro acesso online; testar isso antes do dia da apresentação.
- Nem todos os smartphones oferecem GPS suficientemente preciso em salas internas. Testar ao ar livre e permitir concluir um encontro iniciado se o sinal cair depois.
- A sobreposição de captura é uma ilustração, **não uma câmera real**. A presença contextual é comprovada pelo GPS.
- Em produção é necessário HTTPS e disco persistente. `localhost` funciona para testes no próprio computador, mas o telefone precisa acessar uma URL HTTPS publicada.
- Para testar longe do campus, há `?demo=1` apenas em localhost. Ele não permite pontuação remota.
- Validar polígonos e pontos dos cursos caminhando pelo campus antes de distribuir ao público. As áreas podem precisar de ajuste para pátios seguros.

## Política de resolução de conflitos

- Capturas são eventos imutáveis com UUID. Uma operação retransmitida com o mesmo UUID retorna `duplicate`; um UUID diferente para o mesmo encontro retorna `conflict`, sem segunda recompensa. O servidor guarda um único encontro por jogador.
- Favoritos são alterações sobre exemplares identificados pelo ID de captura. Cada alteração carrega o último evento conhecido (`baseEventId`). Se duas edições concorrentes chegam com a mesma base, a primeira confirmada fica, e a outra retorna `conflict`. O cliente utiliza os eventos confirmados para recuperar o estado canônico.
- O cliente mostra capturas pendentes como progresso provisório offline. Se um conflito posterior rejeitar uma captura duplicada de dois aparelhos, a tela é reconciliada com os eventos confirmados, e mostra aviso de conflito.
