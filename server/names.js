// Apelidos: limpeza e unicidade.
//
// Regra: dois jogadores não podem ter o mesmo apelido, comparado exatamente como aparece na
// tela. Maiúscula/minúscula e acento fazem diferença ("Duzão", "duzão" e "Duzao" são três nomes
// diferentes). Antes de comparar, o nome é limpo para que nomes que *parecem* iguais também
// sejam iguais por dentro:
//   - NFC: "ã" pode chegar como um caractere só ou como "a" + "~" (depende do teclado);
//     o NFC junta tudo na forma de um caractere só.
//   - caracteres invisíveis (espaço de largura zero, marcas de direção do texto, controle)
//     são removidos, para ninguém criar "Duzão" + caractere invisível e se passar por outro.
//   - espaços nas pontas saem e espaços repetidos viram um só.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g;

export const cleanName = (s) => String(s || '').normalize('NFC').replace(INVISIBLE, '').trim().replace(/\s+/g, ' ');

export const NAME_TAKEN = 'Esse apelido já está em uso. Escolha outro.';

// Erro do banco por apelido repetido (índice único em players.name_key), no SQLite e no Postgres.
export const isNameConflict = (e) => /name_key/.test(`${e?.constraint || ''} ${e?.message || ''}`);

// Contas criadas antes da regra: cada apelido ganha a sua chave (name_key). Se já havia nomes
// repetidos, só a conta mais antiga fica com a chave; as outras continuam com o nome que têm,
// sem chave, e ninguém novo consegue pegar aquele nome. Roda ao abrir o banco e só mexe em quem
// ainda não tem chave.
export async function backfillNameKeys(db) {
  const rows = await db.query('SELECT id, display_name FROM players WHERE name_key IS NULL ORDER BY created_at, id');
  if (!rows.length) return { keyed: 0, duplicates: 0 };
  const used = new Set((await db.query('SELECT name_key FROM players WHERE name_key IS NOT NULL')).map((r) => r.name_key));
  let keyed = 0, duplicates = 0;
  for (const r of rows) {
    const k = cleanName(r.display_name);
    if (!k || used.has(k)) { duplicates++; continue; }
    try {
      await db.run('UPDATE players SET name_key=$1 WHERE id=$2 AND name_key IS NULL', [k, r.id]);
      used.add(k);
      keyed++;
    } catch (e) {
      if (!isNameConflict(e)) throw e;
      duplicates++;
    }
  }
  return { keyed, duplicates };
}
