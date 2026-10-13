/* ============================================================================
   El cursor dibujado. Playwright graba la pantalla SIN puntero: sin esto, en el video las cosas se abren solas
   y no se ve dónde se tocó. Se inyecta con `addInitScript`, así vive en cada página que se cargue durante la
   grabación, y sigue a los eventos de mouse reales que dispara `page.mouse` (por eso los clics del guion van
   por el mouse y no por `locator.click()`, que no lo mueve).

   Colores de la marca: puntero en tinta con borde papel, y al hacer clic un aro petróleo que se abre y se
   apaga (corto, como el resto del movimiento de Sereno). Es un string porque corre en el navegador, no acá.
   ============================================================================ */

export const SCRIPT_CURSOR = `
(() => {
  if (window.__cursorSpira) return; window.__cursorSpira = true;
  const montar = () => {
    const css = document.createElement('style');
    css.textContent = \`
      #cursor-spira { position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 2147483647;
        pointer-events: none; transform: translate(-100px, -100px); transition: transform 16ms linear; }
      .aro-spira { position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
        border: 2px solid rgba(15, 95, 87, .55); z-index: 2147483646; pointer-events: none;
        animation: aroSpira .5s ease-out forwards; }
      @keyframes aroSpira { from { transform: scale(.4); opacity: 1 } to { transform: scale(1.3); opacity: 0 } }\`;
    document.head.appendChild(css);
    const c = document.createElement('div');
    c.id = 'cursor-spira';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 3l7 17 2.5-7.5L21 10z" fill="#14302E" stroke="#F4F1EA" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    addEventListener('mousedown', (e) => {
      const a = document.createElement('div'); a.className = 'aro-spira';
      a.style.left = e.clientX + 'px'; a.style.top = e.clientY + 'px';
      document.body.appendChild(a); setTimeout(() => a.remove(), 600);
    }, true);
  };
  if (document.body) montar(); else addEventListener('DOMContentLoaded', montar);
})();
`
