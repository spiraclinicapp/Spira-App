// Capturas del informe del primer mes — Spira
// Maneja Edge (canal msedge, headless — firmado por Microsoft, WDAC lo permite)
// contra el dev server local y guarda PNGs en ./capturas/.
//
// Uso:  SPIRA_EMAIL=<usuario> SPIRA_PASS=<clave> node capturas.mjs
// Requiere: npm i playwright-core  +  npm run dev corriendo en el puerto 5250.
//
// SOLO lectura contra la base REAL:
//  - jamás clickea: «Confirmar recepción», «Crear recepción», «Verificar», «Asociar y agregar»
//  - jamás entra al paso Escaneo de la rama base (escanear YA escribe assign_medication_to_protocol)
//  - jamás hoverea PrivacyAvatars (el tooltip nativo revela el nombre real del paciente)
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:5250';
const OUT = process.env.SPIRA_OUT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'capturas');
const EMAIL = process.env.SPIRA_EMAIL;
const PASS = process.env.SPIRA_PASS;
if (!EMAIL || !PASS) {
  console.error('Faltan SPIRA_EMAIL / SPIRA_PASS en el ambiente.');
  process.exit(1);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 2,
  locale: 'es-AR',
  colorScheme: 'light',
});
const page = await ctx.newPage();

const shot = async (name) => {
  await page.mouse.move(4, 880);      // mata tooltips/hover pendientes
  await page.waitForTimeout(700);     // deja asentar transiciones/fuentes
  await page.screenshot({ path: path.join(OUT, name), type: 'png' });
  console.log('OK  ' + name);
};
// Espera por innerText, case-insensitive: los eyebrows llevan text-transform:
// uppercase y innerText devuelve el texto YA transformado.
const waitAny = async (texts, timeout = 15000) => {
  await page.waitForFunction(
    (ts) => document.body && ts.some((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase())),
    texts,
    { timeout },
  );
};
const rail = (title) => page.locator(`button[title="${title}"]`);
const sub = (label) => page.locator('nav button', { hasText: label });
// Las options de los selects cargan async: esperar a que exista antes de elegir.
const selectByText = async (locator, contains) => {
  await page.waitForFunction((c) =>
    [...document.querySelectorAll('select option')].some((o) => o.textContent.includes(c)),
  contains, { timeout: 15000 });
  const val = await locator.evaluate((s, c) => {
    const o = [...s.options].find((o) => o.textContent.includes(c));
    return o ? o.value : null;
  }, contains);
  if (!val) throw new Error(`No hay opción que contenga «${contains}»`);
  await locator.selectOption(val);
};

try {
  // ---------- 01 · Login ----------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await waitAny(['Ingresá a tu cuenta']);
  await page.waitForTimeout(2500); // que el video del panel izquierdo muestre un cuadro
  await shot('01-login.png');

  // ---------- Login ----------
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await waitAny(['Tus módulos'], 25000);

  // ---------- 02 · Home ----------
  await waitAny(['Tu día']);
  await page.waitForTimeout(600);
  await shot('02-home.png');

  // ---------- Track ----------
  await rail('Spira Track').click();
  await waitAny(['Protocolos activos']);

  // ---------- 03 · Pacientes (lista con trackers) ----------
  await sub('Pacientes').click();
  await waitAny(['Ver pacientes']);
  await page.click('button:has-text("Ver pacientes")');
  await waitAny(['Todos los pacientes']);
  await page.waitForSelector('button:has-text("Abrir ficha")', { timeout: 15000 });
  await shot('03-pacientes.png');

  // ---------- 04 · Ficha de paciente con cronograma ----------
  // Localiza a la paciente por aria-label (no pinta el nombre) y clickea el
  // «Abrir ficha» de SU fila.
  let abrir = page.locator(
    'xpath=//span[@aria-label="Susana Rodriguez" or @aria-label="Susana Rodríguez"]' +
    '/ancestor::*[.//button[normalize-space()="Abrir ficha"]][1]' +
    '//button[normalize-space()="Abrir ficha"]',
  ).first();
  if (!(await abrir.count())) {
    console.log('AVISO: no encontré a la paciente sugerida; uso la primera ficha');
    abrir = page.locator('button:has-text("Abrir ficha")').first();
  }
  await abrir.click();
  await waitAny(['Cronograma de visitas']);
  await shot('04-cronograma-paciente.png');

  // ---------- 05 · Cronograma del protocolo (cuadro de visitas) ----------
  // Clickear el MISMO submódulo no remonta la vista (la ficha queda abierta):
  // se sale a Inicio y se vuelve a entrar para resetear el estado interno.
  await rail('Inicio').click();
  await waitAny(['Tus módulos']);
  await rail('Spira Track').click();
  await waitAny(['Protocolos activos']);
  await sub('Pacientes').click();
  await waitAny(['Ver pacientes']);
  await page.click('button:has-text("ACT18301")');
  await waitAny(['Cronograma'], 15000);
  await page.locator('button', { hasText: 'Cronograma' }).first().click();
  await waitAny(['Ventana', 'Sin cronograma']);
  await shot('05-cronograma-protocolo.png');

  // ---------- 06 · Alertas ----------
  await sub('Alertas').click();
  await waitAny(['Ventana vencida (roja)', 'Sin alertas']);
  await shot('06-alertas.png');

  // ---------- 07 · Visitas del día ----------
  await sub('Visitas').click();
  await waitAny(['En el centro', 'No hay visitas hoy']);
  await shot('07-visitas.png');

  // ---------- 08 · Para ver médico ----------
  await sub('Para ver médico').click();
  await waitAny(['Faltan atender', 'Nadie en la cola']);
  await shot('08-para-ver-medico.png');

  // ---------- Pharma ----------
  await rail('Spira Pharma').click();
  await page.waitForTimeout(1200); // Resumen de Pharma

  // ---------- 09 · Recepción (cola por día) ----------
  await sub('Recepción').click();
  await waitAny(['Verificada', 'Pendiente', 'Sin recepciones']);
  await shot('09-recepcion.png');

  // ---------- 10 · Wizard — paso Setup ----------
  await page.click('button:has-text("Nueva recepción")');
  await waitAny(['Tipo de recepción']);
  await page.waitForFunction(() => {
    const sels = document.querySelectorAll('select');
    return [...sels].some((s) => s.options.length > 1);
  }, { timeout: 15000 });
  await shot('10-recepcion-wizard.png');

  // ---------- 11 · IP — paso Carga general (temperatura + cantidad) ----------
  // Todo estado de cliente (verificado en el código): la única escritura de la
  // rama IP es «Confirmar recepción» (paso Cierre), que jamás se toca.
  await page.click('button:has-text("Producto Investigación")');
  await waitAny(['Carga general']);
  await selectByText(page.locator('select').first(), 'ACT18301');
  // coordinador responsable (aparece async al elegir protocolo)
  await page.waitForFunction(() => {
    const sels = [...document.querySelectorAll('select')];
    return sels.length >= 2 && [...sels[1].options].some((o) => !o.disabled && o.value);
  }, { timeout: 15000 });
  await page.locator('select').nth(1).evaluate((s) => {
    const o = [...s.options].find((o) => !o.disabled && o.value);
    s.value = o.value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('button:has-text("Siguiente")');
  await waitAny(['Control de temperatura al recibir']);
  await page.click('button:has-text("OK")');           // cadena de frío conforme (estado local)
  await page.fill('input[placeholder="0"]', '20');     // cantidad total de kits (estado local)
  await shot('11-ip-ingreso-macro.png');

  // salir SIN confirmar: Cancelar → modal «¿Descartar…?» → «Descartar»
  await page.click('button:has-text("Cancelar")');
  const descartar = page.locator('button:has-text("Descartar")');
  if (await descartar.count()) await descartar.first().click();
  await waitAny(['Verificada', 'Pendiente', 'Sin recepciones']);

  // ---------- 12 · Medicamentos — stock de base del protocolo ----------
  await sub('Medicamentos').click();
  await waitAny(['Medicación de base']);
  await selectByText(page.locator('select').first(), 'ACT18301');
  await waitAny(['En stock', 'Stock bajo', 'Sin stock', 'Sin medicamentos']);
  await shot('12-medicamentos-stock.png');

  // ---------- 13 · Medicamentos — stock IP (kits por protocolo) ----------
  // Cambiar de solapa resetea el selector de protocolo: hay que re-elegirlo.
  await page.click('button:has-text("Producto Investigación")');
  await waitAny(['Elegí un protocolo']);
  await selectByText(page.locator('select').first(), 'ACT18301');
  await waitAny(['kits en stock', 'Sin stock de IP']);
  await shot('13-ip-stock.png');

  console.log('LISTO: 13 capturas guardadas en ' + OUT);
} catch (e) {
  console.error('FALLO: ' + e.message);
  await page.screenshot({ path: path.join(OUT, '_debug-fallo.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
