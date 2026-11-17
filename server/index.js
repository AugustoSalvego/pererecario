import { openDb } from './db.js';
import { createApp, VERSION } from './app.js';

const port = Number(process.env.PORT || 8080);
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
