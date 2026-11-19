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
const db = await openDb();
const app = await createApp({ db });
const server = app.server();

server.listen(port, () => {
  console.log(`Pererecário ${VERSION} rodando em http://localhost:${port}  (banco: ${db.kind})`);
  if (!process.env.ADMIN_KEY) console.log('Aviso: ADMIN_KEY não definida; usando a chave padrão "brejo-admin".');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    server.close();
    await db.close();
    process.exit(0);
  });
}
