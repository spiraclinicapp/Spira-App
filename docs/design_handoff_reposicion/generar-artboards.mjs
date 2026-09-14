// Arma los artboards del mock de «Compras del mes que viene» (plan de reposición) con los valores
// literales del código de Spira: tokens.css, reportes/estilos.ts (card, sectionHead, th/td, subLine),
// ReportesView (Filtros, chip, chipActivo, Aviso), buttons.ts y PatientMedicationsCard.
// Datos inventados: estudios, pacientes y cantidades NO son de producción.
//
//   node docs/design_handoff_reposicion/generar-artboards.mjs docs/design_handoff_reposicion
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2]
mkdirSync(OUT, { recursive: true })

const T = {
  ink: '#14302E', primary: '#0F5F57', paper: '#F4F1EA', surface: '#FBFAF6', white: '#FFFFFF',
  muted: '#61706C', faint: '#838C89', inkSoft: '#465A57', line: '#E4DECF', line2: '#D8CBB0',
  good: '#5C8A5A', warn: '#B0823F', danger: '#A6483B', onAccent: '#F4F1EA',
  deepWarn: '#6E5620', deepDanger: '#A6483B', deepGood: '#3D6B3B', deepTrack: '#0F5F57',
}
const PH = T.primary // pharma-solid
const DISPLAY = "'Schibsted Grotesk', system-ui, sans-serif"
const CONTENT = 1185 // ancho de contenido en la notebook de referencia (1536×864)

// —— Íconos Lucide (trazo 1.8, como Icon.tsx) ——
const I = {
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
}
const closeTags = (s) => s.replace(/<(\w+)([^>]*?)\/>/g, '<$1$2></$1>')
const ic = (n, s = 16, c = T.ink, w = 1.8, extra = '') =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" style="flex: 0 0 auto; display: block;${extra}">${closeTags(I[n])}</svg>`

const page = (inner, bg = T.paper) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@500;600;700;800&amp;family=Inter:wght@400;500;600;700&amp;display=swap">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: ${bg}; font-family: 'Inter', system-ui, sans-serif; font-size: 14px; color: ${T.ink}; -webkit-font-smoothing: antialiased; }
    a { color: ${T.primary}; }
    a:hover { color: #0B4A42; }
    .mono { font-variant-numeric: tabular-nums; }
  </style>
</helmet>
${inner}
</x-dc>
</body>
</html>
`

// —— Piezas de Estadísticas (reportes/estilos.ts y ReportesView) ——
const wrap = (inner, w = CONTENT) => `<div style="width: ${w + 48}px; padding: 24px;">${inner}</div>`

/** sectionHead + sectionTitle + sectionRule + sectionHint (estilos.ts:53-64), sin margen arriba. */
const seccion = (titulo, hint, derecha = '') => `<div style="display: flex; align-items: center; gap: 12px; margin: 0 0 12px;">
  <h2 style="font-family: ${DISPLAY}; font-size: 16.5px; font-weight: 700; letter-spacing: -0.01em; margin: 0; color: ${T.ink};">${titulo}</h2>
  <div style="flex: 1; height: 1px; background: ${T.line};"></div>
  ${hint ? `<div style="font-size: 12px; color: ${T.inkSoft};">${hint}</div>` : ''}
  ${derecha}
</div>`

/** Botón chico con borde (modalHeaderBtn de PatientMedicationsCard): 32 de alto, radio 10. */
const btnChico = (texto, icono = '', extra = '') => `<div style="height: 32px; border-radius: 10px; border: 1px solid ${T.line2}; background: ${T.white}; font-size: 12.5px; font-weight: 600; color: ${T.ink}; display: inline-flex; align-items: center; gap: 6px; padding: 0 11px; flex: 0 0 auto;${extra}">${icono}${texto}</div>`
const btnPrimary = (texto, bg = PH, h = 40) => `<div style="height: ${h}px; padding: 0 16px; border-radius: 10px; background: ${bg}; color: ${T.onAccent}; font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto;">${texto}</div>`
const btnOutline = (texto, h = 40) => `<div style="height: ${h}px; padding: 0 16px; border-radius: 10px; border: 1px solid ${T.line2}; background: ${T.white}; color: ${T.ink}; font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto;">${texto}</div>`
const linkMudo = (t) => `<span style="font-weight: 600; font-size: 12.5px; color: ${T.muted};">${t}</span>`

const demoraBtn = (dias) => btnChico(dias ? `Demora de compra: <span class="mono">${dias}</span> días` : 'Cargar la demora de compra', ic('clock', 14, PH), dias ? '' : ` border-color: ${T.line2};`)

/** Línea del plazo: tranquila cuando hay tiempo. */
const plazoOk = (texto) => `<div style="display: flex; align-items: center; gap: 9px; margin: 0 0 12px; font-size: 13px; color: ${T.inkSoft};">
  ${ic('calendar', 15, PH)}<span>${texto}</span>
</div>`
/** Aviso de ReportesView (surface + line-2 + acc-deep-warn), para cuando ya es tarde. */
const aviso = (texto) => `<div style="display: flex; gap: 9px; align-items: flex-start; margin: 0 0 12px; padding: 11px 14px; background: ${T.surface}; border: 1px solid ${T.line2}; border-radius: 10px; font-size: 12.5px; line-height: 1.5; color: ${T.deepWarn};">
  ${ic('alert', 15, T.deepWarn, 1.9, ' margin-top: 2px;')}<span>${texto}</span>
</div>`

// —— La tabla (th/td de estilos.ts) ——
const COLS = 'grid-template-columns: minmax(0, 1fr) 230px 118px 118px 132px 44px;'
const th = (t, align = 'left') => `<div style="padding: 12px 16px 9px; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.inkSoft}; white-space: nowrap; text-align: ${align};">${t}</div>`
const cabecera = (mes) => `<div style="display: grid; ${COLS} border-bottom: 1px solid ${T.line2};">
  ${th('Medicamento')}${th('Cómo se repone')}${th(`Quedan al 1/${mes}`, 'center')}${th('En camino', 'center')}${th('A comprar', 'right')}<div></div>
</div>`

const estudio = ({ codigo, nombre, resumen, pausado = false }) => `<div style="display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: ${T.surface}; border-bottom: 1px solid ${T.line};">
  <span class="mono" style="font-size: 13px; font-weight: 700; color: ${T.ink};">${codigo}</span>
  <span style="font-size: 12.5px; color: ${T.muted};">${nombre}</span>
  ${pausado ? `<span style="font-size: 10.5px; font-weight: 600; padding: 2px 9px; border-radius: 999px; color: ${T.deepWarn}; background: rgba(176, 130, 63, 0.20);">Estudio pausado</span>` : ''}
  <span style="margin-left: auto; font-size: 12px; color: ${T.inkSoft};">${resumen}</span>
</div>`

const avisoLinea = (texto, tono = 'warn') => {
  const c = tono === 'warn' ? T.deepWarn : T.inkSoft
  const n = tono === 'warn' ? 'alert' : 'info'
  return `<div style="display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 11.5px; color: ${c};">${ic(n, 13, c, 1.9)}<span>${texto}</span></div>`
}
const num = (t, color = T.ink) => `<span class="mono" style="font-size: 14px; color: ${color};">${t}</span>`
const guion = `<span style="color: ${T.muted};">—</span>`
const aComprar = (n) => `<span class="mono" style="font-family: ${DISPLAY}; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: ${T.ink};">${n}</span>`
const alcanza = `<span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: ${T.deepGood};">${ic('check', 14, T.deepGood, 2)}Alcanza</span>`
const cargar = btnChico('Cargar', ic('pencil', 13, PH))

const renglon = ({ nombre, presentacion, avisos = '', como, comoSub = '', quedan, camino, compra, abierto = false, ultimo = false, apagado = false }) => `<div style="display: grid; ${COLS} align-items: center; ${ultimo && !abierto ? '' : `border-bottom: 1px solid ${T.line};`}${abierto ? ` background: ${T.surface};` : ''}">
  <div style="padding: 13px 16px; min-width: 0;${apagado ? ' opacity: 0.85;' : ''}">
    <div style="font-size: 14px; color: ${T.ink}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nombre}</div>
    <div style="font-size: 11.5px; color: ${T.inkSoft}; margin-top: 2px;">${presentacion}</div>
    ${avisos}
  </div>
  <div style="padding: 13px 16px;">
    <div style="font-size: 13px; color: ${apagado ? T.muted : T.ink};">${como}</div>
    ${comoSub ? `<div style="font-size: 11.5px; color: ${T.inkSoft}; margin-top: 2px;">${comoSub}</div>` : ''}
  </div>
  <div style="padding: 13px 16px; text-align: center;">${quedan}</div>
  <div style="padding: 13px 16px; text-align: center;">${camino}</div>
  <div style="padding: 13px 16px; text-align: right;">${compra}</div>
  <div style="display: grid; place-items: center;">${ic(abierto ? 'chevronUp' : 'chevronDown', 16, T.muted)}</div>
</div>`

const noSeCompran = (texto) => `<div style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; font-size: 12px; color: ${T.inkSoft}; border-bottom: 1px solid ${T.line};">
  <span style="flex: 1; min-width: 0;">${texto}</span>${linkMudo('Ver')}${ic('chevronDown', 14, T.muted)}
</div>`

const card = (inner) => `<div style="background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px; overflow: hidden;">${inner}</div>`

/** Lo que sigue debajo, apagado: el lugar de la card dentro de Estadísticas (D28). */
const debajo = `<div style="margin-top: 28px; opacity: 0.45;">
  <div style="display: flex; gap: 10px; align-items: center; padding: 2px 0 15px; border-bottom: 1px solid ${T.line}; margin-bottom: 10px;">
    <div style="height: 40px; width: 250px; border: 1px solid ${T.line2}; border-radius: 10px; background: ${T.white}; display: flex; align-items: center; gap: 8px; padding: 0 12px; font-size: 14px;">${ic('calendar', 15, PH)}<span class="mono">01/09/2026 → 05/09/2026</span></div>
    <div style="display: inline-flex; gap: 7px;">
      <span style="height: 34px; padding: 0 14px; border-radius: 999px; font-size: 13px; font-weight: 600; background: ${T.white}; border: 1px solid ${T.line2}; color: ${T.muted}; display: inline-flex; align-items: center;">30 días</span>
      <span style="height: 34px; padding: 0 14px; border-radius: 999px; font-size: 13px; font-weight: 600; background: rgba(15, 95, 87, 0.10); border: 1px solid rgba(15, 95, 87, 0.35); color: ${T.deepTrack}; display: inline-flex; align-items: center;">Mes en curso</span>
      <span style="height: 34px; padding: 0 14px; border-radius: 999px; font-size: 13px; font-weight: 600; background: ${T.white}; border: 1px solid ${T.line2}; color: ${T.muted}; display: inline-flex; align-items: center;">Año</span>
    </div>
    <span style="width: 1px; height: 24px; background: ${T.line};"></span>
    ${btnChico('Protocolo', ic('file', 14, PH), ' height: 34px; border-radius: 999px;')}
    <div style="margin-left: auto;">${btnPrimary(`${ic('printer', 16, T.onAccent)}Imprimir informe completo`)}</div>
  </div>
  <div style="display: flex; align-items: center; gap: 12px; margin: 28px 0 12px;">
    <h2 style="font-family: ${DISPLAY}; font-size: 16.5px; font-weight: 700; letter-spacing: -0.01em; margin: 0;">Resumen del período</h2>
    <div style="flex: 1; height: 1px; background: ${T.line};"></div>
  </div>
</div>`

// ═══════════════════════════ Forma A (descartada) · Inventario por estudio ═══════════════════════════
const formaA = page(wrap(
  seccion('Compras para octubre', 'A hoy, 05/09 · no depende del período', demoraBtn(20))
  + plazoOk('Pedí antes del <strong style="color: ' + T.ink + ';">11/09</strong> para que llegue antes del 1/10.')
  + card(
    cabecera(10)
    + estudio({ codigo: 'ASM-2301', nombre: 'Asma moderada a severa', resumen: '2 para comprar · 1 alcanza' })
    + renglon({
      nombre: 'Seretide 250/50', presentacion: 'Aerosol (IDM)',
      avisos: avisoLinea('1 lote vence el 20/10'),
      como: '1 por mes', comoSub: '10 pacientes', quedan: num(4), camino: guion, compra: aComprar(6),
    })
    + renglon({
      nombre: 'Salbutamol 100 mcg', presentacion: 'Aerosol (IDM)',
      como: 'Tener siempre 3', comoSub: 'A demanda', quedan: num(1), camino: guion, compra: aComprar(2),
    })
    + renglon({
      nombre: 'Budesonida 200 mcg', presentacion: 'Inhalador de polvo seco',
      como: '1 por mes', comoSub: '4 pacientes', quedan: num(9), camino: guion, compra: alcanza,
    })
    + estudio({ codigo: 'ASM-2410', nombre: 'Asma leve persistente', resumen: '1 para comprar · 1 alcanza' })
    + renglon({
      nombre: 'Seretide 250/50', presentacion: 'Aerosol (IDM)',
      como: '1 por mes', comoSub: '3 pacientes', quedan: num(1), camino: guion, compra: aComprar(2),
    })
    + renglon({
      nombre: 'Salbutamol 100 mcg', presentacion: 'Aerosol (IDM)',
      como: 'Tener siempre 2', comoSub: 'A demanda', quedan: num(2), camino: guion, compra: alcanza,
    })
    + estudio({ codigo: 'EPOC-118', nombre: 'EPOC con exacerbaciones', resumen: '1 sin cargar', pausado: true })
    + renglon({
      nombre: 'Montelukast 10 mg', presentacion: 'Comprimido oral',
      como: 'Sin cargar', comoSub: 'Todavía no suma', quedan: num(12), camino: guion, compra: cargar, apagado: true,
    })
    + noSeCompran('2 no se compran: Placebo inhalador · Tiotropio 18 mcg')
  )
  + debajo,
))

// ═══════════════════════════ Forma B · piezas de la card por estudio ═══════════════════════════
const envases = (n) => `<span style="font-family: ${DISPLAY}; font-size: 13px; font-weight: 600; color: ${T.muted};">${n === 1 ? 'envase' : 'envases'}</span>`
/** Renglón de compra: nombre · porqué (+ avisos) · número (o estado en camino) · abrir. */
const compraFila = ({ nombre, presentacion, porque, avisos = '', n = null, estado = '', abierto = false, ultimo = false }) => `<div style="display: flex; align-items: center; gap: 20px; padding: 13px 20px; ${ultimo && !abierto ? '' : `border-bottom: 1px solid ${T.line};`}${abierto ? ` background: ${T.surface};` : ''}">
  <div style="flex: 0 0 280px; min-width: 0;">
    <div style="font-size: 14px; color: ${T.ink};">${nombre}</div>
    <div style="font-size: 11.5px; color: ${T.inkSoft}; margin-top: 2px;">${presentacion}</div>
  </div>
  <div style="flex: 1; min-width: 0;">
    <div style="font-size: 12.5px; color: ${T.inkSoft};">${porque}</div>
    ${avisos}
  </div>
  <div style="flex: 0 0 150px; display: flex; align-items: baseline; justify-content: flex-end; gap: 6px;">
    ${n !== null ? `${aComprar(n)}${envases(n)}` : estado}
  </div>
  ${ic(abierto ? 'chevronUp' : 'chevronDown', 16, T.muted)}
</div>`
/** D40: el renglón con pedido se queda, con «en camino» en lugar del número. */
const enCamino = (n, sub, tono = 'normal') => `<div style="text-align: right;">
  <div style="font-size: 13.5px; font-weight: 600; color: ${T.ink};"><span class="mono">${n}</span> en camino</div>
  <div style="font-size: 11.5px; margin-top: 2px; color: ${tono === 'warn' ? T.deepWarn : T.inkSoft}; white-space: nowrap;">${sub}</div>
</div>`
const pieEstudio = (partes) => `<div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 10px 20px; background: ${T.surface}; border-top: 1px solid ${T.line}; font-size: 12px; color: ${T.inkSoft};">${partes.join(`<span style="width: 1px; height: 14px; background: ${T.line2};"></span>`)}</div>`
const cardEstudio = ({ codigo, nombre, derecha, cuerpo, pie, pausado = false }) => `<div style="background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px; overflow: hidden;">
  <div style="display: flex; align-items: center; gap: 10px; padding: 14px 20px 12px; border-bottom: 1px solid ${T.line};">
    <span class="mono" style="font-family: ${DISPLAY}; font-size: 15px; font-weight: 700; color: ${T.ink};">${codigo}</span>
    <span style="font-size: 12.5px; color: ${T.muted};">${nombre}</span>
    ${pausado ? `<span style="font-size: 10.5px; font-weight: 600; padding: 2px 9px; border-radius: 999px; color: ${T.deepWarn}; background: rgba(176, 130, 63, 0.20);">Estudio pausado</span>` : ''}
    <span style="margin-left: auto; font-size: 12.5px; color: ${T.ink}; font-weight: 600;">${derecha}</span>
  </div>
  ${cuerpo}
  ${pie}
</div>`

// ═══════════════════════════ Forma C · Lista de compras por medicamento ═══════════════════════════
const COLS_C = 'grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) 118px 150px 44px;'
const chipEstudio = (codigo, n, extra = '') => `<span style="display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid ${T.line}; background: ${T.surface}; font-size: 12px; color: ${T.inkSoft};${extra}"><span class="mono" style="font-weight: 600; color: ${T.ink};">${codigo}</span><span class="mono">${n}</span></span>`
const filaC = ({ nombre, presentacion, estudios, avisos = '', camino, total, ultimo = false }) => `<div style="display: grid; ${COLS_C} align-items: center; ${ultimo ? '' : `border-bottom: 1px solid ${T.line};`}">
  <div style="padding: 13px 16px; min-width: 0;">
    <div style="font-size: 14px; color: ${T.ink};">${nombre}</div>
    <div style="font-size: 11.5px; color: ${T.inkSoft}; margin-top: 2px;">${presentacion}</div>
    ${avisos}
  </div>
  <div style="padding: 13px 16px; display: flex; gap: 6px; flex-wrap: wrap;">${estudios}</div>
  <div style="padding: 13px 16px; text-align: center;">${camino}</div>
  <div style="padding: 13px 16px; text-align: right; display: flex; align-items: baseline; justify-content: flex-end; gap: 5px;">${aComprar(total)}<span style="font-family: ${DISPLAY}; font-size: 13px; font-weight: 600; color: ${T.muted};">env.</span></div>
  <div style="display: grid; place-items: center;">${ic('chevronDown', 16, T.muted)}</div>
</div>`
const pendiente = (icono, color, texto, accion = '') => `<div style="display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-top: 1px solid ${T.line}; font-size: 13px; color: ${T.ink};">
  ${ic(icono, 15, color, 1.9)}<span style="flex: 1; min-width: 0;">${texto}</span>${accion}
</div>`

const formaC = page(wrap(
  seccion('Compras para octubre', 'A hoy, 05/09 · no depende del período', demoraBtn(20))
  + plazoOk('Pedí antes del <strong style="color: ' + T.ink + ';">11/09</strong> para que llegue antes del 1/10.')
  + card(
    `<div style="display: grid; ${COLS_C} border-bottom: 1px solid ${T.line2};">
      ${th('Medicamento')}${th('Para qué estudio')}${th('En camino', 'center')}${th('A comprar', 'right')}<div></div>
    </div>`
    + filaC({ nombre: 'Seretide 250/50', presentacion: 'Aerosol (IDM)', estudios: chipEstudio('ASM-2301', 6) + chipEstudio('ASM-2410', 2), avisos: avisoLinea('1 lote de ASM-2301 vence el 20/10'), camino: guion, total: 8 })
    + filaC({ nombre: 'Salbutamol 100 mcg', presentacion: 'Aerosol (IDM) · a demanda', estudios: chipEstudio('ASM-2301', 2), camino: guion, total: 2, ultimo: true }),
  )
  + `<div style="margin-top: 12px; background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px; overflow: hidden;">
    <div style="padding: 12px 16px 10px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: ${T.inkSoft};">Fuera de la lista</div>
    ${pendiente('pencil', T.deepWarn, '<strong>1 sin cargar</strong> <span style="color: ' + T.inkSoft + ';">· Montelukast 10 mg (EPOC-118, pausado) todavía no suma.</span>', cargar)}
    ${pendiente('check', T.deepGood, '<span style="color: ' + T.inkSoft + ';">Alcanzan:</span> Budesonida 200 mcg (ASM-2301) · Salbutamol 100 mcg (ASM-2410)', linkMudo('Ver'))}
    ${pendiente('info', T.inkSoft, '<span style="color: ' + T.inkSoft + ';">No se compran:</span> Placebo inhalador · Tiotropio 18 mcg (EPOC-118)', linkMudo('Ver'))}
  </div>`
  + debajo,
))

// ═══════════════════════════ 2 · Un renglón abierto ═══════════════════════════
const cuentaLinea = (label, valor, { fuerte = false, borde = false } = {}) => `<div style="display: flex; align-items: baseline; gap: 12px; padding: 5px 0;${borde ? ` border-top: 1px solid ${T.line2}; margin-top: 4px; padding-top: 9px;` : ''}">
  <span style="flex: 1; font-size: 13px; color: ${fuerte ? T.ink : T.inkSoft};${fuerte ? ' font-weight: 600;' : ''}">${label}</span>
  <span class="mono" style="font-size: ${fuerte ? 15 : 13.5}px; color: ${T.ink};${fuerte ? ' font-weight: 700;' : ''}">${valor}</span>
</div>`
const rotulo = (t) => `<div style="font-size: 10.5px; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase; color: ${T.inkSoft}; margin-bottom: 8px;">${t}</div>`
const avisoItem = (texto, tono = 'info', accion = '') => {
  const c = tono === 'warn' ? T.deepWarn : T.inkSoft
  return `<div style="display: flex; gap: 8px; align-items: flex-start; padding: 7px 0; font-size: 12.5px; line-height: 1.45; color: ${tono === 'warn' ? T.deepWarn : T.ink};">
  ${ic(tono === 'warn' ? 'alert' : 'info', 14, c, 1.9, ' margin-top: 2px;')}<span style="flex: 1; min-width: 0;">${texto}</span>${accion}
</div>`
}

// ═══════════════════════════ 3 · Cargar cómo se repone ═══════════════════════════
const seg = (opciones, activa) => `<div style="display: inline-flex; gap: 7px;">${opciones.map((o) => `<span style="height: 34px; padding: 0 14px; border-radius: 999px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; ${o === activa ? `background: rgba(15, 95, 87, 0.10); border: 1px solid rgba(15, 95, 87, 0.35); color: ${T.deepTrack};` : `background: ${T.white}; border: 1px solid ${T.line2}; color: ${T.muted};`}">${o}</span>`).join('')}</div>`
const label = (t) => `<div style="font-size: 12.5px; font-weight: 600; color: ${T.muted}; margin-bottom: 6px;">${t}</div>`
const inputNum = (v, sufijo, w = 96) => `<div style="display: inline-flex; align-items: center; gap: 10px;">
  <div class="mono" style="width: ${w}px; height: 44px; border: 1px solid ${T.line2}; border-radius: 10px; background: ${T.white}; display: flex; align-items: center; padding: 0 14px; font-size: 14px; color: ${T.ink}; box-shadow: 0 5px 14px rgba(20, 48, 46, 0.10); transform: translateY(-1px);">${v}</div>
  <span style="font-size: 13px; color: ${T.inkSoft};">${sufijo}</span>
</div>`

const cargaDemanda = page(wrap(
  card(
    `<div style="padding: 16px 16px 18px; background: ${T.surface};">
      <div style="font-size: 14px; color: ${T.ink}; margin-bottom: 12px;">Salbutamol 100 mcg <span style="font-size: 11.5px; color: ${T.inkSoft};">· Aerosol (IDM) · ASM-2301</span></div>
      <div style="display: flex; gap: 32px; align-items: flex-end; flex-wrap: wrap;">
        <div>${label('Cómo se repone')}${seg(['Por mes', 'A demanda', 'No se compra'], 'A demanda')}</div>
        <div>${label('Tener siempre en el estante')}${inputNum('3', 'envases')}</div>
      </div>
      <div style="font-size: 12.5px; color: ${T.inkSoft}; margin-top: 12px;">Para lo que no se usa todos los meses, como el rescate. No mira pacientes ni visitas.</div>
      <div style="display: flex; gap: 8px; margin-top: 16px;">${btnPrimary('Guardar')}${btnOutline('Cancelar')}</div>
    </div>`,
  ),
  560,
))

const cargaNo = page(wrap(
  card(
    `<div style="padding: 16px 16px 18px; background: ${T.surface};">
      <div style="font-size: 14px; color: ${T.ink}; margin-bottom: 12px;">Placebo inhalador <span style="font-size: 11.5px; color: ${T.inkSoft};">· Aerosol (IDM) · ASM-2301</span></div>
      <div>${label('Cómo se repone')}${seg(['Por mes', 'A demanda', 'No se compra'], 'No se compra')}</div>
      <div style="font-size: 12.5px; color: ${T.inkSoft}; margin-top: 12px;">Lo manda el sponsor o no se repone. Queda plegado al pie del estudio, fuera de la cuenta.</div>
      <div style="display: flex; gap: 8px; margin-top: 16px;">${btnPrimary('Guardar')}${btnOutline('Cancelar')}</div>
    </div>`,
  ),
  560,
))

// ═══════════════════════════ 5 · Ya es tarde, con pedidos en camino ═══════════════════════════
const caminoCelda = (n, sub, tono = 'normal') => `<div style="display: flex; flex-direction: column; align-items: center;">
  <span class="mono" style="font-size: 14px; color: ${T.ink};">${n}</span>
  <span style="font-size: 11px; color: ${tono === 'warn' ? T.deepWarn : T.inkSoft}; margin-top: 2px; white-space: nowrap;">${sub}</span>
</div>`
const pedidoFila = (fecha, cant, recibido, extra = '') => `<div style="display: grid; grid-template-columns: 120px 110px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid ${T.line}; font-size: 12.5px;">
  <span class="mono" style="color: ${T.ink};">Pedido ${fecha}</span>
  <span class="mono" style="color: ${T.ink};">${cant} envases</span>
  <span style="color: ${T.inkSoft};">${recibido}</span>
  ${extra || linkMudo('Anular')}
</div>`

// ═══════════════════════════ 6 · Estados ═══════════════════════════
const estadoCard = (icono, color, titulo, texto, accion = '') => page(wrap(
  seccion('Compras para octubre', 'A hoy, 05/09', '')
  + card(`<div style="display: flex; align-items: center; gap: 14px; padding: 22px 24px;">
    <span style="width: 52px; height: 52px; border-radius: 14px; background: ${color === T.danger ? 'rgba(166, 72, 59, 0.10)' : 'rgba(15, 95, 87, 0.08)'}; display: grid; place-items: center; flex: 0 0 auto;">${ic(icono, 22, color, 1.9)}</span>
    <div style="flex: 1; min-width: 0;">
      <div style="font-family: ${DISPLAY}; font-size: 17px; font-weight: 700; color: ${T.ink};">${titulo}</div>
      <div style="font-size: 13.5px; color: ${T.muted}; margin-top: 3px; line-height: 1.45;">${texto}</div>
    </div>
    ${accion}
  </div>`),
  720,
))
const cargando = estadoCard('cart', PH, 'Calculando las compras…', 'Un momento. El resto del informe sigue cargando por su lado.')
const error = estadoCard('alert', T.danger, 'No se pudieron calcular las compras', 'El informe del período no se ve afectado.', btnOutline(`${ic('refresh', 15, T.ink)}Reintentar`))

// ═══════════════════════════ 7 · Demora de compra ═══════════════════════════
const demora = page(`<div style="width: 492px; padding: 32px;">
  <div style="background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px; box-shadow: 0 12px 32px rgba(20, 48, 46, 0.10);">
    <div style="display: flex; align-items: center; gap: 12px; padding: 22px 24px 14px;">
      <div style="flex: 1; font-family: ${DISPLAY}; font-weight: 700; letter-spacing: -0.02em; font-size: 20px; color: ${T.ink};">Demora de compra</div>
      <span style="width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; flex: 0 0 auto;">${ic('x', 17, T.muted)}</span>
    </div>
    <div style="padding: 0 24px 22px;">
      <p style="font-size: 13px; color: ${T.muted}; line-height: 1.5; margin: 0 0 14px;">Cuántos días pasan desde que se pide hasta que llega. Vale para todos los estudios y define la fecha límite para pedir.</p>
      ${label('Días')}${inputNum('20', 'días')}
      <div style="display: flex; gap: 10px; margin-top: 18px;">${btnOutline('Cancelar')}<div style="flex: 1;"></div>${btnPrimary('Guardar')}</div>
    </div>
  </div>
</div>`)

// ═══════════════════════════ 9 · Excepción por paciente (Editar medicación) ═══════════════════════════
const pillActiva = `<span style="flex: 0 0 auto; font-size: 10.5px; font-weight: 600; padding: 2px 9px; border-radius: 999px; color: ${T.deepGood}; background: rgba(92, 138, 90, 0.14);">Activa</span>`
const medFila = ({ nombre, sub, reposicion, primero = false, edicion = '' }) => `<div style="padding: 11px 0; ${primero ? '' : `border-top: 1px solid ${T.line};`}">
  <div style="display: flex; align-items: center; gap: 12px;">
    <div style="min-width: 0; flex: 1;">
      <div style="font-size: 14px; color: ${T.ink}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nombre}</div>
      <div style="font-size: 11.5px; color: ${T.muted}; margin-top: 2px;">${sub}</div>
      ${reposicion ? `<div style="font-size: 11.5px; color: ${T.inkSoft}; margin-top: 3px; display: flex; align-items: center; gap: 6px;">${ic('cart', 12, T.inkSoft, 1.9)}<span>${reposicion}</span></div>` : ''}
    </div>
    ${pillActiva}
    <span style="flex: 0 0 auto; font-size: 12.5px; font-weight: 600; color: ${T.muted}; padding: 4px 6px;">Desactivar</span>
  </div>
  ${edicion}
</div>`
const excepcion = page(`<div style="width: 584px; padding: 32px;">
  <div style="background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px; box-shadow: 0 12px 32px rgba(20, 48, 46, 0.10);">
    <div style="display: flex; align-items: center; gap: 12px; padding: 22px 24px 14px;">
      <div style="flex: 1; font-family: ${DISPLAY}; font-weight: 700; letter-spacing: -0.02em; font-size: 20px; color: ${T.ink};">Editar medicación</div>
      <span style="width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; flex: 0 0 auto;">${ic('x', 17, T.muted)}</span>
    </div>
    <div style="padding: 0 24px 22px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
        ${ic('pill', 17, PH)}
        <span style="font-family: ${DISPLAY}; font-weight: 700; font-size: 15px;">Medicación asignada</span>
        <div style="margin-left: auto; display: flex; gap: 8px;">${btnChico('Historial', ic('history', 14, PH))}${btnChico('Agregar', ic('plus', 14, PH))}</div>
      </div>
      ${medFila({ nombre: 'Seretide 250/50', sub: 'Habilitada · 12/03/2026 · Aerosol (IDM)', reposicion: '1 por mes, la del estudio · <span style="font-weight: 600; color: ' + T.muted + ';">Cambiar</span>', primero: true })}
      ${medFila({
        nombre: 'Budesonida 200 mcg', sub: 'Habilitada · 02/05/2026 · Inhalador de polvo seco', reposicion: '',
        edicion: `<div style="display: flex; align-items: flex-end; gap: 10px; margin-top: 10px; padding: 12px; border-radius: 11px; background: ${T.surface}; border: 1px solid ${T.line};">
          <div>${label('Envases por mes para este paciente')}${inputNum('2', 'envases', 84)}</div>
          <div style="flex: 1; font-size: 12px; color: ${T.inkSoft}; padding-bottom: 12px;">El estudio dice 1.</div>
          ${btnPrimary('Guardar', PH, 36)}${btnOutline('Cancelar', 36)}
        </div>`,
      })}
      ${medFila({ nombre: 'Salbutamol 100 mcg', sub: 'Habilitada · 12/03/2026 · Aerosol (IDM)', reposicion: 'A demanda en el estudio: no se carga por paciente' })}
      ${medFila({ nombre: 'Omeprazol 20 mg', sub: 'Habilitada con receta · 13/09/2026 · Cápsula', reposicion: 'Para una sola entrega: no suma en las compras' })}
      <div style="margin-top: 8px; padding-top: 10px; border-top: 1px solid ${T.line}; font-size: 11.5px; color: ${T.inkSoft};">Otra fila ya con excepción se lee: «2 por mes, sólo este paciente · <span style="font-weight: 600; color: ${T.muted};">Volver a la del estudio</span>».</div>
    </div>
  </div>
</div>`)

// ═══════════════════════════ LA CARD (forma B + D37-D43) ═══════════════════════════

/** D39: franja arriba mientras quede algo sin cargar. */
const franjaSinCargar = (texto, { primerDia = false, cargados = 0, total = 0 } = {}) => `<div style="display: flex; align-items: center; gap: 14px; margin: 0 0 12px; padding: ${primerDia ? '16px 20px' : '11px 16px'}; background: ${T.white}; border: 1px solid ${T.line2}; border-radius: 12px;">
  <span style="width: ${primerDia ? 40 : 30}px; height: ${primerDia ? 40 : 30}px; border-radius: ${primerDia ? 11 : 9}px; background: rgba(176, 130, 63, 0.14); display: grid; place-items: center; flex: 0 0 auto;">${ic('pencil', primerDia ? 18 : 15, T.deepWarn, 1.9)}</span>
  <div style="flex: 1; min-width: 0;">${texto}</div>
  ${primerDia ? `<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px; margin-right: 6px;">
    <span class="mono" style="font-size: 12.5px; color: ${T.ink}; font-weight: 600;">${cargados} de ${total} cargados</span>
    <div style="width: 140px; height: 6px; border-radius: 999px; background: ${T.surface}; border: 1px solid ${T.line};"></div>
  </div>` : ''}
  ${primerDia ? btnPrimary('Cargar el siguiente', PH, 36) : btnChico('Cargar el siguiente', ic('arrowRight', 13, PH))}
</div>`

/** D39: un estudio con pendientes nunca dice «alcanza». */
const incompleto = (texto) => `<div style="display: flex; align-items: center; gap: 12px; padding: 13px 20px;">
  ${ic('pencil', 15, T.deepWarn, 1.9)}
  <span style="flex: 1; font-size: 13px; color: ${T.ink};">${texto}</span>
  ${cargar}
</div>`

/** D37: los estudios donde todo alcanza, juntos en una línea al final. */
const lineaAlcanzan = (texto) => `<div style="display: flex; align-items: center; gap: 10px; padding: 12px 18px; background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px; font-size: 12.5px; color: ${T.inkSoft};">
  ${ic('check', 15, T.deepGood, 2)}<span style="flex: 1; min-width: 0;">${texto}</span>${linkMudo('Ver')}${ic('chevronDown', 14, T.muted)}
</div>`

const verTodo = (abierto = false) => `<span style="margin-left: auto; display: inline-flex; align-items: center; gap: 5px;">${linkMudo(abierto ? 'Ocultar el estudio' : 'Ver todo el estudio')}${ic(abierto ? 'chevronUp' : 'chevronDown', 14, T.muted)}</span>`

const cardsNormales = `<div style="display: flex; flex-direction: column; gap: 12px;">
  ${cardEstudio({
    codigo: 'ASM-2301', nombre: 'Asma moderada a severa', derecha: '2 para comprar',
    cuerpo: compraFila({ nombre: 'Seretide 250/50', presentacion: 'Aerosol (IDM)', porque: 'Octubre: 10 pacientes × 1 · al 1/10 quedan 4', avisos: avisoLinea('1 lote vence el 20/10'), n: 6 })
      + compraFila({ nombre: 'Salbutamol 100 mcg', presentacion: 'Aerosol (IDM) · a demanda', porque: 'Tener siempre 3 · al 1/10 queda 1', n: 2, ultimo: true }),
    pie: pieEstudio(['<span>1 alcanza: Budesonida 200 mcg</span>', verTodo()]),
  })}
  ${cardEstudio({
    codigo: 'ASM-2410', nombre: 'Asma leve persistente', derecha: '1 para comprar',
    cuerpo: compraFila({ nombre: 'Seretide 250/50', presentacion: 'Aerosol (IDM)', porque: 'Octubre: 3 pacientes × 1 · al 1/10 queda 1', n: 2, ultimo: true }),
    pie: pieEstudio(['<span>1 alcanza: Salbutamol 100 mcg</span>', verTodo()]),
  })}
  ${cardEstudio({
    codigo: 'EPOC-118', nombre: 'EPOC con exacerbaciones', pausado: true,
    derecha: `<span style="color: ${T.deepWarn};">Cuenta incompleta</span>`,
    cuerpo: incompleto(`<strong>1 sin cargar</strong> <span style="color: ${T.inkSoft};">· Montelukast 10 mg todavía no suma, así que no se sabe si hay que comprar.</span>`),
    pie: pieEstudio(['<span>2 no se compran: Placebo inhalador · Tiotropio 18 mcg</span>', verTodo()]),
  })}
  ${lineaAlcanzan('<strong style="color: ' + T.ink + '; font-weight: 600;">2 estudios alcanzan:</strong> RES-0915 · DERM-331')}
</div>`

// —— 1 · Un mes normal, a tiempo ——
const main = page(wrap(
  seccion('Compras para octubre', 'A hoy, 05/09 · todos los estudios', demoraBtn(20))
  + plazoOk('Pedí antes del <strong style="color: ' + T.ink + ';">11/09</strong> para que llegue antes del 1/10.')
  + franjaSinCargar(`<span style="font-size: 13px; color: ${T.ink};"><strong>1 medicamento sin cargar</strong> en EPOC-118</span><span style="font-size: 12.5px; color: ${T.inkSoft};"> · hasta cargarlo, la cuenta de ese estudio está incompleta.</span>`)
  + cardsNormales
  + debajo,
))

// ═══════════════════════════ PROPUESTA SIMPLE (pedido del Director, 14/09) ═══════════════════════════
// Todos los medicamentos en renglones simples (o plegado al número) + «Ver pedido» ordenable.

const COLS_S = 'grid-template-columns: minmax(0, 1fr) 150px 190px 40px;'
const thS = (t, align = 'left') => `<div style="padding: 11px 16px 9px; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.inkSoft}; white-space: nowrap; text-align: ${align};">${t}</div>`
const marca = ic('alert', 13, T.deepWarn, 1.9, ' display: inline-block; vertical-align: -2px; margin-left: 6px;')
const simple = ({ nombre, presentacion, estudio, derecha, alerta = false, abierto = false, apagado = false, ultimo = false }) => `<div style="display: grid; ${COLS_S} align-items: center; min-height: 50px; ${ultimo && !abierto ? '' : `border-bottom: 1px solid ${T.line};`}${abierto ? ` background: ${T.surface};` : ''}">
  <div style="padding: 10px 16px; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;${apagado ? ' opacity: 0.8;' : ''}">
    <span style="font-size: 14px; color: ${T.ink};">${nombre}</span><span style="font-size: 12px; color: ${T.inkSoft};"> · ${presentacion}</span>${alerta ? marca : ''}
  </div>
  <div style="padding: 10px 16px;"><span class="mono" style="font-size: 13px; color: ${T.ink}; font-weight: 600;">${estudio}</span></div>
  <div style="padding: 10px 16px; display: flex; align-items: baseline; justify-content: flex-end; gap: 6px;">${derecha}</div>
  <div style="display: grid; place-items: center;">${ic(abierto ? 'chevronUp' : 'chevronDown', 16, T.muted)}</div>
</div>`
const nEnv = (n) => `<span class="mono" style="font-family: ${DISPLAY}; font-size: 18px; font-weight: 700; color: ${T.ink};">${n}</span>${envases(n)}`
const sinCargar = `<span style="font-size: 12.5px; color: ${T.deepWarn}; font-weight: 600; margin-right: 8px;">Sin cargar</span>${cargar}`
const noSeCompra = `<span style="font-size: 12.5px; color: ${T.muted};">No se compra</span>`
const verPedidoBtn = btnPrimary(`${ic('cart', 16, T.onAccent)}Ver pedido`, PH, 38)

const encabezadoSimple = (derecha = '') => `<div style="display: flex; align-items: center; gap: 12px; margin: 0 0 12px;">
  <h2 style="font-family: ${DISPLAY}; font-size: 16.5px; font-weight: 700; letter-spacing: -0.01em; margin: 0;">Compras para octubre</h2>
  <div style="flex: 1; height: 1px; background: ${T.line};"></div>
  <span style="font-size: 12px; color: ${T.inkSoft};">A hoy, 05/09</span>
  ${demoraBtn(20)}
  ${derecha}
</div>`

/** El resumen de arriba de la card: lo único que se ve plegada. */
const sep = `<span style="color: ${T.line2};">·</span>`
const resumen = ({ numero = '18', unidad = 'envases', linea1, linea2, abierto = false, accion = null }) => `<div style="display: flex; align-items: center; gap: 20px; padding: 16px 20px;${abierto ? ` border-bottom: 1px solid ${T.line2};` : ''}">
  ${numero !== null ? `<div style="display: flex; align-items: baseline; gap: 8px;">
    <span class="mono" style="font-family: ${DISPLAY}; font-size: 30px; font-weight: 800; letter-spacing: -0.02em; color: ${T.ink};">${numero}</span>
    <span style="font-family: ${DISPLAY}; font-size: 15px; font-weight: 600; color: ${T.muted};">${unidad}</span>
  </div>` : ''}
  <div style="flex: 1; min-width: 0;">
    <div style="font-size: 13.5px; color: ${T.ink};">${linea1}</div>
    <div style="font-size: 12.5px; color: ${T.inkSoft}; margin-top: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">${linea2}</div>
  </div>
  ${accion ?? `<span style="display: inline-flex; align-items: center; gap: 5px;">${linkMudo(abierto ? 'Plegar' : 'Ver todos los medicamentos')}${ic(abierto ? 'chevronUp' : 'chevronDown', 14, T.muted)}</span>`}
</div>`
const resumenPedido = (abierto) => resumen({
  abierto,
  linea1: 'para comprar: <strong>4 medicamentos</strong> en 2 estudios',
  linea2: `${ic('calendar', 13, PH)}Pedí antes del 11/09 ${sep} <span style="color: ${T.deepWarn};">1 sin cargar</span>`,
})

const listaCompleta = `<div style="display: grid; ${COLS_S} border-bottom: 1px solid ${T.line2};">${thS('Medicamento')}${thS('Estudio')}${thS('Para octubre', 'right')}<div></div></div>`
  + simple({ nombre: 'Seretide 250/50', presentacion: 'Aerosol (IDM)', estudio: 'ASM-2301', derecha: nEnv(6), alerta: true })
  + simple({ nombre: 'Salbutamol 100 mcg', presentacion: 'Aerosol (IDM)', estudio: 'ASM-2301', derecha: nEnv(2) })
  + simple({ nombre: 'Budesonida 200 mcg', presentacion: 'Inhalador de polvo seco', estudio: 'ASM-2301', derecha: alcanza })
  + simple({ nombre: 'Budesonida 200 mcg', presentacion: 'Inhalador de polvo seco', estudio: 'ASM-2410', derecha: nEnv(8) })
  + simple({ nombre: 'Seretide 250/50', presentacion: 'Aerosol (IDM)', estudio: 'ASM-2410', derecha: nEnv(2) })
  + simple({ nombre: 'Salbutamol 100 mcg', presentacion: 'Aerosol (IDM)', estudio: 'ASM-2410', derecha: alcanza })
  + simple({ nombre: 'Montelukast 10 mg', presentacion: 'Comprimido oral', estudio: 'EPOC-118', derecha: sinCargar, apagado: true })
  + simple({ nombre: 'Tiotropio 18 mcg', presentacion: 'Cápsula para inhalar', estudio: 'EPOC-118', derecha: noSeCompra, apagado: true, ultimo: true })

// —— S1 · Siempre desplegada: todos, simples ——
const simpleDesplegada = page(wrap(
  encabezadoSimple(verPedidoBtn)
  + plazoOk('Pedí antes del <strong style="color: ' + T.ink + ';">11/09</strong> para que llegue antes del 1/10.')
  + card(listaCompleta)
  + debajo,
))

// —— S2 · Plegada: sólo el número, se despliega ——
const simplePlegada = page(wrap(
  encabezadoSimple(verPedidoBtn)
  + card(resumenPedido(false))
  + debajo,
))
const simplePlegadaAbierta = page(wrap(
  encabezadoSimple(verPedidoBtn)
  + card(resumenPedido(true) + listaCompleta),
))

// —— S3 · Un renglón abierto (el detalle vive acá, no en la lista) ——
const simpleRenglon = page(wrap(
  card(
    `<div style="display: grid; ${COLS_S} border-bottom: 1px solid ${T.line2};">${thS('Medicamento')}${thS('Estudio')}${thS('Para octubre', 'right')}<div></div></div>`
    + simple({ nombre: 'Seretide 250/50', presentacion: 'Aerosol (IDM)', estudio: 'ASM-2301', derecha: nEnv(6), alerta: true, abierto: true })
    + `<div style="display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 36px; padding: 4px 20px 16px 16px; background: ${T.surface}; border-bottom: 1px solid ${T.line};">
      <div>
        ${cuentaLinea('Octubre: 10 pacientes × 1 por mes', '10')}
        ${cuentaLinea('Quedan al 1/10', '− 4')}
        ${cuentaLinea('A comprar', '6 envases', { fuerte: true, borde: true })}
      </div>
      <div>
        ${avisoItem('1 lote vence el 20/10.', 'warn')}
        <div style="display: flex; gap: 8px; margin-top: 8px;">${btnChico('Cambiar cómo se repone', ic('pencil', 13, PH))}</div>
      </div>
    </div>`
    + simple({ nombre: 'Salbutamol 100 mcg', presentacion: 'Aerosol (IDM)', estudio: 'ASM-2301', derecha: nEnv(2), ultimo: true }),
  ),
  CONTENT,
))

// —— Ver pedido: modal con tres formas de ordenar ——
const pedidoLinea = ({ izq, sub = '', der, primero = false }) => `<div style="display: flex; align-items: center; gap: 14px; padding: 10px 0; ${primero ? '' : `border-top: 1px solid ${T.line};`}">
  <div style="flex: 1; min-width: 0;"><div style="font-size: 14px; color: ${T.ink};">${izq}</div>${sub ? `<div style="font-size: 12px; color: ${T.inkSoft}; margin-top: 2px;">${sub}</div>` : ''}</div>
  <div style="display: flex; align-items: baseline; gap: 6px;">${der}</div>
</div>`
const grupo = (titulo, total, inner) => `<div style="margin-top: 14px;">
  <div style="display: flex; align-items: baseline; gap: 10px; padding-bottom: 6px; border-bottom: 1px solid ${T.line2};">
    <span class="mono" style="font-family: ${DISPLAY}; font-size: 14px; font-weight: 700; color: ${T.ink};">${titulo}</span>
    <span style="margin-left: auto; font-size: 12px; color: ${T.inkSoft};">${total}</span>
  </div>
  ${inner}
</div>`
const modalPedido = (orden, cuerpo) => page(`<div style="width: 684px; padding: 32px;">
  <div style="background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px; box-shadow: 0 12px 32px rgba(20, 48, 46, 0.10);">
    <div style="display: flex; align-items: flex-start; gap: 12px; padding: 22px 24px 12px;">
      <div style="flex: 1;">
        <div style="font-family: ${DISPLAY}; font-weight: 700; letter-spacing: -0.02em; font-size: 20px; color: ${T.ink};">Pedido para octubre</div>
        <div style="font-size: 13px; color: ${T.muted}; margin-top: 4px;"><span class="mono">18</span> envases · <span class="mono">4</span> medicamentos · pedí antes del 11/09</div>
      </div>
      <span style="width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; flex: 0 0 auto;">${ic('x', 17, T.muted)}</span>
    </div>
    <div style="padding: 0 24px 22px;">
      <div style="display: flex; align-items: center; gap: 10px;"><span style="font-size: 12.5px; font-weight: 600; color: ${T.muted};">Ordenar</span>${seg(['Por estudio', 'Por medicamento', 'Por cantidad'], orden)}</div>
      ${cuerpo}
      <div style="display: flex; align-items: center; gap: 8px; margin-top: 16px; padding: 10px 12px; border-radius: 10px; background: ${T.surface}; border: 1px solid ${T.line}; font-size: 12.5px; color: ${T.deepWarn};">${ic('alert', 14, T.deepWarn, 1.9)}<span style="flex: 1;">Falta cargar Montelukast 10 mg (EPOC-118): no está en el pedido.</span></div>
      <div style="display: flex; gap: 10px; margin-top: 18px;">${btnOutline('Cerrar')}<div style="flex: 1;"></div>${btnOutline(`${ic('printer', 16, T.ink)}Imprimir`)}${btnPrimary(`${ic('truck', 16, T.onAccent)}Ya lo pedí`)}</div>
    </div>
  </div>
</div>`)

// —— «Ya lo pedí»: confirmación (marca todo el pedido en camino) ——
const yaLoPedi = page(`<div style="width: 524px; padding: 32px;">
  <div style="background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px; box-shadow: 0 12px 32px rgba(20, 48, 46, 0.10);">
    <div style="display: flex; align-items: center; gap: 12px; padding: 22px 24px 14px;">
      <div style="flex: 1; font-family: ${DISPLAY}; font-weight: 700; letter-spacing: -0.02em; font-size: 20px; color: ${T.ink};">¿Ya hiciste este pedido?</div>
      <span style="width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; flex: 0 0 auto;">${ic('x', 17, T.muted)}</span>
    </div>
    <div style="padding: 0 24px 22px;">
      <p style="font-size: 13px; color: ${T.muted}; line-height: 1.5; margin: 0 0 14px;">Los <span class="mono">18</span> envases quedan en camino y no se vuelven a pedir. Se descuentan solos al recibirlos.</p>
      ${label('Pedido el')}<div style="height: 44px; width: 200px; border: 1px solid ${T.line2}; border-radius: 10px; background: ${T.white}; display: flex; align-items: center; justify-content: space-between; padding: 0 12px 0 14px; font-size: 14px;"><span class="mono">05/09/2026</span>${ic('calendar', 16, T.muted)}</div>
      <div style="display: flex; gap: 10px; margin-top: 18px;">${btnOutline('Volver')}<div style="flex: 1;"></div>${btnPrimary('Sí, ya lo pedí')}</div>
    </div>
  </div>
</div>`)

// —— Estados de la card plegada ——
const estadoPlegada = (inner, extra = '') => page(wrap(encabezadoSimple(verPedidoBtn) + extra + card(inner), CONTENT))
const estPrimerDia = page(wrap(
  encabezadoSimple(`<span style="opacity: 0.5;">${verPedidoBtn}</span>`)
  + card(resumen({
    numero: null,
    linea1: '<strong>Falta cargar cómo se repone cada medicamento</strong>',
    linea2: `<span class="mono">0 de 14</span> cargados ${sep} los que faltan no cuentan como cero ${sep} ${ic('info', 13, T.inkSoft)}cargá también la demora de compra`,
    accion: btnPrimary('Empezar a cargar', PH, 36),
  })),
  CONTENT,
))
const estTarde = estadoPlegada(resumen({
  linea1: 'para comprar: <strong>4 medicamentos</strong> en 2 estudios',
  linea2: `<span style="color: ${T.deepWarn}; display: inline-flex; align-items: center; gap: 6px;">${ic('alert', 13, T.deepWarn, 1.9)}Ya es tarde para octubre: lo que pidas hoy llega el 04/10</span> ${sep} para noviembre, antes del 12/10`,
}))
const estPedido = estadoPlegada(resumen({
  numero: '0', unidad: 'envases',
  linea1: 'para comprar · <strong>18 envases en camino</strong>, pedidos el 05/09',
  linea2: `${ic('truck', 13, PH)}Se descuentan solos al recibirlos ${sep} <span style="color: ${T.deepWarn};">1 sin cargar</span> ${sep} ${linkMudo('Deshacer')}`,
}))
const estCubierto = estadoPlegada(resumen({
  numero: null,
  linea1: `<span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: ${T.deepGood};">${ic('check', 15, T.deepGood, 2)}Octubre está cubierto</span>`,
  linea2: 'Con lo que hay y lo que viene en camino alcanza en todos los estudios · para noviembre, pedí antes del 12/10',
  accion: '',
}))

// —— Cargar desde la lista desplegada ——
const renglonCarga = page(wrap(
  card(
    `<div style="display: grid; ${COLS_S} border-bottom: 1px solid ${T.line2};">${thS('Medicamento')}${thS('Estudio')}${thS('Para octubre', 'right')}<div></div></div>`
    + simple({ nombre: 'Montelukast 10 mg', presentacion: 'Comprimido oral', estudio: 'EPOC-118', derecha: `<span style="font-size: 12.5px; color: ${T.deepWarn}; font-weight: 600;">Sin cargar</span>`, abierto: true, apagado: true })
    + `<div style="padding: 4px 16px 18px; background: ${T.surface}; border-bottom: 1px solid ${T.line};">
      <div style="display: flex; gap: 32px; align-items: flex-end; flex-wrap: wrap;">
        <div>${label('Cómo se repone')}${seg(['Por mes', 'A demanda', 'No se compra'], 'Por mes')}</div>
        <div>${label('Envases por paciente, por mes')}${inputNum('1', 'envase')}</div>
        <div style="font-size: 12.5px; color: ${T.inkSoft}; padding-bottom: 12px;">Con 7 pacientes que siguen en octubre: <span class="mono" style="color: ${T.ink}; font-weight: 600;">7</span> envases.</div>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 16px;">${btnPrimary('Guardar')}${btnOutline('Cancelar')}</div>
    </div>`
    + simple({ nombre: 'Tiotropio 18 mcg', presentacion: 'Cápsula para inhalar', estudio: 'EPOC-118', derecha: noSeCompra, apagado: true, ultimo: true }),
  ),
  CONTENT,
))

const pedidoPorEstudio = modalPedido('Por estudio',
  grupo('ASM-2301', '8 envases',
    pedidoLinea({ izq: 'Seretide 250/50', sub: 'Aerosol (IDM)', der: nEnv(6), primero: true })
    + pedidoLinea({ izq: 'Salbutamol 100 mcg', sub: 'Aerosol (IDM)', der: nEnv(2) }))
  + grupo('ASM-2410', '10 envases',
    pedidoLinea({ izq: 'Budesonida 200 mcg', sub: 'Inhalador de polvo seco', der: nEnv(8), primero: true })
    + pedidoLinea({ izq: 'Seretide 250/50', sub: 'Aerosol (IDM)', der: nEnv(2) })))

const pedidoPorMedicamento = modalPedido('Por medicamento',
  `<div style="margin-top: 14px;">`
  + pedidoLinea({ izq: 'Budesonida 200 mcg <span style="font-size: 12px; color: ' + T.inkSoft + ';">· Inhalador de polvo seco</span>', sub: 'ASM-2410: 8', der: nEnv(8), primero: true })
  + pedidoLinea({ izq: 'Salbutamol 100 mcg <span style="font-size: 12px; color: ' + T.inkSoft + ';">· Aerosol (IDM)</span>', sub: 'ASM-2301: 2', der: nEnv(2) })
  + pedidoLinea({ izq: 'Seretide 250/50 <span style="font-size: 12px; color: ' + T.inkSoft + ';">· Aerosol (IDM)</span>', sub: 'ASM-2301: 6 · ASM-2410: 2', der: nEnv(8) })
  + `</div>`)

const pedidoPorCantidad = modalPedido('Por cantidad',
  `<div style="margin-top: 14px;">`
  + pedidoLinea({ izq: 'Budesonida 200 mcg', sub: 'ASM-2410 · Inhalador de polvo seco', der: nEnv(8), primero: true })
  + pedidoLinea({ izq: 'Seretide 250/50', sub: 'ASM-2301 · Aerosol (IDM)', der: nEnv(6) })
  + pedidoLinea({ izq: 'Salbutamol 100 mcg', sub: 'ASM-2301 · Aerosol (IDM)', der: nEnv(2) })
  + pedidoLinea({ izq: 'Seretide 250/50', sub: 'ASM-2410 · Aerosol (IDM)', der: nEnv(2) })
  + `</div>`)

const files = {
  // La card (propuesta simple, opción 2)
  'Main.dc.html': simplePlegada,
  'ListaDesplegada.dc.html': simplePlegadaAbierta,
  'RenglonAbierto.dc.html': simpleRenglon,
  'RenglonCarga.dc.html': renglonCarga,
  'EstadoPrimerDia.dc.html': estPrimerDia,
  'EstadoTarde.dc.html': estTarde,
  'EstadoPedido.dc.html': estPedido,
  'EstadoCubierto.dc.html': estCubierto,
  'Cargando.dc.html': cargando,
  'Error.dc.html': error,
  // Ver pedido
  'PedidoPorEstudio.dc.html': pedidoPorEstudio,
  'PedidoPorMedicamento.dc.html': pedidoPorMedicamento,
  'PedidoPorCantidad.dc.html': pedidoPorCantidad,
  'YaLoPedi.dc.html': yaLoPedi,
  // Carga, demora, paciente
  'CargaDemanda.dc.html': cargaDemanda,
  'CargaNoSeCompra.dc.html': cargaNo,
  'Demora.dc.html': demora,
  'Excepcion.dc.html': excepcion,
  // Versiones anteriores (registro)
  'AnteriorOpcion1.dc.html': simpleDesplegada,
  'AnteriorFormaB.dc.html': main,
  'AnteriorFormaA.dc.html': formaA,
  'AnteriorFormaC.dc.html': formaC,
}
for (const [f, html] of Object.entries(files)) writeFileSync(join(OUT, f), html)
console.log('ok', Object.keys(files).length)
