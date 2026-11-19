// Restaura um backup do Pererecário num banco (o mesmo ou um novo).
//
// Uso:
//   DATABASE_URL="postgresql://..." node scripts/restaurar_backup.js arquivo
//   (sem DATABASE_URL, restaura no SQLite local data/pererecario.db, bom para conferir o backup)
//
// O arquivo pode ser:
//   - backup.json                 baixado no painel /admin ("Baixar backup agora")
//   - backup.json.gz              compactado
//   - pererecario-....json.gz.enc o que o GitHub Actions guarda todo dia (criptografado):
//                                 informe a senha em BACKUP_PASSWORD
//
// A restauração só acrescenta: o que já existe no banco fica como está. Pode rodar de novo sem medo.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { openDb } from '../server/db.js';
import { importAll } from '../server/backup.js';

// mesmo formato do comando "openssl enc -aes-256-cbc -pbkdf2 -salt" usado no backup automático
function decrypt(buf, password) {
  if (buf.subarray(0, 8).toString('latin1') !== 'Salted__') throw new Error('Arquivo criptografado num formato desconhecido');
  const salt = buf.subarray(8, 16);
  const kiv = crypto.pbkdf2Sync(password, salt, 10000, 48, 'sha256');
  const d = crypto.createDecipheriv('aes-256-cbc', kiv.subarray(0, 32), kiv.subarray(32, 48));
  try {
    return Buffer.concat([d.update(buf.subarray(16)), d.final()]);
  } catch {
    throw new Error('Senha do backup errada (BACKUP_PASSWORD)');
  }
}

const file = process.argv[2];
if (!file) {
  console.error('Uso: node scripts/restaurar_backup.js <arquivo do backup>');
  process.exit(1);
}
let buf = fs.readFileSync(file);
if (file.endsWith('.enc')) {
  if (!process.env.BACKUP_PASSWORD) {
    console.error('Esse backup é criptografado: rode de novo com BACKUP_PASSWORD="a senha" na frente do comando.');
    process.exit(1);
  }
  buf = decrypt(buf, process.env.BACKUP_PASSWORD);
}
if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
const data = JSON.parse(buf.toString('utf8'));

const db = await openDb();
console.log(`Backup de ${new Date(data.createdAt).toLocaleString('pt-BR')} (versão ${data.version || '?'}), banco de destino: ${db.kind}`);
console.log('No backup:', Object.entries(data.counts || {}).map(([k, v]) => `${k} ${v}`).join(', '));
const added = await importAll(db, data);
console.log('Linhas acrescentadas:', Object.entries(added).map(([k, v]) => `${k} ${v}`).join(', '));
await db.close();
console.log('Pronto.');
