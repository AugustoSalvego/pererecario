import { openDb } from './db.js';
import { createApp, VERSION } from './app.js';

const port = Number(process.env.PORT || 8080);

// Proteção dos dados: hospedado (Render, ou NODE_ENV=production) e sem DATABASE_URL, o servidor
// cairia num arquivo SQLite local, que é apagado quando o serviço reinicia ou dorme. Melhor não subir.
const hosted = !!process.env.RENDER || process.env.NODE_ENV === 'production';
if (hosted && !process.env.DATABASE_URL && process.env.ALLOW_SQLITE !== '1') {
  console.error('ERRO: DATABASE_URL não definida. Hospedado, o banco tem de ser um PostgreSQL permanente');
  console.error('(veja docs/HOSPEDAGEM.md). Sem isso os dados dos jogadores seriam perdidos ao reiniciar.');
  process.exit(1);
}
// O painel /admin e o backup dão acesso a todos os dados: hospedado, só com uma chave forte.
// A chave padrão "brejo-admin" está no código público, então não vale fora do computador local.
const key = process.env.ADMIN_KEY || '';
const weakKey = key.length < 12 || key === 'brejo-admin';

const db = await openDb();
const app = await createApp({ db, ...(hosted && weakKey ? { adminKey: null } : {}) });
const server = app.server();

server.listen(port, () => {
  console.log(`Pererecário ${VERSION} rodando em http://localhost:${port}  (banco: ${db.kind})`);
  if (hosted && weakKey) {
    console.error('AVISO: ADMIN_KEY ausente ou curta demais (precisa de 12 ou mais caracteres).');
    console.error('O jogo funciona, mas o painel /admin e o backup automático ficam DESLIGADOS até você definir uma no Render.');
  } else if (!process.env.ADMIN_KEY) console.log('Aviso: ADMIN_KEY não definida; usando a chave padrão "brejo-admin" (só no computador local).');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    server.close();
    await db.close();
    process.exit(0);
  });
}
