// Envio de e-mail pelo Brevo (plano gratuito: 300 e-mails por dia, sem cartão).
// Usado só para mandar o código de 6 números (confirmar cadastro e "esqueci a senha").
// Sem BREVO_API_KEY e EMAIL_FROM no servidor, não há carteiro e o cadastro funciona sem código.
// Passo a passo: docs/HOSPEDAGEM.md (passo 6).

export class MailError extends Error {}

export function makeBrevoMailer({ apiKey, from, fromName = 'Pererecário', fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  if (!apiKey || !from) throw new Error('Brevo: faltam BREVO_API_KEY e EMAIL_FROM');
  return async function send({ to, subject, text, html }) {
    let res;
    try {
      res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { email: from, name: fromName }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new MailError(`Brevo fora do ar ou sem resposta: ${e.message}`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new MailError(`Brevo respondeu ${res.status}: ${detail.slice(0, 300)}`);
    }
    return true;
  };
}

export function mailerFromEnv(env = process.env) {
  if (!env.BREVO_API_KEY || !env.EMAIL_FROM) return null;
  return makeBrevoMailer({ apiKey: env.BREVO_API_KEY, from: env.EMAIL_FROM, fromName: env.EMAIL_FROM_NAME || 'Pererecário' });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// O e-mail com o código. O código vai também no assunto: aparece direto na notificação do celular.
export function codeEmail({ code, purpose, displayName = '', minutes = 15 }) {
  if (purpose === 'test') {
    return {
      subject: 'Teste do Pererecário: o envio de e-mails está funcionando',
      text: 'Este é um e-mail de teste mandado pelo painel /admin do Pererecário.\n\nSe ele chegou, os códigos de cadastro e de "esqueci a senha" também vão chegar.\nSe caiu no spam, marque como "não é spam".\n\n🐸 Pererecário',
      html: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:Arial,Helvetica,sans-serif;color:#1f3a1c;padding:16px"><p style="font-size:18px;font-weight:bold">🐸 Pererecário: teste do e-mail</p><p>Este é um e-mail de teste mandado pelo painel /admin.</p><p>Se ele chegou, os códigos de cadastro e de "esqueci a senha" também vão chegar. Se caiu no spam, marque como "não é spam".</p></body></html>',
    };
  }
  const signup = purpose === 'signup';
  const hello = displayName ? `Oi, ${displayName}!` : 'Oi!';
  const what = signup ? 'Para terminar de criar sua conta no Pererecário, digite este código no jogo:'
    : 'Para criar uma senha nova no Pererecário, digite este código no jogo:';
  const ignore = signup ? 'Se você não está criando uma conta, pode ignorar este e-mail: nada será criado.'
    : 'Se não foi você que pediu, pode ignorar este e-mail: sua senha continua a mesma.';
  const subject = `${code} é o seu código do Pererecário`;
  const text = `${hello}\n\n${what}\n\n${code}\n\nO código vale por ${minutes} minutos.\n\n${ignore}\n\n🐸 Pererecário`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#eef7e6;font-family:Arial,Helvetica,sans-serif;color:#1f3a1c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef7e6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#ffffff;border-radius:16px;border:2px solid #b9df9f">
<tr><td style="background:#58b04a;border-radius:14px 14px 0 0;padding:16px 20px;color:#ffffff;font-size:20px;font-weight:bold">🐸 Pererecário</td></tr>
<tr><td style="padding:22px 20px 8px;font-size:16px;line-height:1.45">
<p style="margin:0 0 10px">${esc(hello)}</p>
<p style="margin:0 0 16px">${esc(what)}</p>
<div style="font-size:34px;font-weight:bold;letter-spacing:8px;text-align:center;background:#f3fbe9;border:2px dashed #8fd16f;border-radius:12px;padding:14px 0;color:#2f6b28">${esc(code)}</div>
<p style="margin:16px 0 0;font-size:14px;color:#4a6a45">O código vale por ${minutes} minutos.</p>
</td></tr>
<tr><td style="padding:14px 20px 20px;font-size:13px;color:#6c8a66;line-height:1.4">${esc(ignore)}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
