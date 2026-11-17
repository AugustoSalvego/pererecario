# Pererecário 🐸 — Aventura no Campus

**PWA mobile-first** para explorar o Campus Luiz Meneghel da UENP, em Bandeirantes (PR), e colecionar 15 pererequinhas originais. A versão web funciona no celular e no computador, sem APK.

> **Estado em 17/11/2026:** pacote de implementação testável, **não publicado na internet**. A lógica principal e o backend passaram nos testes automatizados. Ainda são necessários testes de navegador/celular, validação física das zonas e implantação com HTTPS e armazenamento permanente. O código do Flutter anterior e as prévias foram preservados no repositório original.

## Executar localmente

Requisitos: **Python 3.11+** e navegador moderno (Chrome, Edge, Safari ou Firefox). **Não é preciso npm, Flutter nem banco externo.** O backend usa SQLite.

No Windows PowerShell, dentro desta pasta:

```powershell
py -3 -m server.server
```

Se `py` não existir, tente `python -m server.server`.

Abra **http://localhost:8000**. Crie um explorador, ative a localização e use o mapa.

Para testar **sem estar fisicamente no campus**, use **http://localhost:8000/?demo=1**. Esse modo só é habilitado em `localhost` ou `127.0.0.1`, usa um banco local separado e **não envia capturas ao servidor**. Clique em **Simular no campus**, toque numa perereca e fotografe. O modo oficial precisa de GPS real válido e proximidade de 35 m de um encontro na zona correta. GPS do navegador funciona em `localhost` ou em site HTTPS.

## Como jogar

- **Mapa:** cinco zonas geográficas com 3 espécies exclusivas cada, pontos de encontro por rodadas de 30 minutos, GPS e raio de 35 m. Os encontros são determinísticos; a espécie e o tamanho ficam fixos pelo encontro.
- **Captura:** alinhe a perereca e fotografe; depois de duas tentativas erradas, o jogo ajuda. Sem limite de tentativas ou fuga.
- **Álbum:** 15 espécies com silhuetas das não descobertas, peculiaridades animadas e raridades.
- **Meu Brejo:** exemplares individuais, tamanhos e favoritos.
- **Perfil:** pontuação, histórico, ranking e código privado de recuperação.
- **Offline:** cache da PWA + IndexedDB. A fila de captura é enviada quando a comunicação voltar; ao sincronizar, o mesmo evento não premia duas vezes.

Os pontos são calculados no servidor a partir das capturas aceitas: comum 10, incomum 20, rara 45, especial 120, mais 25 por primeira descoberta. Não são subtraídos pontos por estar offline.

## Arquitetura

| Camada | Implementação |
|---|---|
| Interface | HTML/CSS/JavaScript ES Modules, desenho original em atlas PNG e novo cenário pixel art WebP |
| PWA | `manifest.webmanifest` e `sw.js` com cache local do app-shell |
| Local | IndexedDB (`src/db.js`) e log de eventos, sempre persistido antes da recompensa visual |
| Geografia | Geolocalização Web (`watchPosition`), geofence ponto-em-polígono, mapa OSM online e fallback ilustrado offline |
| Servidor remoto | Python `http.server` + SQLite com WAL e índice único por encontro |
| Protocolo | HTTPS e API JSON (`/api/v1/register`, `/api/v1/sync`, `/api/v1/state`, `/api/v1/health`, `/api/v1/leaderboard`) |
| Sincronização | Fila pendente, retry periódico/ao reconectar, eventos imutáveis, UUID e resposta de confirmação |
| Conflitos | Mesmo encontro em aparelhos diferentes: primeira captura confirmada vence; favoritos: controle de versão por evento (`baseEventId`), versão confirmada do servidor vence colisões |
| Identificação | Nome + ID UUID + código de recuperação aleatório de 192 bits, necessário no segundo aparelho |

**Importante:** o código de recuperação é uma credencial. Não deve ser divulgado. Este MVP não usa login Google; proteção contra fraude de GPS e rate limit são extensões para produção pública de longo prazo.

## Implantação Web com HTTPS

1. Conecte o repositório ao serviço de hospedagem que permita Python, **disco persistente** e HTTPS (ex.: Render com plano e disco persistente). O `render.yaml` descreve um exemplo de serviço; **confira os preços atuais antes de ativar**.
2. O comando de execução é `python -m server.server`, porta definida por `PORT`, banco gravado em `DATA_DIR` montado num volume persistente.
3. Não use hospedagem com armazenamento efêmero para demonstrar recuperação após reiniciar o servidor: o banco SQLite precisa de persistência.
4. Abra o domínio HTTPS no celular e permita GPS. O mapa externo é um complemento: o cenário, zonas e jogo têm fallback local offline.
5. Use **Perfil → Código de recuperação** para restaurar os dados sincronizados em outro navegador/dispositivo. A sincronização só confirma quando o servidor responde.

### Limites e segurança

- **Zonas provisórias:** polígonos inspirados nas zonas acadêmicas do projeto público `Juuhgb/pokemon-campus`; são uma referência, não uma delimitação oficial da UENP. Revisar zonas e pontos de encontro com o campus antes de incentivar circulação. Não gerar capturas em locais restritos, rodovias ou terrenos de risco.
- Precisão do GPS melhor ou igual a **40 m** para iniciar um encontro; evitar permitir captura por geolocalização imprecisa.
- Service Worker armazena os arquivos do jogo após o primeiro acesso online. Os tiles de terceiros não são pré-baixados em massa; quando não aparecem, o cenário ilustrado permanece utilizável.
- Não há garantia de localização real em um computador sem GPS. Em alguns navegadores o GPS não funciona sem permissão/HTTPS.
- O servidor verifica duplicidade, posse de exemplar, categoria/zona e versões de favoritos, mas não oferece validação criptográfica de presença física no campus; para publicação pública com ranking competitivo, revisar o modelo antifraude.
- Não há suporte a trocas de exemplares nesta versão. Não é requisito obrigatório do enunciado.

## Testes

```bash
node --test tests/engine.test.mjs
python -m unittest discover -s tests -v
```

Os testes cobrem catálogo/zonas, determinismo, raridades, restrições de captura, reenvio idempotente, conflito do mesmo encontro, favoritos concorrentes, autenticação e HTTP real. **Testes manuais no smartphone com GPS e modo avião ainda são obrigatórios**: siga `docs/DEMONSTRACAO.md`.

## Estrutura

```text
assets/       atlas original, novo cenário pixel art, ícones da PWA
src/          game engine, mapa, IndexedDB, sincronização, interface
server/       servidor HTTP e banco SQLite
assets/species.json  catálogo com IDs originais
 data/campus.json    zonas geográficas provisórias
sw.js         cache offline e modo instalável
render.yaml   exemplo de deploy HTTPS com volume
```

## Autoria

**Danilo Augusto Salvego dos Santos**  
GitHub: [AugustoSalvego](https://github.com/AugustoSalvego)

Arte das 15 pererecas originais preservada do projeto Pererecário. Novo cenário pixel-art criado para a ambientação do jogo.
