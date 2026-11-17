// Comunicação HTTP com o servidor (REST + JSON), com tempo limite e
// classificação de falhas: sem rede, servidor indisponível ou erro da API.
export class OfflineError extends Error { constructor(m = 'Sem conexão com a internet') { super(m); this.kind = 'offline'; } }
export class ServerDownError extends Error { constructor(m = 'Servidor indisponível') { super(m); this.kind = 'server-down'; } }
export class HttpError extends Error { constructor(status, m) { super(m); this.status = status; this.kind = 'http'; } }

export const api = {
  base: '',
  token: null,
  forcedOffline: false, // modo demonstração: simula o modo avião

  isOffline() { return this.forcedOffline || !navigator.onLine; },

  async request(method, path, body, { timeout = 8000 } = {}) {
    if (this.isOffline()) throw new OfflineError();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let res;
    try {
      res = await fetch(this.base + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal, cache: 'no-store',
      });
    } catch (e) {
      if (this.isOffline()) throw new OfflineError();
      throw new ServerDownError(e.name === 'AbortError' ? 'O servidor demorou demais para responder' : 'Não foi possível falar com o servidor');
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 || res.status === 502 || res.status === 504) throw new ServerDownError(data.error || 'Servidor indisponível');
    if (!res.ok) throw new HttpError(res.status, data.error || `Erro ${res.status}`);
    return data;
  },

  get(path, opts) { return this.request('GET', path, null, opts); },
  post(path, body, opts) { return this.request('POST', path, body, opts); },
};
