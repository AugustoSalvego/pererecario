// Botão Voltar do celular (e o gesto de voltar do iPhone) dentro do jogo.
//
// Sem isto, o Voltar do navegador saía da página do jogo, mesmo com uma janela aberta. O jeito:
// deixar sempre uma "guarda" no histórico do navegador. O Voltar tira a guarda (evento popstate);
// o jogo fecha o que estiver aberto e põe a guarda de volta. No mapa, sem nada aberto, avisa
// "toque Voltar de novo para sair" e só deixa sair se o Voltar vier de novo em 2,5 s.
//
// A guarda só entra depois do primeiro toque do jogador: o Chrome ignora entradas de histórico
// criadas por uma página com que a pessoa ainda não interagiu.
import { toast } from './common.js';

const GUARD = { pererecario: 'voltar' };
let installed = false;
let guarded = false;
let exitTimer = null;

function arm() {
  if (guarded) return;
  history.pushState(GUARD, '');
  guarded = true;
}

export function installBack(action) {
  if (installed) return;
  installed = true;
  const firstTouch = () => { arm(); };
  document.addEventListener('pointerdown', firstTouch, { capture: true, once: true });
  window.addEventListener('popstate', () => {
    if (!guarded) return;   // não fomos nós (ou já liberou a saída)
    guarded = false;
    let r = 'done';
    try { r = action(); } catch (e) { console.warn('[voltar]', e); }
    if (r === 'exit') {
      // nada aberto: o próximo Voltar sai do jogo; se não vier em 2,5 s, a guarda volta
      toast('Toque em Voltar de novo para sair do jogo.', '', null, 2500);
      clearTimeout(exitTimer);
      exitTimer = setTimeout(arm, 2500);
      // qualquer toque no jogo também cancela a saída
      document.addEventListener('pointerdown', () => { clearTimeout(exitTimer); arm(); }, { capture: true, once: true });
      return;
    }
    arm();
  });
}
