// Arma los artboards del mock del submódulo «Reposición» (spec 2026-09-16-reposicion-submodulo-design.md)
// con los valores literales del código de Spira: tokens.css, AppShell (cabecera y panel de submódulos),
// ProtocolsView (la tarjeta de estudio de la grilla), reportes/estilos.ts (th/td), Modal.tsx,
// SearchableSelect, reportes/impresion.tsx (Membrete, FilaKv, thImpresa/tdImpresa, PieDePagina) y
// wizard/Step1Scan. Estudios reales; cantidades, lotes y nombres de medicamentos INVENTADOS.
//
// Versión 2 (17/09): incorpora la revisión de diseño (RD1-RD18 del spec): ventana de 5 días, reabrir,
// «Cerrado · no llegó», tarjeta de dos renglones, estados después de actuar y ventana angosta.
//
//   node docs/design_handoff_reposicion_submodulo/generar-artboards.mjs docs/design_handoff_reposicion_submodulo
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
const PH = T.primary // Farmacia: accent = accentSolid = #0F5F57 (modules/registry.ts)
const DISPLAY = "'Schibsted Grotesk', system-ui, sans-serif"
const VISTA = 1237 // 1185 de contenido en la notebook de referencia + el padding de 26 de .spira-content

// —— Íconos Lucide (trazo 1.8, como Icon.tsx) ——
const I = {
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clipboardCheck: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  barChart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  rotateCcw: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
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

// ═══════════════════════════ Piezas del shell (AppShell.tsx) y botones (buttons.ts) ═══════════════════════════

const btnChico = (texto, icono = '', extra = '') => `<div style="height: 32px; border-radius: 10px; border: 1px solid ${T.line2}; background: ${T.white}; font-size: 12.5px; font-weight: 600; color: ${T.ink}; display: inline-flex; align-items: center; gap: 6px; padding: 0 11px; flex: 0 0 auto; white-space: nowrap;${extra}">${icono}${texto}</div>`
/** ghostActionBtn / primaryActionBtn de la cabecera (AppShell.tsx:77-88): 38 de alto, 13.5/600. */
const accion = (texto, icono, primario = false) => primario
  ? `<div style="height: 38px; padding: 0 15px; border-radius: 10px; background: ${PH}; color: ${T.onAccent}; font-weight: 600; font-size: 13.5px; display: flex; align-items: center; gap: 7px; white-space: nowrap;">${ic(icono, 16, T.onAccent)}${texto}</div>`
  : `<div style="height: 38px; padding: 0 15px; border: 1px solid ${T.line2}; border-radius: 10px; background: ${T.white}; color: ${T.ink}; font-weight: 600; font-size: 13.5px; display: flex; align-items: center; gap: 7px; white-space: nowrap;">${ic(icono, 16, T.ink)}${texto}</div>`
const btnPrimary = (texto, bg = PH, h = 40) => `<div style="height: ${h}px; padding: 0 16px; border-radius: 10px; background: ${bg}; color: ${T.onAccent}; font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; white-space: nowrap;">${texto}</div>`
const btnOutline = (texto, h = 40) => `<div style="height: ${h}px; padding: 0 16px; border-radius: 10px; border: 1px solid ${T.line2}; background: ${T.white}; color: ${T.ink}; font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; white-space: nowrap;">${texto}</div>`

const cabecera = ({ sub = 'Reposición', migas = [], acciones = '' } = {}) => `<div style="display: flex; align-items: center; gap: 12px; padding: 20px 26px 4px;">
  <div style="min-width: 0;">
    <div style="display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: ${T.muted};">Spira Farmacia${ic('chevronRight', 13, T.faint)}<span>${sub}</span>${migas.map((m) => `${ic('chevronRight', 13, T.faint)}<span>${m}</span>`).join('')}</div>
    <div style="font-family: ${DISPLAY}; font-weight: 700; font-size: 24px; letter-spacing: -0.02em; margin-top: 1px;">${sub}</div>
  </div>
  ${acciones ? `<div style="margin-left: auto; display: flex; gap: 8px;">${acciones}</div>` : ''}
</div>`
const vista = (cab, inner, ancho = VISTA) => `<div style="width: ${ancho}px;">${cab}<div style="padding: 16px 26px 26px;">${inner}</div></div>`

// ═══════════════════════════ Piezas comunes ═══════════════════════════

const card = (inner, extra = '') => `<div style="background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px; overflow: hidden;${extra}">${inner}</div>`
const th = (t, align = 'left') => `<div style="padding: 10px 16px 9px; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.inkSoft}; white-space: nowrap; text-align: ${align};">${t}</div>`
const num = (t, color = T.ink) => `<span class="mono" style="font-size: 14px; color: ${color};">${t}</span>`
const grande = (n) => `<span class="mono" style="font-family: ${DISPLAY}; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: ${T.ink};">${n}</span>`
const envasesTxt = (n) => `<span style="font-family: ${DISPLAY}; font-size: 13px; font-weight: 600; color: ${T.muted};">${n === 1 ? 'envase' : 'envases'}</span>`
const label = (t) => `<div style="font-size: 12.5px; font-weight: 600; color: ${T.muted}; margin-bottom: 6px;">${t}</div>`
const subtitulo = (t) => `<div style="font-size: 13px; font-weight: 600; color: ${T.ink}; margin-bottom: 6px;">${t}</div>`
const inputNum = (v, sufijo, w = 96, foco = true) => `<div style="display: inline-flex; align-items: center; gap: 10px;">
  <div class="mono" style="width: ${w}px; height: 44px; border: 1px solid ${T.line2}; border-radius: 10px; background: ${T.white}; display: flex; align-items: center; padding: 0 14px; font-size: 14px; color: ${T.ink};${foco ? ' box-shadow: 0 5px 14px rgba(20, 48, 46, 0.10); transform: translateY(-1px);' : ''}">${v}</div>
  ${sufijo ? `<span style="font-size: 13px; color: ${T.inkSoft};">${sufijo}</span>` : ''}
</div>`
/** SearchableSelect cerrado (SearchableSelect.tsx:562): 44 de alto, radio 10, chevron 16 muted. Sin texto libre. */
const desplegable = (valor, placeholder = false, w = 280) => `<div style="width: ${w}px; height: 44px; border: 1px solid ${T.line2}; border-radius: 10px; background: ${T.white}; display: flex; align-items: center; gap: 8px; padding: 0 14px; font-size: 14px; color: ${placeholder ? T.faint : T.ink};"><span style="flex: 1; min-width: 0;">${valor}</span>${ic('chevronDown', 16, T.muted)}</div>`
const seg = (opciones, activa) => `<div style="display: inline-flex; gap: 7px;">${opciones.map((o) => `<span style="height: 34px; padding: 0 14px; border-radius: 999px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; ${o === activa ? `background: rgba(15, 95, 87, 0.10); border: 1px solid rgba(15, 95, 87, 0.35); color: ${T.deepTrack};` : `background: ${T.white}; border: 1px solid ${T.line2}; color: ${T.muted};`}">${o}</span>`).join('')}</div>`
const avisoItem = (texto, tono = 'info') => {
  const c = tono === 'warn' ? T.deepWarn : tono === 'danger' ? T.deepDanger : T.inkSoft
  return `<div style="display: flex; gap: 8px; align-items: flex-start; padding: 5px 0; font-size: 12.5px; line-height: 1.45; color: ${tono === 'info' ? T.ink : c};">
  ${ic(tono === 'info' ? 'info' : 'alert', 14, c, 1.9, ' margin-top: 2px;')}<span style="flex: 1; min-width: 0;">${texto}</span>
</div>`
}
/**
 * EL estado del pedido (RD8): una sola pastilla en sentence case, en toda la app. El texto va siempre;
 * el color acompaña. Mismo cuerpo que las pastillas de PatientMedicationsCard (10.5-11/600, radio 999).
 */
const ESTADOS = {
  sinRecibir: ['Sin recibir', `color: ${T.inkSoft}; background: ${T.surface}; border: 1px solid ${T.line2};`],
  llego: ['Llegó, falta verificar', `color: ${T.deepWarn}; background: rgba(176, 130, 63, 0.14); border: 1px solid transparent;`],
  enParte: ['Recibido en parte', `color: ${T.deepWarn}; background: rgba(176, 130, 63, 0.14); border: 1px solid transparent;`],
  recibido: ['Recibido', `color: ${T.deepGood}; background: rgba(92, 138, 90, 0.14); border: 1px solid transparent;`],
  noLlego: ['Cerrado · no llegó', `color: ${T.muted}; background: ${T.surface}; border: 1px solid ${T.line2};`],
  anulado: ['Anulado', `color: ${T.muted}; background: ${T.surface}; border: 1px solid ${T.line2};`],
}
const estadoPedido = (clave, texto = null) => {
  const [t, s] = ESTADOS[clave]
  return `<span style="font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 999px; white-space: nowrap; ${s}">${texto ?? t}</span>`
}

/** Modal.tsx: tarjeta blanca, radio 16, sombra md; cabecera 22/24/14 con título display 20. */
const modal = (titulo, cuerpo, ancho, sub = '') => `<div style="width: ${ancho + 64}px; padding: 32px;">
  <div style="background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px; box-shadow: 0 12px 32px rgba(20, 48, 46, 0.10);">
    <div style="display: flex; align-items: flex-start; gap: 12px; padding: 22px 24px 14px;">
      <div style="flex: 1; min-width: 0;">
        <div style="font-family: ${DISPLAY}; font-weight: 700; letter-spacing: -0.02em; font-size: 20px; color: ${T.ink};">${titulo}</div>
        ${sub ? `<div style="font-size: 13px; color: ${T.muted}; margin-top: 4px; line-height: 1.45;">${sub}</div>` : ''}
      </div>
      <span style="width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; flex: 0 0 auto;">${ic('x', 17, T.muted)}</span>
    </div>
    <div style="padding: 0 24px 22px;">${cuerpo}</div>
  </div>
</div>`

// ═══════════════════════════ 0 · El menú de Farmacia (AppShell, panel de submódulos) ═══════════════════════════

const itemMenu = (nombre, hint, icono, on = false) => `<div style="display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; border-radius: 9px; ${on ? 'background: rgba(15, 95, 87, 0.08);' : ''}">
  ${ic(icono, 17, on ? PH : T.muted, 1.9, ' margin-top: 1px;')}
  <span style="display: flex; flex-direction: column; gap: 1px; min-width: 0;">
    <span style="font-size: 14px; font-weight: ${on ? 600 : 500}; line-height: 1.35; color: ${T.ink};">${nombre}</span>
    <span style="font-size: 11.5px; font-weight: 400; line-height: 1.35; color: ${T.inkSoft};">${hint}</span>
  </span>
</div>`
const menu = page(`<div style="width: 220px; padding: 18px 12px; background: ${T.surface}; border-right: 1px solid ${T.line}; min-height: 480px;">
  <div style="font-weight: 700; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: ${T.muted}; padding: 2px 12px 0;">Submódulos</div>
  <div style="display: flex; flex-direction: column; gap: 2px; margin-top: 14px;">
    ${itemMenu('Pacientes', 'Información de pacientes', 'users')}
    ${itemMenu('Recepción', 'Ingreso de medicación', 'clipboardCheck')}
    ${itemMenu('Stock', 'Inventario de medicación', 'pill')}
    ${itemMenu('Dispensaciones', 'Entrega de medicación', 'box')}
    ${itemMenu('Reposición', 'Pedidos de medicación', 'cart', true)}
    ${itemMenu('Estadísticas', 'Los números del período', 'barChart')}
  </div>
</div>`, T.surface)

// ═══════════════════════════ 1 · La grilla (ProtocolsView: la tarjeta de estudio) ═══════════════════════════

const puntoEstado = (estado = 'Activo', color = T.good) => `<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: ${T.muted}; white-space: nowrap;"><span style="width: 7px; height: 7px; border-radius: 999px; background: ${color};"></span>${estado}</span>`
/**
 * La tarjeta de Pacientes, con la parte de abajo cambiada. RD4: dos renglones de pedido — uno FIJO para el
 * período que viene (pedido o «sin pedido») y otro sólo si un pedido anterior todavía debe algo.
 */
const tarjetaEstudio = ({ codigo, nombre, principal, detalle = '', pedidos = [], link = true, estado = 'Activo', colorEstado = T.good }) => `<div style="background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px; padding: 18px 20px; display: flex; flex-direction: column; gap: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
    <span class="mono" style="font-family: ${DISPLAY}; font-weight: 700; font-size: 20px; letter-spacing: -0.01em; color: ${PH};">${codigo}</span>
    ${puntoEstado(estado, colorEstado)}
  </div>
  <div style="font-size: 15px; font-weight: 600; color: ${T.ink}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nombre}</div>
  <div style="height: 1px; background: ${T.line}; margin: 5px 0;"></div>
  <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 30px;">
    <div style="display: flex; align-items: baseline; gap: 7px; min-width: 0; flex-wrap: wrap;">${principal}</div>
    ${link ? ic('chevronRight', 18, T.faint) : ''}
  </div>
  ${detalle ? `<div style="font-size: 12.5px; color: ${T.inkSoft}; margin-top: -4px;">${detalle}</div>` : ''}
  ${pedidos.join('')}
</div>`
const paraComprar = (n) => `${grande(n)}<span style="font-size: 13px; font-weight: 600; color: ${T.ink};">envases para comprar</span>`
const cubierto = `<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: ${T.deepGood};">${ic('check', 16, T.deepGood, 2)}Cubierto</span>`
const faltaCargar = `<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: ${T.deepWarn};">${ic('pencil', 15, T.deepWarn, 1.9)}Falta cargar cómo se repone</span>`
const sinMedicacion = `<span style="font-size: 13.5px; color: ${T.muted};">Sin medicación para reponer</span>`
const sinCargarTxt = (n) => `<span style="color: ${T.deepWarn}; font-weight: 600;">${n} sin cargar</span>`
/** Renglón de pedido de la tarjeta: ícono + texto + pastilla opcional. */
const renglonPedido = (texto, estado = '', mudo = false) => `<div style="display: flex; align-items: flex-start; gap: 7px; font-size: 12.5px; color: ${mudo ? T.muted : T.ink};">${ic('truck', 14, mudo ? T.faint : PH, 1.8, ' margin-top: 1px;')}<span style="min-width: 0;">${texto}</span>${estado}</div>`
const paraElQueViene = (contenido = 'sin pedido', estado = '') => renglonPedido(`Para el período que viene: ${contenido}`, estado, !estado)

/** La franja del corte (RD6): días que faltan y cuántos estudios siguen sin pedido. */
const franja = (texto, sub, tono = 'normal') => `<div style="display: flex; align-items: center; gap: 10px; margin: 0 0 14px; flex-wrap: wrap;">
  ${ic('calendar', 16, tono === 'warn' ? T.deepWarn : PH)}
  <span style="font-size: 14px; font-weight: 600; color: ${tono === 'warn' ? T.deepWarn : T.ink};">${texto}</span>
  <span style="font-size: 12.5px; color: ${T.inkSoft};">${sub}</span>
</div>`

const grilla = (tarjetas, cols = 4) => `<div style="display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: 14px;">${tarjetas.join('')}</div>`

const tarjetasRecorrido = [
  tarjetaEstudio({ codigo: '222714', nombre: 'ENDURA', principal: paraComprar(11), detalle: `2 medicamentos · ${sinCargarTxt(1)}`, pedidos: [paraElQueViene()] }),
  tarjetaEstudio({ codigo: 'ACT18301', nombre: 'ACT', principal: paraComprar(6), detalle: '1 medicamento', pedidos: [paraElQueViene()] }),
  tarjetaEstudio({ codigo: 'CKJX839D12302', nombre: 'Victorion', principal: sinMedicacion, link: false }),
  tarjetaEstudio({ codigo: 'LTS17231', nombre: 'Extensión de ACT18301', principal: cubierto, pedidos: [paraElQueViene('no hace falta pedir'), renglonPedido('Pedido Nº 13 · falta 1 envase')] }),
]

const main = page(vista(
  cabecera({ acciones: accion('Día de corte: 28', 'calendar') }),
  franja('Corte el 28/09 · faltan 12 días', 'Período 29/08 al 28/09 · 2 estudios tienen compras y todavía no tienen pedido.') + grilla(tarjetasRecorrido),
))

// ═══════════════════════════ 2 · El estudio (libro + boleta) ═══════════════════════════

const COLS = 'grid-template-columns: minmax(0, 1fr) 84px 84px 84px 96px 190px 44px;'
const COLS_CERRADO = 'grid-template-columns: minmax(0, 1fr) 96px 96px 96px 96px;'
/** RD9: encabezado agrupado — había/entró/salió/hay son de ESTE período; «Comprar», del que viene. */
const cabTabla = (periodo, ultima = 'Comprar') => `<div style="display: grid; ${ultima ? COLS : COLS_CERRADO} border-bottom: 1px solid ${T.line};">
  <div></div>
  <div style="grid-column: span 4; padding: 10px 16px 0; font-size: 11.5px; font-weight: 600; color: ${T.inkSoft}; text-align: center; padding-bottom: 7px;">${periodo}</div>
  ${ultima ? `<div style="padding: 10px 16px 0; font-size: 11.5px; font-weight: 600; color: ${T.inkSoft}; text-align: right; padding-bottom: 7px; border-left: 1px solid ${T.line};">Para el que viene</div><div></div>` : ''}
</div>
<div style="display: grid; ${ultima ? COLS : COLS_CERRADO} border-bottom: 1px solid ${T.line2};">
  ${th('Medicamento')}${th('Había', 'right')}${th('Entró', 'right')}${th('Salió', 'right')}${th(ultima ? 'Hay' : 'Quedó', 'right')}${ultima ? `<div style="border-left: 1px solid ${T.line};">${th(ultima, 'right')}</div><div></div>` : ''}
</div>`
/** Con un aviso, el nombre lleva «⚠ 1 aviso» con texto (RD14: nunca sólo el ícono). */
const nombreMed = (nombre, presentacion, avisos = 0) => `<div style="padding: 13px 16px; min-width: 0;">
  <div style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: ${T.ink};"><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nombre}</span>${avisos ? `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 600; color: ${T.deepWarn}; white-space: nowrap;">${ic('alert', 13, T.deepWarn, 1.9)}${avisos} ${avisos === 1 ? 'aviso' : 'avisos'}</span>` : ''}</div>
  <div style="font-size: 11.5px; color: ${T.inkSoft}; margin-top: 2px;">${presentacion}</div>
</div>`
const celda = (contenido, align = 'right') => `<div style="padding: 13px 16px; text-align: ${align};">${contenido}</div>`
const hayCelda = (hay, ajuste = '') => `<div style="padding: 13px 16px; text-align: right;">${num(hay)}${ajuste ? `<div style="font-size: 11px; color: ${T.inkSoft}; margin-top: 2px; white-space: nowrap;">${ajuste}</div>` : ''}</div>`
const filaLibro = ({ nombre, presentacion, habia, entro, salio, hay, ajuste = '', comprar, abierto = false, ultimo = false, avisos = 0 }) => `<div style="display: grid; ${COLS} align-items: center; ${ultimo && !abierto ? '' : `border-bottom: 1px solid ${T.line};`}${abierto ? ` background: ${T.surface};` : ''}">
  ${nombreMed(nombre, presentacion, avisos)}
  ${celda(num(habia))}${celda(num(entro))}${celda(num(salio))}${hayCelda(hay, ajuste)}
  <div style="padding: 13px 16px; display: flex; align-items: baseline; justify-content: flex-end; gap: 6px; border-left: 1px solid ${T.line}; align-self: stretch; align-items: center;">${comprar}</div>
  <div style="display: grid; place-items: center;">${ic(abierto ? 'chevronUp' : 'chevronDown', 16, T.muted)}</div>
</div>`
const filaCerrada = ({ nombre, presentacion, habia, entro, salio, quedo, ultimo = false }) => `<div style="display: grid; ${COLS_CERRADO} align-items: center; ${ultimo ? '' : `border-bottom: 1px solid ${T.line};`}">
  ${nombreMed(nombre, presentacion)}${celda(num(habia))}${celda(num(entro))}${celda(num(salio))}${celda(num(quedo))}
</div>`
const comprarN = (n) => `<span style="display: inline-flex; align-items: baseline; gap: 6px;">${grande(n)}${envasesTxt(n)}</span>`
const sinCargar = `<span style="display: inline-flex; align-items: center; gap: 10px;"><span style="font-size: 12.5px; font-weight: 600; color: ${T.deepWarn};">Sin cargar</span>${btnChico('Cargar', ic('pencil', 13, PH))}</span>`
const noSeCompra = `<span style="font-size: 12.5px; color: ${T.muted};">No se compra</span>`
const enCamino = (n) => `<span style="font-size: 13px; font-weight: 600; color: ${T.ink};"><span class="mono">${n}</span> en camino</span>`

/** La boleta (variante A del 16/09): arriba lo que hace falta, cada resta en su renglón, abajo «A comprar». */
const lineaBoleta = (titulo, aclaracion, signo, valor) => `<div style="display: grid; grid-template-columns: minmax(0, 1fr) 20px 44px; align-items: baseline; gap: 6px; padding: 6px 0;">
  <div style="min-width: 0;">
    <div style="font-size: 13px; color: ${T.ink};">${titulo}</div>
    <div style="font-size: 11.5px; color: ${T.inkSoft}; margin-top: 2px;">${aclaracion}</div>
  </div>
  <span class="mono" style="font-size: 14px; color: ${T.inkSoft}; text-align: right;">${signo}</span>
  <span class="mono" style="font-size: 14px; color: ${T.ink}; text-align: right;">${valor}</span>
</div>`
const totalBoleta = (valor, alcanzaTxt = '') => `<div style="display: grid; grid-template-columns: minmax(0, 1fr) 20px 44px; align-items: baseline; gap: 6px; padding: 9px 0 2px; margin-top: 4px; border-top: 1px solid ${T.line2};">
  <span style="font-size: 13.5px; font-weight: 600; color: ${T.ink};">A comprar${alcanzaTxt ? `<span style="font-weight: 400; color: ${T.deepGood};"> · ${alcanzaTxt}</span>` : ''}</span>
  <span class="mono" style="font-size: 15px; color: ${T.inkSoft}; text-align: right;">=</span>
  <span class="mono" style="font-size: 15px; font-weight: 700; color: ${T.ink}; text-align: right;">${valor}</span>
</div>`
const boleta = (lineas, total, pie = '', alcanzaTxt = '') => `<div style="max-width: 470px;">${lineas.join('')}${totalBoleta(total, alcanzaTxt)}${pie}</div>`
const panelAbierto = (inner) => `<div style="padding: 6px 16px 18px 16px; background: ${T.surface}; border-bottom: 1px solid ${T.line};">${inner}</div>`
const pieBoleta = `<div style="display: flex; gap: 8px; margin-top: 12px;">${btnChico('Cambiar cómo se repone', ic('pencil', 13, PH))}</div>`

const boletaSalbutral = boleta([
  lineaBoleta('Hacen falta para el período que viene', '8 pacientes, 1 envase por mes', '', '8'),
  lineaBoleta('Van a quedar en el estante al corte', 'hay 5, y 4 pacientes todavía no retiraron', '−', '1'),
], '7', pieBoleta)

const resumenPeriodo = (texto, numero, detalle, derecha = '') => `<div style="display: flex; align-items: center; gap: 20px; padding: 16px 20px; margin: 0 0 14px; background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px;">
  <div style="flex: 1; min-width: 0;">
    <div style="font-size: 12.5px; color: ${T.inkSoft};">${texto}</div>
    <div style="display: flex; align-items: baseline; gap: 8px; margin-top: 2px; flex-wrap: wrap;">${numero}</div>
  </div>
  <div style="font-size: 12.5px; color: ${T.inkSoft}; text-align: right;">${detalle}</div>
  ${derecha}
</div>`

const volver = `<div style="width: 38px; height: 38px; border-radius: 10px; border: 1px solid ${T.line2}; background: ${T.white}; display: grid; place-items: center; flex: 0 0 auto;">${ic('arrowLeft', 18, T.ink)}</div>`
const encabezadoEstudio = (derecha) => `<div style="display: flex; align-items: center; gap: 12px; margin: 0 0 12px;">
  ${volver}
  <span class="mono" style="font-family: ${DISPLAY}; font-weight: 700; font-size: 20px; letter-spacing: -0.01em; color: ${PH};">222714</span>
  <span style="font-size: 15px; font-weight: 600; color: ${T.ink};">ENDURA</span>
  ${puntoEstado()}
  <div style="margin-left: auto; display: flex; gap: 8px;">${derecha}</div>
</div>`
const flecha = (dir, activa = true) => `<div style="width: 32px; height: 32px; border-radius: 9px; border: 1px solid ${activa ? T.line2 : T.line}; background: ${T.white}; display: grid; place-items: center; ${activa ? '' : 'opacity: 0.45;'}">${ic(dir, 15, activa ? T.ink : T.faint)}</div>`
const navPeriodo = (texto, sub, siguiente = false, tonoSub = 'normal') => `<div style="display: flex; align-items: center; gap: 8px; margin: 0 0 14px 50px;">
  ${flecha('chevronLeft')}
  <span class="mono" style="font-size: 14px; font-weight: 600; color: ${T.ink}; padding: 0 4px;">${texto}</span>
  ${flecha('chevronRight', siguiente)}
  <span style="font-size: 12.5px; color: ${tonoSub === 'warn' ? T.deepWarn : T.inkSoft}; margin-left: 6px; font-weight: ${tonoSub === 'warn' ? 600 : 400};">${sub}</span>
</div>`

const seccionPedidos = (filas, extra = '') => `<div style="margin-top: 22px;${extra}">
  <div style="display: flex; align-items: center; gap: 12px; margin: 0 0 10px;">
    <h2 style="font-family: ${DISPLAY}; font-size: 16.5px; font-weight: 700; letter-spacing: -0.01em; margin: 0; color: ${T.ink};">Pedidos del estudio</h2>
    <div style="flex: 1; height: 1px; background: ${T.line};"></div>
  </div>
  ${card(filas.join(''))}
</div>`
const filaPedido = ({ numero, emitido, para, estado, envases, ultimo = false, reimprimir = false }) => `<div style="display: grid; grid-template-columns: 130px 150px minmax(0, 1fr) auto auto; align-items: center; gap: 14px; padding: 11px 16px; ${ultimo ? '' : `border-bottom: 1px solid ${T.line};`}">
  <span class="mono" style="font-family: ${DISPLAY}; font-weight: 700; font-size: 15px; color: ${T.ink};">Pedido Nº ${numero}</span>
  <span style="font-size: 12.5px; color: ${T.inkSoft};">Emitido el <span class="mono">${emitido}</span></span>
  <span style="font-size: 12.5px; color: ${T.inkSoft};">Para el período <span class="mono">${para}</span> · ${envases} envases</span>
  ${estado}
  <div style="display: flex; gap: 6px;">${reimprimir ? btnChico('Reimprimir', ic('printer', 13, PH)) : ''}${btnChico('Ver', ic('eye', 13, PH))}</div>
</div>`

const tablaEstudio = (filas) => card(cabTabla('Este período · 29/08 al 28/09') + filas.join(''))

const estudio = page(vista(
  cabecera({ migas: ['222714'] }),
  encabezadoEstudio(accion('Armar pedido', 'cart', true))
  + navPeriodo('29/08 al 28/09', 'Período en curso · el corte es en 12 días')
  + resumenPeriodo(
    'Para el período que viene (29/09 al 28/10)',
    `${grande(11)}${envasesTxt(11)}<span style="font-size: 12.5px; color: ${T.deepWarn}; font-weight: 600;">+ 1 medicamento sin cargar</span>`,
    '2 medicamentos para comprar · todavía sin pedido',
  )
  + tablaEstudio([
    filaLibro({ nombre: 'Montelukast 10 mg', presentacion: 'Comprimidos', habia: 0, entro: 0, salio: 0, hay: 0, comprar: sinCargar }),
    filaLibro({ nombre: 'Salbutral 100 mcg', presentacion: 'Aerosol', habia: 2, entro: 6, salio: 3, hay: 5, comprar: comprarN(7), abierto: true }),
    panelAbierto(boletaSalbutral),
    filaLibro({ nombre: 'Seretide 250/50', presentacion: 'Aerosol', habia: 5, entro: 15, salio: 12, hay: 8, comprar: comprarN(4), avisos: 1 }),
    filaLibro({ nombre: 'Tiotropio 18 mcg', presentacion: 'Cápsulas', habia: 4, entro: 0, salio: 1, hay: 2, ajuste: '−1 por ajuste', comprar: noSeCompra, ultimo: true }),
  ])
  + seccionPedidos([
    filaPedido({ numero: 12, emitido: '28/08', para: '29/08 al 28/09', envases: 17, estado: estadoPedido('recibido'), ultimo: true }),
  ]),
))

// ═══════════════════════════ 2b · El estudio el día del corte, después de emitir ═══════════════════════════

const estudioDespues = page(vista(
  cabecera({ migas: ['222714'] }),
  encabezadoEstudio(accion('Armar otro pedido', 'cart'))
  + navPeriodo('29/08 al 28/09', 'El corte es hoy', false, 'warn')
  + resumenPeriodo(
    'Para el período que viene (29/09 al 28/10)',
    `<span style="display: inline-flex; align-items: center; gap: 8px;">${ic('truck', 18, PH)}<span class="mono" style="font-family: ${DISPLAY}; font-size: 20px; font-weight: 800; color: ${T.ink};">Pedido Nº 14</span></span>${estadoPedido('sinRecibir')}`,
    'Emitido hoy · 13 envases · con esto alcanza',
    `<div style="display: flex; gap: 6px;">${btnChico('Reimprimir', ic('printer', 13, PH))}${btnChico('Ver', ic('eye', 13, PH))}</div>`,
  )
  + tablaEstudio([
    filaLibro({ nombre: 'Montelukast 10 mg', presentacion: 'Comprimidos', habia: 0, entro: 0, salio: 0, hay: 0, comprar: sinCargar }),
    filaLibro({ nombre: 'Salbutral 100 mcg', presentacion: 'Aerosol', habia: 2, entro: 6, salio: 7, hay: 1, comprar: enCamino(7) }),
    filaLibro({ nombre: 'Seretide 250/50', presentacion: 'Aerosol', habia: 5, entro: 15, salio: 12, hay: 8, comprar: enCamino(6), avisos: 1 }),
    filaLibro({ nombre: 'Tiotropio 18 mcg', presentacion: 'Cápsulas', habia: 4, entro: 0, salio: 1, hay: 2, ajuste: '−1 por ajuste', comprar: noSeCompra, ultimo: true }),
  ])
  + seccionPedidos([
    filaPedido({ numero: 14, emitido: '28/09', para: '29/09 al 28/10', envases: 13, estado: estadoPedido('sinRecibir'), reimprimir: true }),
    filaPedido({ numero: 12, emitido: '28/08', para: '29/08 al 28/09', envases: 17, estado: estadoPedido('recibido'), ultimo: true }),
  ]),
))

// ═══════════════════════════ 3 · Armar pedido ═══════════════════════════

const COLS_PED = 'grid-template-columns: minmax(0, 1fr) 110px 150px;'
const filaBorrador = ({ nombre, presentacion, calculado, pedir, cambio = false, ultimo = false }) => `<div style="display: grid; ${COLS_PED} align-items: center; gap: 8px; padding: 11px 0; ${ultimo ? '' : `border-bottom: 1px solid ${T.line};`}">
  <div style="min-width: 0;">
    <div style="font-size: 14px; color: ${T.ink};">${nombre}</div>
    <div style="font-size: 11.5px; color: ${T.inkSoft}; margin-top: 2px;">${presentacion}</div>
  </div>
  <div style="text-align: right;">${calculado === null ? `<span style="font-size: 12.5px; font-weight: 600; color: ${T.deepWarn};">Sin cargar</span>` : num(calculado, T.inkSoft)}</div>
  <div style="display: flex; justify-content: flex-end;">${inputNum(pedir, '', 84, cambio)}</div>
</div>`
const cabBorrador = `<div style="display: grid; ${COLS_PED} gap: 8px; border-bottom: 1px solid ${T.line2};">
  ${['Medicamento', 'Calculado', 'Pedir'].map((t, i) => `<div style="padding: 0 0 8px; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.inkSoft};${i ? ' text-align: right;' : ''}">${t}</div>`).join('')}
</div>`
const cuerpoPedido = (pie) => `${cabBorrador}
  ${filaBorrador({ nombre: 'Montelukast 10 mg', presentacion: 'Comprimidos · se pide a mano', calculado: null, pedir: '0' })}
  ${filaBorrador({ nombre: 'Salbutral 100 mcg', presentacion: 'Aerosol', calculado: 7, pedir: '7' })}
  ${filaBorrador({ nombre: 'Seretide 250/50', presentacion: 'Aerosol', calculado: 4, pedir: '6', cambio: true, ultimo: true })}
  <div style="margin-top: 12px;">${avisoItem('Seretide 250/50: pedís 6, Spira calculó 4.')}</div>
  <div style="display: flex; align-items: baseline; gap: 8px; padding: 12px 0 0; margin-top: 8px; border-top: 1px solid ${T.line};">
    <span style="font-size: 13px; color: ${T.inkSoft};">En el pedido</span>
    <span class="mono" style="font-family: ${DISPLAY}; font-size: 18px; font-weight: 800; color: ${T.ink};">13</span>${envasesTxt(13)}
    <span style="font-size: 13px; color: ${T.inkSoft};">· 2 medicamentos</span>
  </div>
  ${pie}
  <div style="display: flex; gap: 10px; margin-top: 18px;">${btnOutline('Cancelar')}<div style="flex: 1;"></div>${btnPrimary(`${ic('printer', 16, T.onAccent)}Emitir e imprimir`)}</div>`
const armarPedido = page(modal(
  'Pedido de 222714 · ENDURA',
  cuerpoPedido(`<div style="font-size: 12.5px; color: ${T.inkSoft}; margin-top: 6px; line-height: 1.45;">Se guarda con número y queda para recibirlo en Recepción. Un renglón en 0 no va al pedido.</div>`),
  560,
  'Para el período 29/09 al 28/10. Tiotropio no aparece: no se compra.',
))
const errorEmitir = page(modal(
  'Pedido de 222714 · ENDURA',
  cuerpoPedido(`<div style="margin-top: 10px;">${avisoItem('No se pudo emitir el pedido. Antes de volver a intentarlo, fijate en la lista del estudio si quedó hecho.', 'danger')}</div>`),
  560,
  'Para el período 29/09 al 28/10. Tiotropio no aparece: no se compra.',
))

// ═══════════════════════════ 4 · La hoja (impresion.tsx: Membrete, FilaKv, th/tdImpresa, Pie) ═══════════════════════════

// Las tres últimas columnas se llenan A MANO en la farmacia: renglones altos, aire a la izquierda y dos
// renglones por medicamento, por si entrega dos lotes (RD11).
const thI = (t, align = 'left', w = '', izq = 0) => `<th style="text-align: ${align}; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 8px 6px ${izq}px; border-bottom: 1px solid #000; color: #000;${w ? ` width: ${w};` : ''}">${t}</th>`
const tdI = (t, align = 'left', izq = 0, borde = '1px solid #999') => `<td style="padding: 12px 8px 12px ${izq}px; border-bottom: ${borde}; font-size: 10.5px; vertical-align: top; text-align: ${align}; color: #000;">${t}</td>`
const kv = (k, v) => `<tr><td style="padding: 5px 0; border-bottom: 1px solid #999; font-size: 11.5px; width: 46%; color: #000;">${k}</td><td style="padding: 5px 0; border-bottom: 1px solid #999; font-size: 11.5px; font-weight: 700; color: #000;">${v}</td></tr>`
const renglonesMed = (nombre, presentacion, pedido) => `<tr>${tdI(`<b>${nombre}</b>`, 'left', 0, '1px dotted #bbb')}${tdI(presentacion, 'left', 0, '1px dotted #bbb')}${tdI(`<b class="mono">${pedido}</b>`, 'right', 0, '1px dotted #bbb')}${tdI('', 'left', 18, '1px dotted #bbb')}${tdI('', 'left', 12, '1px dotted #bbb')}${tdI('', 'left', 12, '1px dotted #bbb')}</tr>
      <tr>${tdI('')}${tdI('')}${tdI('')}${tdI('', 'left', 18)}${tdI('', 'left', 12)}${tdI('', 'left', 12)}</tr>`
const hoja = page(`<div style="width: 794px; height: 1123px; background: #FFFFFF; color: #000; padding: 56px 60px; font-family: 'Inter', system-ui, sans-serif; display: flex; flex-direction: column;">
  <div style="border-bottom: 1px solid #000; padding-bottom: 7px; margin-bottom: 12px;">
    <b style="font-family: ${DISPLAY}; font-size: 17px; font-weight: 700; display: block;">Spira · Fundación Scherbovsky</b>
    <span style="font-size: 11px;">Farmacia de investigación</span>
  </div>
  <div style="display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid #000; padding-bottom: 6px; margin-bottom: 10px;">
    <b style="font-size: 13px; letter-spacing: 0.07em;">PEDIDO DE MEDICACIÓN</b>
    <span class="mono" style="margin-left: auto; font-family: ${DISPLAY}; font-size: 26px; font-weight: 800;">Nº 14</span>
  </div>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;"><tbody>
    ${kv('Estudio', '222714 · ENDURA')}
    ${kv('Para el período', '29/09/2026 al 28/10/2026')}
    ${kv('Emitido', '28/09/2026 · Lautaro Molina')}
  </tbody></table>
  <table style="width: 100%; border-collapse: collapse;">
    <thead><tr>${thI('Medicamento', 'left', '32%')}${thI('Presentación', 'left', '14%')}${thI('Pedido', 'right', '9%')}${thI('Entregado', 'left', '13%', 18)}${thI('Lote', 'left', '16%', 12)}${thI('Vence', 'left', '16%', 12)}</tr></thead>
    <tbody>
      ${renglonesMed('Salbutral 100 mcg', 'Aerosol', 7)}
      ${renglonesMed('Seretide 250/50', 'Aerosol', 6)}
    </tbody>
  </table>
  <div style="font-size: 10.5px; margin-top: 8px;">Total pedido: <b class="mono">13 envases</b> de 2 medicamentos. Si un medicamento llega en dos lotes, usá el segundo renglón.</div>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 40px; margin-top: 64px;">
    <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 10px;">Entregó (farmacia) · firma y aclaración</div>
    <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 10px;">Recibió · firma y aclaración</div>
  </div>
  <div style="margin-top: 22px; padding: 9px 12px; border: 1px solid #000; font-size: 11px; font-weight: 700;">Devolver esta hoja junto con la medicación. En Recepción se recibe con el número del pedido.</div>
  <div style="flex: 1;"></div>
  <div style="display: flex; margin-top: 20px; padding-top: 8px; border-top: 1px solid #999; font-size: 9px; color: #666;">
    <span>Spira · Farmacia — Fundación Scherbovsky</span><span style="margin-left: auto;">28/09/2026 18:42</span>
  </div>
</div>`, '#E9E5DB')

// ═══════════════════════════ 5 · El pedido (detalle) ═══════════════════════════

const COLS_DET = 'grid-template-columns: minmax(0, 1fr) 64px 76px 56px 150px;'
const cabDet = `<div style="display: grid; ${COLS_DET} gap: 8px; border-bottom: 1px solid ${T.line2};">
  ${['Medicamento', 'Pedido', 'Recibido', 'Falta', ''].map((t, i) => `<div style="padding: 0 0 8px; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.inkSoft};${i > 0 ? ' text-align: right;' : ''}">${t}</div>`).join('')}
</div>`
const filaDet = ({ nombre, presentacion, pedido, recibido, falta, accionDet = '', ultimo = false, extra = '', nota = '' }) => `<div style="${ultimo ? '' : `border-bottom: 1px solid ${T.line};`}">
  <div style="display: grid; ${COLS_DET} gap: 8px; align-items: center; padding: 11px 0;">
    <div style="min-width: 0;"><div style="font-size: 14px; color: ${T.ink};">${nombre}</div><div style="font-size: 11.5px; color: ${T.inkSoft}; margin-top: 2px;">${nota || presentacion}</div></div>
    <div style="text-align: right;">${num(pedido)}</div>
    <div style="text-align: right;">${num(recibido)}</div>
    <div style="text-align: right;">${num(falta, falta === 0 ? T.inkSoft : T.deepWarn)}</div>
    <div style="display: flex; justify-content: flex-end;">${accionDet}</div>
  </div>
  ${extra}
</div>`
const recepcionesDelPedido = (texto) => `<div style="margin-top: 16px;">
  ${subtitulo('Recepciones de este pedido')}
  <div style="display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: ${T.ink}; padding: 4px 0;">${ic('clipboardCheck', 15, PH)}${texto}</div>
</div>`
const subDetalle = '222714 · ENDURA · para el período 29/09 al 28/10 · emitido el 28/09 por Lautaro Molina'
const pieDetalle = `<div style="display: flex; gap: 10px; margin-top: 18px;">${btnOutline(`${ic('printer', 16, T.ink)}Reimprimir`)}<div style="flex: 1;"></div>${btnOutline('Cerrar')}</div>`
const pedidoDetalle = page(modal(
  'Pedido Nº 14',
  `<div style="display: flex; align-items: center; gap: 10px; margin: 0 0 14px;">${estadoPedido('enParte')}<span style="font-size: 12.5px; color: ${T.inkSoft};">Falta 1 envase</span></div>
  ${cabDet}
  ${filaDet({ nombre: 'Salbutral 100 mcg', presentacion: 'Aerosol', pedido: 7, recibido: 7, falta: 0 })}
  ${filaDet({ nombre: 'Seretide 250/50', presentacion: 'Aerosol', pedido: 6, recibido: 5, falta: 1, accionDet: btnChico('No va a llegar'), ultimo: true })}
  ${recepcionesDelPedido(`<span class="mono" style="font-weight: 600;">Recepción Nº 1051</span><span style="color: ${T.inkSoft};">02/10 · verificada por Agustín Bazzani · 12 envases</span>`)}
  <div style="font-size: 12.5px; color: ${T.inkSoft}; margin-top: 14px; line-height: 1.45;">Ya tiene una recepción, así que no se puede anular. Lo que falta sigue en camino hasta que llegue o se cierre.</div>
  ${pieDetalle}`,
  580,
  subDetalle,
))

const pedidoLlego = page(modal(
  'Pedido Nº 14',
  `<div style="display: flex; align-items: center; gap: 10px; margin: 0 0 14px;">${estadoPedido('llego')}<span style="font-size: 12.5px; color: ${T.inkSoft};">El stock se actualiza cuando se verifica la recepción.</span></div>
  ${cabDet}
  ${filaDet({ nombre: 'Salbutral 100 mcg', presentacion: 'Aerosol', pedido: 7, recibido: 0, falta: 7, nota: 'Aerosol · 7 en la recepción sin verificar' })}
  ${filaDet({ nombre: 'Seretide 250/50', presentacion: 'Aerosol', pedido: 6, recibido: 0, falta: 6, nota: 'Aerosol · 5 en la recepción sin verificar', ultimo: true })}
  ${recepcionesDelPedido(`<span class="mono" style="font-weight: 600;">Recepción Nº 1051</span><span style="color: ${T.deepWarn};">02/10 · sin verificar · 12 envases</span>`)}
  ${pieDetalle}`,
  580,
  subDetalle,
))

const renglonCerrado = page(modal(
  'Pedido Nº 14',
  `<div style="display: flex; align-items: center; gap: 10px; margin: 0 0 14px;">${estadoPedido('recibido', 'Recibido · faltó 1')}</div>
  ${cabDet}
  ${filaDet({ nombre: 'Salbutral 100 mcg', presentacion: 'Aerosol', pedido: 7, recibido: 7, falta: 0 })}
  ${filaDet({ nombre: 'Seretide 250/50', presentacion: 'Aerosol', pedido: 6, recibido: 5, falta: 0, nota: 'No va a llegar · La farmacia no lo tiene · 05/10, Lautaro Molina', accionDet: btnChico('Reabrir', ic('rotateCcw', 13, PH)), ultimo: true })}
  <div style="font-size: 12.5px; color: ${T.inkSoft}; margin-top: 14px; line-height: 1.45;">Si al final la farmacia lo manda, «Reabrir» lo vuelve a poner en camino y se recibe con este pedido. Queda registrado quién y cuándo.</div>
  ${pieDetalle}`,
  580,
  subDetalle,
))

// ═══════════════════════════ 6 · Recepción: el botón y la lista ═══════════════════════════

const recepcionCabecera = page(vista(
  cabecera({ sub: 'Recepción', acciones: accion('Recibir un pedido', 'truck') + accion('Nueva recepción', 'plus', true) }),
  `<div style="opacity: 0.45;">${card(`<div style="padding: 14px 16px; font-size: 13px; color: ${T.inkSoft};">La lista de recepciones sigue igual debajo.</div>`)}</div>`,
))

const filaRecibir = ({ numero, codigo, nombre, meta, estado, aviso = '', ultimo = false }) => `<div style="display: grid; grid-template-columns: 112px minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 13px 0; ${ultimo ? '' : `border-bottom: 1px solid ${T.line};`}">
  <span class="mono" style="font-family: ${DISPLAY}; font-weight: 700; font-size: 15px; color: ${T.ink};">Pedido Nº ${numero}</span>
  <div style="min-width: 0;">
    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;"><span class="mono" style="font-size: 14px; font-weight: 700; color: ${PH};">${codigo}</span><span style="font-size: 13.5px; color: ${T.ink};">${nombre}</span>${estado}</div>
    <div style="font-size: 12.5px; color: ${T.inkSoft}; margin-top: 3px;">${meta}</div>
    ${aviso}
  </div>
  ${btnOutline(`${ic('truck', 15, T.ink)}Recibir`, 36)}
</div>`
const recibirPedido = page(modal(
  'Recibir un pedido',
  `${filaRecibir({ numero: 13, codigo: 'LTS17231', nombre: 'Extensión de ACT18301', meta: 'Emitido el 27/08 · falta 1 envase de 1 medicamento', estado: estadoPedido('enParte') })}
  ${filaRecibir({ numero: 14, codigo: '222714', nombre: 'ENDURA', meta: 'Emitido el 28/09 · faltan 13 envases de 2 medicamentos', estado: estadoPedido('sinRecibir') })}
  ${filaRecibir({ numero: 15, codigo: 'ACT18301', nombre: 'ACT', meta: 'Emitido el 28/09 · faltan 6 envases de 1 medicamento', estado: estadoPedido('llego'), aviso: `<div style="margin-top: 4px;">${avisoItem('Ya tiene la recepción Nº 1043 sin verificar: fijate antes de recibirlo de nuevo.', 'warn')}</div>`, ultimo: true })}`,
  620,
  'Los pedidos con algo por recibir, del más viejo al más nuevo. Buscá el número que figura en la hoja.',
))
const recibirVacio = page(modal(
  'Recibir un pedido',
  `<div style="display: flex; align-items: center; gap: 14px; padding: 8px 0 4px;">
    <span style="width: 52px; height: 52px; border-radius: 14px; background: rgba(15, 95, 87, 0.08); display: grid; place-items: center; flex: 0 0 auto;">${ic('truck', 22, PH, 1.9)}</span>
    <div><div style="font-family: ${DISPLAY}; font-size: 17px; font-weight: 700; color: ${T.ink};">No hay pedidos por recibir</div>
    <div style="font-size: 13.5px; color: ${T.muted}; margin-top: 3px; line-height: 1.45;">Los pedidos se arman desde Reposición. Si llegó medicación sin pedido, cargala con «Nueva recepción».</div></div>
  </div>
  <div style="display: flex; margin-top: 18px;"><div style="flex: 1;"></div>${btnOutline('Cerrar')}</div>`,
  520,
))

// ═══════════════════════════ 7 · El asistente arranca con el pedido (Step1Scan) y su resumen ═══════════════════════════

const stepper = (n, nombre) => `<div style="display: inline-flex; align-items: center; gap: 6px;" aria-label="Cantidad de ${nombre}">
  <div style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid ${T.line2}; background: ${T.white}; display: grid; place-items: center;">${ic('minus', 15, T.ink)}</div>
  <span class="mono" style="min-width: 30px; text-align: center; font-family: ${DISPLAY}; font-weight: 700; font-size: 15px;">${n}</span>
  <div style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid ${T.line2}; background: ${T.white}; display: grid; place-items: center;">${ic('plus', 15, T.ink)}</div>
</div>`
const filaEscaneo = ({ nombre, codigo, n, meta, metaTono = 'normal', primero = false }) => `<div style="display: flex; align-items: center; gap: 14px; padding: 11px 18px; ${primero ? '' : `border-top: 1px solid ${T.line};`}">
  <div style="flex: 1; min-width: 0;">
    <div style="font-size: 14.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nombre}</div>
    <div class="mono" style="font-size: 12px; color: ${T.muted}; margin-top: 1px;">${codigo}</div>
  </div>
  <span style="font-size: 12.5px; color: ${metaTono === 'warn' ? T.deepWarn : T.inkSoft}; white-space: nowrap; font-weight: ${metaTono === 'warn' ? 600 : 400};">${meta}</span>
  ${stepper(n, nombre)}
</div>`
const bannerPedido = (texto) => `<div style="display: flex; align-items: center; gap: 12px; padding: 13px 16px; background: ${T.white}; border: 1px solid ${T.line}; border-radius: 12px;">
  <span style="width: 34px; height: 34px; border-radius: 9px; background: rgba(15, 95, 87, 0.08); display: grid; place-items: center; flex: 0 0 auto;">${ic('truck', 17, PH)}</span>
  <div style="flex: 1; min-width: 0;">
    <div style="font-size: 14px; font-weight: 600; color: ${T.ink};">Recibiendo el pedido Nº 14 · <span class="mono" style="color: ${PH};">222714</span> ENDURA</div>
    <div style="font-size: 12.5px; color: ${T.inkSoft}; margin-top: 2px;">${texto}</div>
  </div>
</div>`
const asistente = page(`<div style="width: 900px; padding: 28px 40px;">
  <div style="display: flex; flex-direction: column; gap: 14px; max-width: 820px; margin: 0 auto;">
    ${bannerPedido('Vienen puestos los 2 medicamentos con lo que falta. Si llegó menos, bajá la cantidad: lo que falta queda en el pedido.')}
    ${card(`${filaEscaneo({ nombre: 'Salbutral 100 mcg', codigo: '7791234567890', n: 7, meta: 'se pidieron 7', primero: true })}
      ${filaEscaneo({ nombre: 'Seretide 250/50', codigo: '7790987654321', n: 5, meta: 'se pidieron 6' })}
      ${filaEscaneo({ nombre: 'Budesonida 200 mcg', codigo: '7795555555555', n: 2, meta: 'No estaba en el pedido', metaTono: 'warn' })}`)}
    <p style="margin: 0; font-size: 12.5px; color: ${T.inkSoft}; text-align: center;">El resto del asistente sigue igual: lotes y vencimientos. Al final, el resumen compara lo pedido con lo que llega.</p>
  </div>
</div>`)

const COLS_RES = 'grid-template-columns: minmax(0, 1fr) 80px 80px minmax(0, 1.1fr);'
const filaResumen = (nombre, pedido, llega, queda, tono = 'normal', ultimo = false) => `<div style="display: grid; ${COLS_RES} gap: 10px; align-items: center; padding: 11px 18px; ${ultimo ? '' : `border-bottom: 1px solid ${T.line};`}">
  <span style="font-size: 14px; color: ${T.ink};">${nombre}</span>
  <span class="mono" style="font-size: 14px; text-align: right; color: ${T.ink};">${pedido}</span>
  <span class="mono" style="font-size: 14px; text-align: right; color: ${T.ink};">${llega}</span>
  <span style="font-size: 12.5px; color: ${tono === 'warn' ? T.deepWarn : T.inkSoft}; font-weight: ${tono === 'warn' ? 600 : 400};">${queda}</span>
</div>`
const resumenRecepcion = page(`<div style="width: 900px; padding: 28px 40px;">
  <div style="display: flex; flex-direction: column; gap: 14px; max-width: 820px; margin: 0 auto;">
    ${bannerPedido('Lo pedido contra lo que llega. Lo que falta queda en camino en el pedido.')}
    ${card(`<div style="display: grid; ${COLS_RES} gap: 10px; padding: 10px 18px 8px; border-bottom: 1px solid ${T.line2};">
        ${['Medicamento', 'Pedido', 'Llega', ''].map((t, i) => `<div style="font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.inkSoft};${i === 1 || i === 2 ? ' text-align: right;' : ''}">${t}</div>`).join('')}
      </div>
      ${filaResumen('Salbutral 100 mcg', 7, 7, 'Completo')}
      ${filaResumen('Seretide 250/50', 6, 5, 'Queda 1 en camino', 'warn')}
      ${filaResumen('Budesonida 200 mcg', '—', 2, 'No estaba en el pedido: se recibe igual', 'warn', true)}`)}
    <div style="display: flex; gap: 10px;">${btnOutline('Atrás')}<div style="flex: 1;"></div>${btnPrimary('Crear recepción')}</div>
  </div>
</div>`)

// ═══════════════════════════ Casos · la tarjeta en todos sus estados ═══════════════════════════

const estadosTarjeta = page(vista(
  cabecera(),
  grilla([
    tarjetaEstudio({ codigo: '222714', nombre: 'Falta pedir (antes del corte)', principal: paraComprar(11), detalle: `2 medicamentos · ${sinCargarTxt(1)}`, pedidos: [paraElQueViene()] }),
    tarjetaEstudio({ codigo: '222714', nombre: 'Pedido emitido', principal: `<span style="display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; color: ${T.ink};">${ic('truck', 16, PH)}Pedido Nº 14</span>${estadoPedido('sinRecibir')}`, detalle: '13 envases para el 29/09 al 28/10', pedidos: [] }),
    tarjetaEstudio({ codigo: '222714', nombre: 'Llegó, sin verificar', principal: `<span style="display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; color: ${T.ink};">${ic('truck', 16, PH)}Pedido Nº 14</span>${estadoPedido('llego')}`, detalle: 'Recepción Nº 1051 sin verificar', pedidos: [] }),
    tarjetaEstudio({ codigo: 'LTS17231', nombre: 'Mitad de mes', principal: cubierto, pedidos: [renglonPedido('Para el corte del 28/10: 12 envases · todavía sin pedido', '', true), renglonPedido('Pedido Nº 13 · falta 1 envase')] }),
    tarjetaEstudio({ codigo: '222714', nombre: 'Pasó el corte, dentro de los 5 días', principal: paraComprar(7), detalle: `<span style="color: ${T.deepWarn}; font-weight: 600;">Para el período que empezó · quedan 3 días</span>`, pedidos: [renglonPedido('Para el período 29/09 al 28/10: sin pedido', '', true)] }),
    tarjetaEstudio({ codigo: 'ACT18301', nombre: 'Nada cargado', principal: faltaCargar, detalle: '0 de 3 cargados', pedidos: [paraElQueViene()] }),
    tarjetaEstudio({ codigo: 'CKJX839D12302', nombre: 'Sin medicación de base', principal: sinMedicacion, link: false }),
    tarjetaEstudio({ codigo: '222714', nombre: 'Pedido cerrado sin entrega', principal: `<span style="display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; color: ${T.ink};">${ic('truck', 16, PH)}Pedido Nº 14</span>${estadoPedido('noLlego')}`, detalle: '13 envases vuelven a la compra', pedidos: [] }),
  ]),
))

const franjas = page(`<div style="width: 1000px; padding: 26px;">
  ${franja('Corte el 28/09 · faltan 12 días', 'Período 29/08 al 28/09 · 2 estudios tienen compras y todavía no tienen pedido.')}
  ${franja('Corte mañana (28/09)', '2 estudios sin pedido para el período que viene.')}
  ${franja('El corte es hoy', '1 estudio sin pedido para el período que viene.', 'warn')}
  ${franja('El corte fue el 28/09 · quedan 3 días para pedir el período que empezó', '1 estudio sin pedido para el 29/09 al 28/10.', 'warn')}
  ${franja('Corte el 28/10 · faltan 28 días', 'Período 29/09 al 28/10 · todos los estudios tienen su pedido.')}
</div>`)

const estadoVacio = (icono, color, titulo, texto, acc = '') => card(`<div style="display: flex; align-items: center; gap: 14px; padding: 22px 24px;">
  <span style="width: 52px; height: 52px; border-radius: 14px; background: ${color === T.danger ? 'rgba(166, 72, 59, 0.10)' : 'rgba(15, 95, 87, 0.08)'}; display: grid; place-items: center; flex: 0 0 auto;">${ic(icono, 22, color, 1.9)}</span>
  <div style="flex: 1; min-width: 0;">
    <div style="font-family: ${DISPLAY}; font-size: 17px; font-weight: 700; color: ${T.ink};">${titulo}</div>
    <div style="font-size: 13.5px; color: ${T.muted}; margin-top: 3px; line-height: 1.45;">${texto}</div>
  </div>
  ${acc}
</div>`)

const cargandoError = page(vista(
  cabecera(),
  `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px;">
    ${estadoVacio('cart', PH, 'Calculando la reposición…', 'Un momento.')}
    ${estadoVacio('alert', T.danger, 'No se pudo calcular la reposición', 'Probá de nuevo en un rato.', btnOutline(`${ic('refresh', 15, T.ink)}Reintentar`))}
  </div>`,
))

const sinCorte = page(vista(
  cabecera(),
  `<div style="max-width: 760px;">
    ${estadoVacio('calendar', PH, 'Falta el día de corte', 'Es el día del mes en que cierra cada período y se arma el pedido. Se carga una vez para toda Farmacia.', btnPrimary('Cargar el día de corte'))}
    <div style="height: 14px;"></div>
    ${estadoVacio('calendar', PH, 'Falta el día de corte', 'Farmacia todavía no lo cargó. Hasta entonces no se puede calcular la reposición.')}
    <div style="font-size: 12px; color: ${T.inkSoft}; margin-top: 8px;">Arriba lo ve quien puede cargarlo; abajo, quien sólo mira.</div>
  </div>`,
))

const diaCorte = page(modal(
  'Día de corte',
  `${label('Día del mes')}${desplegable('25', false, 120)}
  <div style="margin-top: 12px;">${avisoItem('Si lo cambiás ahora, el período en curso pasa a ser del 26/08 al 25/09. Los pedidos ya emitidos conservan su período.', 'warn')}</div>
  <div style="font-size: 12.5px; color: ${T.inkSoft}; margin-top: 6px; line-height: 1.5;">Próximos cortes: <span class="mono">25/09 · 25/10 · 25/11</span>. Si un mes no tiene ese día, corta el último.</div>
  <div style="display: flex; gap: 10px; margin-top: 18px;">${btnOutline('Cancelar')}<div style="flex: 1;"></div>${btnPrimary('Guardar')}</div>`,
  428,
  'El día del mes en que cierra cada período. Vale para todos los estudios.',
))

// ═══════════════════════════ Casos · período anterior y quien sólo mira ═══════════════════════════

const periodoAnterior = page(vista(
  cabecera({ migas: ['222714'] }),
  encabezadoEstudio('')
  + navPeriodo('29/07 al 28/08', 'Período cerrado', true)
  + `<div style="display: flex; align-items: center; gap: 9px; margin: 0 0 14px; font-size: 13px; color: ${T.inkSoft};">${ic('info', 15, T.inkSoft, 1.9)}<span>Un período cerrado muestra lo que entró y salió. La compra se arma en el período en curso.</span>${btnChico('Ir al período en curso')}</div>`
  + card(
    cabTabla('Período 29/07 al 28/08', null)
    + filaCerrada({ nombre: 'Montelukast 10 mg', presentacion: 'Comprimidos', habia: 0, entro: 0, salio: 0, quedo: 0 })
    + filaCerrada({ nombre: 'Salbutral 100 mcg', presentacion: 'Aerosol', habia: 4, entro: 0, salio: 2, quedo: 2 })
    + filaCerrada({ nombre: 'Seretide 250/50', presentacion: 'Aerosol', habia: 3, entro: 14, salio: 12, quedo: 5 })
    + filaCerrada({ nombre: 'Tiotropio 18 mcg', presentacion: 'Cápsulas', habia: 5, entro: 0, salio: 1, quedo: 4, ultimo: true }),
    ' max-width: 820px;',
  )
  + seccionPedidos([
    filaPedido({ numero: 9, emitido: '28/07', para: '29/07 al 28/08', envases: 14, estado: estadoPedido('recibido'), ultimo: true }),
  ], ' max-width: 820px;'),
))

const soloLectura = page(vista(
  cabecera({ migas: ['222714'] }),
  encabezadoEstudio('')
  + navPeriodo('29/08 al 28/09', 'Período en curso · el corte es en 12 días')
  + `<div style="display: flex; align-items: center; gap: 9px; margin: 0 0 14px; font-size: 13px; color: ${T.inkSoft};">${ic('eye', 15, T.inkSoft, 1.9)}<span>Sólo lectura: podés ver la reposición y reimprimir pedidos. Arma los pedidos quien tiene permiso de Farmacia.</span></div>`
  + tablaEstudio([
    filaLibro({ nombre: 'Montelukast 10 mg', presentacion: 'Comprimidos', habia: 0, entro: 0, salio: 0, hay: 0, comprar: `<span style="font-size: 12.5px; font-weight: 600; color: ${T.deepWarn};">Sin cargar</span>` }),
    filaLibro({ nombre: 'Salbutral 100 mcg', presentacion: 'Aerosol', habia: 2, entro: 6, salio: 3, hay: 5, comprar: comprarN(7), ultimo: true }),
  ]),
))

// ═══════════════════════════ Casos · la boleta ═══════════════════════════

const tarjetaBoleta = (titulo, estado, cuerpo) => card(`<div style="padding: 14px 18px 16px;">
  <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px;"><span style="font-size: 14px; font-weight: 600; color: ${T.ink};">${titulo}</span><span style="margin-left: auto;">${estado}</span></div>
  ${cuerpo}
</div>`)
const boletas = page(`<div style="width: 1040px; padding: 28px;">
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px;">
    ${tarjetaBoleta('Salbutral 100 mcg · a demanda', comprarN(3), boleta([
      lineaBoleta('Tener siempre', 'a demanda', '', '5'),
      lineaBoleta('Van a quedar en el estante al corte', 'hay 2', '−', '2'),
    ], '3'))}
    ${tarjetaBoleta('Seretide 250/50 · con un pedido en camino', enCamino(6), boleta([
      lineaBoleta('Hacen falta para el período que viene', '12 pacientes, 1 envase por mes', '', '12'),
      lineaBoleta('Van a quedar en el estante al corte', 'hay 8 y ya retiraron todos', '−', '8'),
      lineaBoleta('En camino', 'pedido Nº 14 del 15/09', '−', '6'),
    ], '0', '', 'alcanza'))}
    ${tarjetaBoleta('Salbutral 100 mcg · el estante no alcanza', comprarN(9), boleta([
      lineaBoleta('Hacen falta para el período que viene', '8 pacientes, 1 envase por mes', '', '8'),
      lineaBoleta('Faltan para terminar este período', '4 pacientes todavía no retiraron y en el estante no alcanza', '+', '1'),
    ], '9'))}
    ${tarjetaBoleta('Seretide 250/50 · todo vencido', comprarN(12), boleta([
      lineaBoleta('Hacen falta para el período que viene', '12 pacientes, 1 envase por mes', '', '12'),
      lineaBoleta('Van a quedar en el estante al corte', 'hay 10, todos vencidos', '−', '0'),
    ], '12'))}
    ${tarjetaBoleta('Seretide 250/50 · parte vencida', comprarN(4), boleta([
      lineaBoleta('Hacen falta para el período que viene', '12 pacientes, 1 envase por mes', '', '12'),
      lineaBoleta('Van a quedar en el estante al corte', 'hay 10, 2 vencidos, y ya retiraron todos', '−', '8'),
    ], '4'))}
    ${tarjetaBoleta('Seretide 250/50 · pedido tarde, dentro de los 5 días', comprarN(7), boleta([
      lineaBoleta('Hacen falta para el período que empezó', '12 pacientes, 1 envase por mes; retiraron 0', '', '12'),
      lineaBoleta('Hay en el estante', 'hay 5', '−', '5'),
    ], '7', `<div style="margin-top: 10px;">${avisoItem('El corte fue el 28/09. Hasta el 03/10 el pedido es para el 29/09 al 28/10; el siguiente se pide en el corte del 28/10.')}</div>`))}
  </div>
</div>`)

// ═══════════════════════════ Casos · cargar cómo se repone (en el renglón) ═══════════════════════════

const cargarRenglon = page(vista(
  cabecera({ migas: ['222714'] }),
  tablaEstudio([
    filaLibro({ nombre: 'Montelukast 10 mg', presentacion: 'Comprimidos', habia: 0, entro: 0, salio: 0, hay: 0, comprar: `<span style="font-size: 12.5px; font-weight: 600; color: ${T.deepWarn};">Sin cargar</span>`, abierto: true }),
    panelAbierto(`<div style="padding-top: 8px;">
      <div style="display: flex; gap: 32px; align-items: flex-end; flex-wrap: wrap;">
        <div>${label('Cómo se repone')}${seg(['Por mes', 'A demanda', 'No se compra'], 'Por mes')}</div>
        <div>${label('Envases por mes, por paciente')}${inputNum('1', 'envase')}</div>
      </div>
      <div style="font-size: 12.5px; color: ${T.inkSoft}; margin-top: 12px;">3 pacientes lo tienen habilitado. Un paciente con otra cantidad se cambia desde su ficha.</div>
      <div style="display: flex; gap: 8px; margin-top: 16px;">${btnPrimary('Guardar')}${btnOutline('Cancelar')}</div>
    </div>`),
    filaLibro({ nombre: 'Salbutral 100 mcg', presentacion: 'Aerosol', habia: 2, entro: 6, salio: 3, hay: 5, comprar: comprarN(7), ultimo: true }),
  ]),
))

// ═══════════════════════════ Casos · «No va a llegar» y anular (RD10: el motivo arranca vacío) ═══════════════════════════

const noVaALlegar = page(modal(
  'Pedido Nº 14',
  `<div style="display: flex; align-items: center; gap: 10px; margin: 0 0 14px;">${estadoPedido('enParte')}<span style="font-size: 12.5px; color: ${T.inkSoft};">Falta 1 envase</span></div>
  ${cabDet}
  ${filaDet({ nombre: 'Salbutral 100 mcg', presentacion: 'Aerosol', pedido: 7, recibido: 7, falta: 0 })}
  ${filaDet({
    nombre: 'Seretide 250/50', presentacion: 'Aerosol', pedido: 6, recibido: 5, falta: 1, ultimo: true,
    extra: `<div style="margin: 0 0 12px; padding: 14px; border-radius: 11px; background: ${T.surface}; border: 1px solid ${T.line};">
      <div style="font-size: 13px; color: ${T.ink}; margin-bottom: 10px;">El envase que falta deja de estar en camino y vuelve a la compra. Se puede reabrir si al final llega.</div>
      ${label('Por qué no va a llegar')}
      ${desplegable('Elegí un motivo', true, 300)}
      <div style="font-size: 12px; color: ${T.inkSoft}; margin-top: 8px;">Opciones: La farmacia no lo tiene · Lo discontinuaron · Ya no hace falta.</div>
      <div style="display: flex; gap: 8px; margin-top: 14px;">${btnPrimary('Cerrar lo que falta', PH, 38)}${btnOutline('Cancelar', 38)}</div>
    </div>`,
  })}`,
  580,
  subDetalle,
))

const anular = page(modal(
  'Anular el pedido Nº 16',
  `<div style="font-size: 13px; color: ${T.ink}; line-height: 1.5; margin: 0 0 14px;">Todavía no se recibió nada. Queda en la lista como anulado y deja de estar en camino.</div>
  ${label('Motivo')}${desplegable('Elegí un motivo', true, 380)}
  <div style="font-size: 12px; color: ${T.inkSoft}; margin-top: 8px;">Opciones: Se emitió por error · Se rehízo con otras cantidades.</div>
  <div style="display: flex; gap: 10px; margin-top: 18px;">${btnOutline('Cancelar')}<div style="flex: 1;"></div>${btnPrimary('Anular pedido', T.danger)}</div>`,
  428,
  '222714 · ENDURA · emitido el 28/09',
))

// ═══════════════════════════ Casos · ventana angosta (RD14) ═══════════════════════════

const filaAngosta = ({ nombre, presentacion, libro, comprar, avisos = 0, ultimo = false }) => `<div style="display: grid; grid-template-columns: minmax(0, 1fr) auto 36px; align-items: center; gap: 10px; padding: 11px 14px; ${ultimo ? '' : `border-bottom: 1px solid ${T.line};`}">
  <div style="min-width: 0;">
    <div style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: ${T.ink}; flex-wrap: wrap;"><span>${nombre}</span>${avisos ? `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 600; color: ${T.deepWarn};">${ic('alert', 13, T.deepWarn, 1.9)}1 aviso</span>` : ''}</div>
    <div style="font-size: 11.5px; color: ${T.inkSoft}; margin-top: 2px;">${presentacion}</div>
    <div class="mono" style="font-size: 12px; color: ${T.inkSoft}; margin-top: 4px;">${libro}</div>
  </div>
  <div style="display: flex; align-items: baseline; justify-content: flex-end;">${comprar}</div>
  <div style="display: grid; place-items: center;">${ic('chevronDown', 16, T.muted)}</div>
</div>`
const angosta = page(`<div style="width: 760px;">${cabecera({ migas: ['222714'] })}<div style="padding: 16px 20px 20px;">
  ${card(`<div style="display: flex; padding: 10px 14px 8px; border-bottom: 1px solid ${T.line2}; font-size: 11.5px; font-weight: 600; color: ${T.inkSoft};"><span style="flex: 1;">Este período · 29/08 al 28/09</span><span>Para el que viene</span></div>
    ${filaAngosta({ nombre: 'Montelukast 10 mg', presentacion: 'Comprimidos', libro: 'había 0 · entró 0 · salió 0 · hay 0', comprar: sinCargar })}
    ${filaAngosta({ nombre: 'Salbutral 100 mcg', presentacion: 'Aerosol', libro: 'había 2 · entró 6 · salió 3 · hay 5', comprar: comprarN(7) })}
    ${filaAngosta({ nombre: 'Seretide 250/50', presentacion: 'Aerosol', libro: 'había 5 · entró 15 · salió 12 · hay 8', comprar: comprarN(4), avisos: 1, ultimo: true })}`)}
  <div style="font-size: 12px; color: ${T.inkSoft}; margin-top: 10px;">Por debajo de 1024 px: el libro baja a un segundo renglón y la grilla de estudios pasa a 2 columnas.</div>
</div></div>`)

// ═══════════════════════════ Salida ═══════════════════════════

const archivos = {
  'Main.dc.html': main,
  'Menu.dc.html': menu,
  'Estudio.dc.html': estudio,
  'EstudioDespues.dc.html': estudioDespues,
  'ArmarPedido.dc.html': armarPedido,
  'HojaPedido.dc.html': hoja,
  'PedidoDetalle.dc.html': pedidoDetalle,
  'RecepcionCabecera.dc.html': recepcionCabecera,
  'RecibirPedido.dc.html': recibirPedido,
  'Asistente.dc.html': asistente,
  'ResumenRecepcion.dc.html': resumenRecepcion,
  'EstadosTarjeta.dc.html': estadosTarjeta,
  'Franjas.dc.html': franjas,
  'CargandoError.dc.html': cargandoError,
  'SinCorte.dc.html': sinCorte,
  'DiaDeCorte.dc.html': diaCorte,
  'PeriodoAnterior.dc.html': periodoAnterior,
  'SoloLectura.dc.html': soloLectura,
  'Boletas.dc.html': boletas,
  'CargarRenglon.dc.html': cargarRenglon,
  'NoVaALlegar.dc.html': noVaALlegar,
  'RenglonCerrado.dc.html': renglonCerrado,
  'PedidoLlego.dc.html': pedidoLlego,
  'Anular.dc.html': anular,
  'ErrorEmitir.dc.html': errorEmitir,
  'RecibirVacio.dc.html': recibirVacio,
  'Angosta.dc.html': angosta,
}
for (const [nombre, html] of Object.entries(archivos)) writeFileSync(join(OUT, nombre), html)
console.log(`${Object.keys(archivos).length} artboards en ${OUT}`)
