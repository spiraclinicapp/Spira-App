// Arma los artboards del mock de la Tanda 3 (dispensación de base) con los valores literales del
// código de Spira (tokens.css, VisitDispensationPanel, Panel, ConstanciaIp, cajón de Farmacia).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2]
mkdirSync(OUT, { recursive: true })

const T = {
  ink: '#14302E', primary: '#0F5F57', paper: '#F4F1EA', surface: '#FBFAF6', white: '#FFFFFF',
  muted: '#61706C', faint: '#838C89', inkSoft: '#465A57', line: '#E4DECF', line2: '#D8CBB0',
  good: '#5C8A5A', warn: '#B0823F', danger: '#A6483B', onAccent: '#F4F1EA',
  deepWarn: '#6E5620', deepDanger: '#A6483B', deepGood: '#3D6B3B', deepTrack: '#0F5F57', deepTeal: '#21726A', deepBlue: '#3A6B8C',
  band: '#0F5F57', tint: 'rgba(46, 125, 116, 0.10)',
}
const ACC = '#2E7D74' // acento de Coordinación
const PH = T.primary // pharma-solid
const DISPLAY = "'Schibsted Grotesk', system-ui, sans-serif"

// —— Íconos Lucide (trazo 1.8, como Icon.tsx) ——
const I = {
  pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  alertCircle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  barcode: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10"/><path d="M12 7v10"/><path d="M17 7v10"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
}
const closeTags = (s) => s.replace(/<(\w+)([^>]*?)\/>/g, '<$1$2></$1>')
const ic = (n, s = 16, c = T.ink, w = 1.8, extra = '') =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" style="flex: 0 0 auto; display: block;${extra}">${closeTags(I[n])}</svg>`

const page = (inner, bg = T.white) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@500;600;700&amp;family=Inter:wght@400;500;600;700&amp;display=swap">
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

// —— Panel «Dispensación» de la visita (Panel.tsx con highlight) ——
// Sin overflow:hidden (la banda lleva su propio radio) para que un desplegable pueda asomar.
const frame = (inner) => `<div style="position: relative; width: 578px; padding: 24px;">
${inner}
</div>`
const panel = (body) => `<div style="border: 1px solid ${T.line}; border-radius: 14px; background: ${T.tint};">
  <div style="display: flex; align-items: center; gap: 9px; padding: 11px 14px; background: ${T.band}; border-radius: 13px 13px 0 0;">
    <span style="flex: 0 0 auto; width: 26px; height: 26px; border-radius: 8px; background: rgba(255, 255, 255, 0.18); display: grid; place-items: center;">${ic('pill', 15, T.onAccent)}</span>
    <span style="font-family: ${DISPLAY}; font-weight: 700; font-size: 14px; color: ${T.onAccent};">Dispensación</span>
  </div>
  <div style="padding: 14px 16px;">
${body}
  </div>
</div>`

const sub = (label, inner, first = false) => `<div style="${first ? 'padding: 0;' : `margin-top: 14px; padding-top: 14px; border-top: 1px solid ${T.line};`}">
  <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase; color: ${T.inkSoft}; margin-bottom: 9px;">${label}</div>
${inner}
</div>`

const rows = (...rs) => `<div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 9px;">${rs.join('')}</div>`
const row = (inner) => `<div style="display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 8px 12px; border: 1px solid ${T.line}; border-radius: 11px; background: ${T.white};">${inner}</div>`
const nm = (t) => `<span style="flex: 1; min-width: 0; color: ${T.ink}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t}</span>`
const q = (t, extra = '') => `<span class="mono" style="color: ${T.inkSoft}; flex: 0 0 auto;">${t}${extra ? `<span style="color: ${T.muted};"> ${extra}</span>` : ''}</span>`
const pill = (t, color, bg) => `<span style="flex: 0 0 auto; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; color: ${color}; background: ${bg};">${t}</span>`
const sinSolicitar = pill('Sin solicitar', T.deepWarn, 'rgba(176, 130, 63, 0.20)')
const xBtn = `<span style="flex: 0 0 auto; display: grid; place-items: center; padding: 2px;">${ic('x', 15, T.muted)}</span>`
const penBtn = `<span style="flex: 0 0 auto; display: grid; place-items: center; padding: 2px;">${ic('pencil', 14, T.muted)}</span>`

const elegirBtn = `<div style="display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%; height: 44px; border-radius: 12px; border: 1px solid ${T.line}; background: ${T.white}; font-weight: 600; font-size: 13.5px; color: ${T.ink};">${ic('plus', 16, ACC)}Elegir medicación</div>`
const box = (inner) => `<div style="position: relative; border: 1px solid ${T.line2}; border-radius: 12px; background: ${T.white}; padding: 13px;">${inner}</div>`
const trigger = (text, { ph = false, focus = false } = {}) => `<div style="flex: 1; min-width: 0; height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 12px 0 14px; border: 1px solid ${T.line2}; border-radius: 10px; background: ${T.white};${focus ? ' box-shadow: 0 5px 14px rgba(20, 48, 46, 0.10); transform: translateY(-1px);' : ''}">
  <span style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; color: ${ph ? T.muted : T.ink};">${text}</span>
  ${ic('chevronDown', 16, T.muted)}
</div>`
const qtyIn = (v, w = 74, h = 44) => `<div class="mono" style="flex: 0 0 auto; width: ${w}px; height: ${h}px; display: flex; align-items: center; padding: 0 12px; border: 1px solid ${T.line2}; border-radius: 10px; background: ${T.white}; font-size: 14px; color: ${v ? T.ink : T.muted};">${v || 'Cant.'}</div>`
const agregar = (on = true) => `<div style="flex: 0 0 auto; height: 44px; display: flex; align-items: center; padding: 0 14px; border: 1px solid ${T.line2}; border-radius: 10px; background: ${T.surface}; color: ${T.ink}; font-weight: 600; font-size: 13px;${on ? '' : ' opacity: 0.6;'}">Agregar</div>`
const quietBtn = (t, extra = '') => `<div style="display: inline-flex; align-items: center; height: 36px; padding: 0 14px; border: 1px solid ${T.line2}; border-radius: 10px; background: ${T.white}; color: ${T.ink}; font-weight: 600; font-size: 13px;${extra}">${t}</div>`
const pickRow = (inner) => `<div style="display: flex; gap: 8px; align-items: center;">${inner}</div>`

const enviar = (resumen) => `<div style="margin-top: 14px; padding-top: 13px; border-top: 1px solid ${T.line}; display: flex; flex-direction: column; gap: 9px;">
  <div style="width: 100%; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: ${ACC}; color: ${T.onAccent}; font-weight: 700; font-size: 14px;">Solicitar dispensación</div>
  <div style="font-size: 11.5px; color: ${T.inkSoft}; text-align: center; line-height: 1.45;">${resumen} · Farmacia lo ve recién al solicitar.</div>
</div>`
const pie = (texto, pillHtml, cancelar = true) => `<div style="margin-top: 14px; padding-top: 11px; border-top: 1px solid ${T.line}; display: flex; align-items: center; gap: 9px; flex-wrap: wrap;">
  <span style="font-size: 12.5px; color: ${T.inkSoft};">${texto}</span>
  ${pillHtml}
  ${cancelar ? `<span style="margin-left: auto; font-weight: 600; font-size: 12.5px; color: ${T.muted};">Cancelar solicitud</span>` : ''}
</div>`

// —— Avisos de arriba de la tarjeta ——
const avisoRojo = (titulo, detalle) => `<div style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 11px; font-size: 12.5px; background: rgba(166, 72, 59, 0.10); border: 1px solid transparent; margin-bottom: 12px;">
  ${ic('alert', 15, T.danger, 2, ' margin-top: 1px;')}
  <div style="flex: 1; min-width: 0;">
    <div style="font-weight: 600; color: ${T.deepDanger};">${titulo}</div>
    <div style="color: ${T.inkSoft}; margin-top: 2px; line-height: 1.4;">${detalle}</div>
  </div>
</div>`
const avisoInfo = (titulo, detalle, accion = '') => `<div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 11px; font-size: 12.5px; background: ${T.white}; border: 1px solid ${T.line}; margin-bottom: 12px;">
  ${ic('info', 15, ACC, 1.8, ' align-self: flex-start; margin-top: 1px;')}
  <div style="flex: 1; min-width: 0;">
    <div style="font-weight: 600; color: ${T.ink};">${titulo}</div>
    <div style="color: ${T.inkSoft}; margin-top: 2px; line-height: 1.4;">${detalle}</div>
  </div>
  ${accion}
</div>`
const miniBtn = (t, icono = '') => `<div style="flex: 0 0 auto; display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid ${T.line2}; background: ${T.white}; color: ${T.ink}; font-weight: 600; font-size: 12.5px;">${icono}${t}</div>`

const IP_VACIO = sub('Producto en investigación', `<div style="display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: ${T.inkSoft};">
  <span style="flex: 1; min-width: 0;">El cronograma no lo prevé en esta visita.</span>
  ${miniBtn('Pedir fuera de cronograma', ic('plus', 14, ACC))}
</div>`)
const ROJO_OMEPRAZOL = avisoRojo(
  'Este paciente recibió omeprazol en los últimos 30 días',
  'Omeprazol 20 mg · 05/09/2026 · PROT-B',
)
const PARACETAMOL_PEND = row(nm('Paracetamol 500 mg') + q('x2') + sinSolicitar + xBtn)

// —— Una receta dibujada (placeholder: el mock no carga archivos) ——
const recetaDibujo = (w, h, pad) => {
  const l = (width, top, c = '#DCD6C8', hh = 3) => `<div style="position: absolute; left: ${pad}px; top: ${top}px; width: ${width}; height: ${hh}px; border-radius: 2px; background: ${c};"></div>`
  const s = h / 140
  return `<div style="position: relative; width: ${w}; height: ${h}px; background: ${T.white};">
    ${l('38%', 14 * s, '#B9B2A2', Math.max(2, 5 * s))}
    ${l('62%', 30 * s)}${l('48%', 40 * s)}
    ${l('70%', 60 * s)}${l('66%', 70 * s)}${l('40%', 80 * s)}
    <div style="position: absolute; right: ${pad}px; top: ${104 * s}px; width: 30%; height: ${Math.max(6, 16 * s)}px; border-bottom: 1.5px solid #9C9585; border-radius: 0 0 40% 20%;"></div>
  </div>`
}

// ═══════════════════════════ Coordinación ═══════════════════════════

// 1 · Aviso rojo al elegir
const main = page(frame(panel(
  ROJO_OMEPRAZOL
  + sub('Medicación concomitante',
    rows(PARACETAMOL_PEND)
    + box(
      pickRow(trigger('Omeprazol 40 mg') + qtyIn('1') + agregar())
      + quietBtn('Listo', ' margin-top: 12px;'),
    ), true)
  + IP_VACIO
  + enviar('1 medicamento'),
)))

// 2 · «Otro» en el desplegable
const opcion = (label, desc, { on = false, icono = '' } = {}) => `<div style="min-height: 36px; padding: 8px 10px; display: flex; align-items: center; gap: 8px; border-radius: 8px; font-size: 13.5px;${on ? ' background: rgba(46, 125, 116, 0.08);' : ''}">
  ${icono}
  <span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px;">
    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${T.ink};">${label}</span>
    <span style="font-size: 12px; line-height: 1.35; color: ${T.muted}; font-weight: 400;">${desc}</span>
  </span>
</div>`
const popover = `<div style="position: absolute; top: 52px; left: 0; width: 372px; z-index: 10; background: ${T.white}; border: 1px solid ${T.line2}; border-radius: 12px; box-shadow: 0 12px 30px rgba(20, 48, 46, 0.16); padding: 6px;">
  <div style="display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px; border: 1px solid ${T.line2}; border-radius: 8px; margin-bottom: 6px;">
    ${ic('search', 14, T.muted)}
    <span style="font-size: 13.5px; color: ${T.muted};">Buscar…</span>
  </div>
  <div style="display: flex; flex-direction: column; gap: 2px;">
    ${opcion('Paracetamol 500 mg', '24 en stock')}
    ${opcion('Omeprazol 40 mg', '12 en stock · 2 ya pedidas')}
    ${opcion('Fenisona 50 mg', '6 en stock')}
    ${opcion('Salbutamol 100 mcg', '9 en stock')}
    ${opcion('Loratadina 10 mg', 'Sin stock')}
    <div style="height: 1px; background: ${T.line}; margin: 4px 6px;"></div>
    ${opcion('Otro medicamento', 'No habilitado para este paciente. Lleva receta.', { on: true, icono: ic('plus', 15, ACC) })}
  </div>
</div>`
const otroDesplegable = page(frame(panel(
  sub('Medicación concomitante',
    box(
      `<div style="position: relative; display: flex; gap: 8px; align-items: center;">${trigger('Medicamento…', { ph: true, focus: true })}${qtyIn('')}${agregar(false)}${popover}</div>`
      + quietBtn('Listo', ' margin-top: 12px;'),
    ), true)
  + IP_VACIO,
)))

// 3 · «Otro» con la receta
const fieldLabel = (t, extra = '') => `<div style="font-size: 12.5px; font-weight: 600; color: ${T.muted};${extra}">${t}</div>`
const recetaPendiente = `<div>
  <div style="position: relative; height: 140px; border-radius: 12px; overflow: hidden; border: 1px solid ${T.line}; background: ${T.white};">
    ${recetaDibujo('100%', 140, 28)}
    <div style="position: absolute; left: 0; right: 0; bottom: 0; height: 46px; background: linear-gradient(to bottom, rgba(255, 255, 255, 0), ${T.white});"></div>
  </div>
  <div style="display: flex; align-items: center; gap: 11px; margin-top: 9px; padding: 10px 12px; border: 1px solid ${T.line}; border-radius: 12px; background: ${T.white};">
    <span style="flex: 0 0 auto; width: 32px; height: 32px; border-radius: 9px; background: rgba(46, 125, 116, 0.12); display: grid; place-items: center;">${ic('fileText', 16, ACC)}</span>
    <span style="flex: 1; min-width: 0;">
      <span style="display: block; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">receta-budesonida.jpg</span>
      <span style="display: block; font-size: 11.5px; color: ${T.inkSoft}; margin-top: 1px;">1,4 MB · se envía al solicitar</span>
    </span>
    <span style="flex: 0 0 auto; height: 30px; display: inline-flex; align-items: center; padding: 0 10px; border-radius: 8px; border: 1px solid ${T.line2}; background: ${T.white}; font-weight: 600; font-size: 12px; color: ${T.ink};">Quitar</span>
  </div>
</div>`
const otroReceta = page(frame(panel(
  sub('Medicación concomitante',
    rows(PARACETAMOL_PEND)
    + box(
      `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
        <span style="font-size: 13px; font-weight: 600; color: ${T.ink};">Otro medicamento</span>
        <span style="margin-left: auto; font-weight: 600; font-size: 12.5px; color: ${T.muted};">Volver a la lista</span>
      </div>`
      + pickRow(trigger('Budesonida 200 mcg') + qtyIn('1'))
      + `<div style="font-size: 12px; color: ${T.muted}; margin-top: 7px; line-height: 1.4;">Del stock de PROT-A · 8 en stock. Farmacia lo habilita sólo para esta entrega, cuando toma el pedido.</div>`
      + fieldLabel('Receta o indicación', ' margin: 13px 0 6px;')
      + recetaPendiente
      + `<div style="display: flex; align-items: center; gap: 8px; margin-top: 12px;">${quietBtn('Cancelar')}<div style="flex: 1;"></div>${agregar().replace('height: 44px', 'height: 36px')}</div>`,
    ), true)
  + IP_VACIO
  + enviar('1 medicamento'),
)))

// 4 · Pedido enviado: por habilitar
const lineaBajoRenglon = (inner) => `<div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${T.inkSoft}; padding: 5px 12px 0; line-height: 1.4;">${inner}</div>`
const otroPedido = page(frame(panel(
  sub('Medicación concomitante',
    rows(
      row(nm('Paracetamol 500 mg') + q('x2') + penBtn + xBtn),
      row(nm('Fenisona 50 mg') + q('x1', 'de 2') + penBtn + xBtn),
      `<div>${row(nm('Budesonida 200 mcg') + q('x1') + pill('Por habilitar', T.deepWarn, 'rgba(176, 130, 63, 0.20)') + xBtn)}${lineaBajoRenglon(`${ic('fileText', 13, T.muted)}<span>Con receta · Farmacia lo habilita al tomar el pedido ·</span><span style="color: ${ACC}; font-weight: 600; text-decoration: underline; text-underline-offset: 2px;">Ver la receta</span>`)}</div>`,
    )
    + elegirBtn, true)
  + IP_VACIO
  + pie('Pedido del 13/09/2026', pill('Solicitada', T.deepWarn, 'rgba(176, 130, 63, 0.15)')),
)))

// 4b · No habilitado
const otroRechazado = page(frame(panel(
  sub('Medicación concomitante',
    rows(
      row(nm('Paracetamol 500 mg') + q('x2')),
      row(nm('Fenisona 50 mg') + q('x1', 'de 2')),
      `<div>${row(nm('Budesonida 200 mcg') + q('x1') + pill('No habilitado', T.deepDanger, 'rgba(166, 72, 59, 0.10)'))}${lineaBajoRenglon(`<span style="flex: 1; min-width: 0;">Receta sin firma del médico · Laura Pérez, 13/09 11:40</span>${miniBtn('Pedir de nuevo')}`)}</div>`,
    )
    + elegirBtn, true)
  + IP_VACIO
  + pie('Pedido del 13/09/2026 · Lo está preparando Laura Pérez', pill('Preparando', T.deepBlue, 'rgba(58, 107, 140, 0.14)'), false),
)))

// 5 · Entrega en partes
const check = `<span style="flex: 0 0 auto; width: 16px; height: 16px; border-radius: 4px; background: ${ACC}; display: grid; place-items: center;">${ic('check', 12, T.white, 2.6)}</span>`
const enPartes = page(frame(panel(
  sub('Medicación concomitante',
    rows(PARACETAMOL_PEND)
    + box(
      pickRow(trigger('Fenisona 50 mg') + qtyIn('1') + agregar())
      + `<div style="display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: ${T.ink};">
          ${check}
          <span style="font-weight: 600;">En partes</span>
          <span style="color: ${T.muted};">· entregar 1 de</span>
          ${qtyIn('2', 60, 36)}
          <span style="color: ${T.muted};">envases</span>
        </div>`
      + `<div style="font-size: 12px; color: ${T.muted}; margin-top: 7px; padding-left: 24px;">Queda 1 envase de saldo para la visita siguiente.</div>`
      + quietBtn('Listo', ' margin-top: 12px;'),
    ), true)
  + IP_VACIO
  + enviar('1 medicamento'),
)))

// 6 · Visita siguiente: el saldo
const saldoOfrecido = page(frame(panel(
  avisoInfo('Saldo de Fenisona: 1 envase', 'Se entregó 1 de 2 el 13/09/2026.', miniBtn('Pedir el saldo'))
  + sub('Medicación concomitante', elegirBtn, true)
  + IP_VACIO,
)))

// 7 · Saldo pedido + rojo por otra droga
const saldoPedido = page(frame(panel(
  ROJO_OMEPRAZOL
  + avisoInfo('Es el saldo de Fenisona', 'Se entregó 1 el 13/09/2026. Con este se completan los 2 indicados.')
  + sub('Medicación concomitante',
    rows(
      row(nm('Fenisona 50 mg') + q('x1', 'saldo') + sinSolicitar + xBtn),
      row(nm('Omeprazol 40 mg') + q('x1') + sinSolicitar + xBtn),
    )
    + elegirBtn, true)
  + IP_VACIO
  + enviar('2 medicamentos'),
)))

// ═══════════════════════════ Farmacia ═══════════════════════════

const dot3 = `<span style="flex: 0 0 auto; width: 3px; height: 3px; border-radius: 50%; background: ${T.line2};"></span>`
const protoChip = `<span class="mono" style="font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; flex: 0 0 auto; background: rgba(15, 95, 87, 0.14); color: ${T.deepTrack};">PROT-A</span>`

// 8 · Tablero
const kCard = ({ nombre, ivrs, meds, meta, signal = '' }) => `<div style="background: ${T.white}; border: 1px solid ${T.line}; border-radius: 12px; padding: 12px 13px; box-shadow: 0 1px 2px rgba(20, 48, 46, 0.06);">
  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 7px; min-width: 0;">
    <span style="font-size: 13.5px; font-weight: 700; color: ${T.ink}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;">${nombre}</span>
    <span class="mono" style="font-size: 12.5px; color: ${T.muted}; flex: 0 0 auto;">${ivrs}</span>
  </div>
  <div style="font-size: 12.5px; color: ${T.ink}; line-height: 1.4; margin-bottom: 5px;">${meds}</div>
  <div style="display: flex; align-items: center; gap: 5px; font-size: 11px; color: ${T.muted}; flex-wrap: wrap;">${protoChip}${meta}</div>
  ${signal}
  <div style="width: 100%; height: 40px; margin-top: 10px; border-radius: 10px; background: ${PH}; color: ${T.onAccent}; font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: center;">Preparar</div>
</div>`
const signal = (icono, color, label) => `<div style="display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11.5px; color: ${color}; font-weight: 600;">${ic(icono, 13, color)}${label}</div>`
const tablero = page(`<div style="width: 339px; padding: 24px;">
  <div style="display: flex; flex-direction: column; background: ${T.white}; border: 1px solid ${T.line}; border-radius: 14px;">
    <div style="display: flex; align-items: center; gap: 8px; padding: 13px 14px 11px;">
      <span style="width: 8px; height: 8px; border-radius: 50%; background: ${T.muted}; flex: 0 0 auto;"></span>
      <span style="font-family: ${DISPLAY}; font-size: 14px; font-weight: 700; color: ${T.ink};">Solicitadas</span>
      <span class="mono" style="margin-left: auto; font-size: 12px; font-weight: 700; color: ${T.muted}; background: ${T.surface}; border-radius: 999px; padding: 2px 9px; min-width: 24px; text-align: center;">2</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 9px; padding: 11px; background: ${T.surface}; border-radius: 0 0 13px 13px;">
      ${kCard({ nombre: 'Marta Giménez', ivrs: '1042-007', meds: 'Paracetamol 500 mg, Fenisona 50 mg', meta: '<span>3 u.</span><span>· hace 4 min</span>', signal: signal('fileText', T.deepWarn, 'Pide habilitar Budesonida 200 mcg') })}
      ${kCard({ nombre: 'Julio Ferreyra', ivrs: '1042-011', meds: 'Salbutamol 100 mcg', meta: '<span>1 u.</span><span>· hace 12 min</span>' })}
    </div>
  </div>
</div>`, T.paper)

// 9 · Cajón: preparar con una habilitación pendiente
const eyebrow = (t, extra = '') => `<div style="font-weight: 700; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: ${T.muted};${extra}">${t}</div>`
const req = (texto, { on = false, conteo = '' } = {}) => `<div style="display: flex; align-items: center; gap: 8px; padding: 7px 9px; font-size: 11.5px; line-height: 1.25; color: ${on ? T.ink : T.muted};${on ? ' font-weight: 600; background: rgba(15, 95, 87, 0.08);' : ''}">
  <span style="width: 13px; height: 13px; flex: 0 0 auto; display: grid; place-items: center;"><span style="width: 9px; height: 9px; border-radius: 50%; border-style: solid; border-width: ${on ? 2.5 : 1.5}px; border-color: ${on ? T.primary : T.line2};"></span></span>
  <span style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${texto}</span>
  ${conteo ? `<span class="mono" style="font-size: 10.5px; flex: 0 0 auto; color: ${T.faint};">${conteo}</span>` : ''}
</div>`
const nodo = (n, texto, { cur = false, hijos = '' } = {}) => `<div style="display: flex; gap: 11px; padding-bottom: 16px; position: relative;">
  <span style="width: 24px; height: 24px; flex: 0 0 auto; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; line-height: 1; border: 1.5px solid ${cur ? T.primary : T.line2}; color: ${cur ? '#fff' : T.muted}; background: ${cur ? T.primary : T.surface}; position: relative; z-index: 1;${cur ? ' box-shadow: 0 0 0 3px rgba(15, 95, 87, 0.16);' : ''}">${n}</span>
  <div style="flex: 1; min-width: 0;">
    <div style="font-size: 13px; line-height: 1.3; padding-top: 3px; color: ${cur ? T.ink : T.muted};${cur ? ' font-weight: 700;' : ''}">${texto}</div>
    ${hijos}
  </div>
</div>`
const rail = `<div style="width: 240px; flex: 0 0 240px; background: ${T.surface}; border-right: 1px solid ${T.line}; padding: 18px 15px; display: flex; flex-direction: column;">
  ${eyebrow('Proceso', ' margin-bottom: 16px;')}
  <div style="position: relative;">
    <div style="position: absolute; left: 11.5px; top: 14px; bottom: 30px; width: 1.5px; background: ${T.line2};"></div>
    ${nodo(1, 'Preparar y escanear', { cur: true, hijos: `<div style="margin-top: 9px; background: ${T.white}; border: 1px solid ${T.line}; border-radius: 10px; overflow: hidden;">
      ${req('Habilitar Budesonida', { on: true })}
      <div style="border-top: 1px solid ${T.line};">${req('Paracetamol 500 mg', { conteo: '0/2' })}</div>
      <div style="border-top: 1px solid ${T.line};">${req('Fenisona 50 mg', { conteo: '0/1' })}</div>
    </div>` })}
    ${nodo(2, 'Lista para retirar')}
    ${nodo(3, 'Entregar')}
  </div>
  <div style="margin-top: auto; padding-top: 18px; display: flex; align-items: flex-start; gap: 8px; font-size: 11.5px; color: ${T.inkSoft}; line-height: 1.35;">
    <span style="width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: ${T.warn}; margin-top: 4px;"></span>
    <span>Falta resolver la habilitación de Budesonida</span>
  </div>
</div>`
const btnOutline = (t) => `<div style="display: inline-flex; align-items: center; justify-content: center; height: 40px; padding: 0 16px; border-radius: 10px; border: 1px solid ${T.line2}; background: ${T.white}; color: ${T.ink}; font-weight: 600; font-size: 14px; white-space: nowrap;">${t}</div>`
const btnPrimary = (t, bg, extra = '') => `<div style="display: inline-flex; align-items: center; justify-content: center; height: 40px; padding: 0 16px; border-radius: 10px; background: ${bg}; color: ${T.onAccent}; font-weight: 600; font-size: 14px; white-space: nowrap;${extra}">${t}</div>`
const itemRow = ({ name, meta, drug = '', pend, total }) => `<div style="position: relative; background: ${T.white}; border: 1px solid ${T.line}; border-radius: 12px; overflow: hidden;">
  <div style="position: relative; display: flex; align-items: center; gap: 12px; padding: 14px 15px;">
    <span style="width: 50px; height: 50px; flex: 0 0 auto; border-radius: 50%; display: grid; place-items: center; background: ${T.line};">
      <span style="width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: ${T.white};">
        <span style="font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; color: ${T.deepTrack};">${pend}/${total}</span>
      </span>
    </span>
    <div style="flex: 1 1 auto; min-width: 150px;">
      <div style="font-size: 14.5px; font-weight: 600; line-height: 1.25; color: ${T.ink}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
      <div style="font-size: 11.5px; color: ${T.muted}; margin-top: 3px;">${meta}</div>
    </div>
    ${drug ? `<div style="flex: 0 1 92px; min-width: 0; padding-left: 12px; border-left: 1px solid ${T.line};">
      <div style="font-weight: 700; font-size: 9.5px; letter-spacing: 0.11em; text-transform: uppercase; color: ${T.muted};">Fármaco</div>
      <div style="font-size: 12.5px; margin-top: 2px; line-height: 1.25;">${drug}</div>
    </div>` : ''}
    <div style="flex: 0 0 auto; padding: 6px 9px; border-radius: 8px; white-space: nowrap; border: 1px solid ${T.line2}; background: ${T.white}; color: ${T.ink}; font-weight: 600; font-size: 12px;">Sustituir</div>
  </div>
</div>`
const cajon = page(`<div style="width: 720px; height: 840px; display: flex; flex-direction: column; background: ${T.paper};">
  <div style="display: flex; align-items: flex-start; gap: 10px; padding: 16px 22px 15px; background: ${T.white}; border-bottom: 1px solid ${T.line}; flex: 0 0 auto;">
    <div style="min-width: 0; flex: 1;">
      <div style="font-family: ${DISPLAY}; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; color: ${T.ink};">Solicitud de dispensación · Preparando</div>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: ${T.muted}; margin-top: 5px; flex-wrap: wrap;">
        <span style="color: ${T.ink}; font-weight: 600;">Marta Giménez</span>${dot3}<span class="mono">1042-007</span>${dot3}<span class="mono">PROT-A</span>${dot3}<span>Coordinación</span>
      </div>
    </div>
    <span style="width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; flex: 0 0 auto;">${ic('more', 17, T.muted)}</span>
    <span style="width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; flex: 0 0 auto;">${ic('x', 17, T.muted)}</span>
  </div>
  <div style="display: flex; flex: 1; min-height: 0;">
    ${rail}
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0;">
      <div style="padding: 4px 22px 22px; flex: 1;">
        <div style="margin-top: 14px; margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid ${T.line};">
          <div style="display: flex; align-items: center; gap: 7px; margin-bottom: 11px; font-size: 13px; font-weight: 600; color: ${T.ink};">${ic('fileText', 15, PH)}Pide habilitar un medicamento</div>
          <div style="display: flex; gap: 13px; padding: 13px 14px; border-radius: 12px; align-items: center; border: 1px solid rgba(15, 95, 87, 0.30); background: rgba(15, 95, 87, 0.09);">
            <div style="position: relative; flex: 0 0 auto; width: 62px; height: 80px; border-radius: 5px; overflow: hidden; background: ${T.white}; border: 1px solid ${T.line2}; box-shadow: 0 2px 6px rgba(20, 48, 46, 0.10);">${recetaDibujo('100%', 80, 8)}</div>
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 600; color: ${T.ink};">Budesonida 200 mcg · 1 u.</div>
              <div style="font-size: 11.5px; color: ${T.muted}; margin-top: 2px;">Budesonida · 8 en stock de PROT-A · receta-budesonida.jpg</div>
              <div style="display: inline-flex; align-items: center; gap: 7px; margin-top: 9px; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid ${T.line2}; background: ${T.white}; color: ${T.ink}; font-weight: 600; font-size: 12.5px;">${ic('eye', 14, T.ink)}Ver la receta</div>
            </div>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 8px; margin-top: 11px; font-size: 11.5px; color: ${T.muted}; line-height: 1.4;">
            <span style="width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: ${T.warn}; margin-top: 4px;"></span>
            <span>Se habilita para Marta Giménez sólo para esta entrega y se suma a este pedido. Queda registrado en la trazabilidad.</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; margin-top: 12px;">
            ${btnOutline('No habilitar')}<div style="flex: 1;"></div>${btnPrimary('Habilitar y sumar al pedido', PH)}
          </div>
        </div>
        ${eyebrow('Código de barras', ' margin-bottom: 9px;')}
        <div style="display: flex; gap: 10px;">
          <div style="position: relative; flex: 1; display: flex; align-items: center; height: 50px; padding: 0 48px 0 16px; border-radius: 12px; background: ${T.white}; border: 1px solid ${T.line2}; font-size: 15px; color: ${T.muted};">
            Escaneá o tipeá el código…
            <span style="position: absolute; right: 15px; display: grid; place-items: center;">${ic('barcode', 22, PH, 1.7)}</span>
          </div>
          <div style="height: 50px; padding: 0 22px; border-radius: 12px; background: ${PH}; color: ${T.onAccent}; font-weight: 600; font-size: 14.5px; display: flex; align-items: center;">Buscar</div>
        </div>
        <div style="font-size: 12px; color: ${T.muted}; margin-top: 11px;">El lector escribe y confirma solo · una pasada por unidad</div>
        <div style="display: flex; align-items: baseline; gap: 10px; margin: 18px 0 12px;">
          <span style="font-size: 23px; font-weight: 700; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; color: ${T.ink};">0/3</span>
          <span style="font-size: 12.5px; color: ${T.muted};">unidades escaneadas</span>
          <span style="margin-left: auto; font-size: 12px; font-weight: 600; color: ${T.deepTrack};">Faltan 3</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${itemRow({ name: 'Paracetamol 500 mg', meta: '500 mg · faltan 2 u.', drug: 'Paracetamol', pend: 0, total: 2 })}
          ${itemRow({ name: 'Fenisona 50 mg', meta: '50 mg · 1 de 2 indicados · falta 1 u.', pend: 0, total: 1 })}
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 10px; padding: 14px 22px; border-top: 1px solid ${T.line}; background: ${T.white};">
        <div style="display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: ${T.muted};">${ic('fileText', 14, T.muted)}Falta resolver la habilitación de Budesonida</div>
        <div style="display: flex; align-items: center; gap: 10px;"><div style="flex: 1;"></div>${btnPrimary('Marcar lista para retirar', T.deepTeal, ' opacity: 0.6;')}</div>
      </div>
    </div>
  </div>
</div>`, T.paper)

// 10 · No habilitar
const noHabilitar = page(`<div style="width: 544px; padding: 32px;">
  <div style="background: ${T.white}; border: 1px solid ${T.line}; border-radius: 16px; box-shadow: 0 12px 32px rgba(20, 48, 46, 0.10);">
    <div style="display: flex; align-items: center; gap: 12px; padding: 22px 24px 14px;">
      <span style="width: 34px; height: 34px; flex: 0 0 auto; border-radius: 9px; background: rgba(166, 72, 59, 0.10); display: grid; place-items: center;">${ic('alertCircle', 18, T.danger)}</span>
      <div style="flex: 1; font-family: ${DISPLAY}; font-weight: 700; letter-spacing: -0.02em; font-size: 20px; color: ${T.danger};">No habilitar Budesonida</div>
      <span style="width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; flex: 0 0 auto;">${ic('x', 17, T.muted)}</span>
    </div>
    <div style="padding: 0 24px 22px;">
      <p style="font-size: 13px; color: ${T.muted}; line-height: 1.5; margin: 0 0 14px;">No se suma al pedido. Coordinación ve el motivo en la visita; el resto del pedido sigue igual.</p>
      ${fieldLabel('Motivo', ' margin-bottom: 6px;')}
      <div style="display: flex;">${trigger('Receta sin firma del médico')}</div>
      <div style="display: flex; gap: 10px; margin-top: 18px;">
        ${btnOutline('Volver')}<div style="flex: 1;"></div>${btnPrimary('No habilitar', T.danger)}
      </div>
    </div>
  </div>
</div>`, T.paper)

// ═══════════════════════════ Historial (pedido del Director) ═══════════════════════════

const entregada = pill('Entregada', T.deepGood, 'rgba(92, 138, 90, 0.14)')
const cancelada = pill('Cancelada', T.muted, T.surface)
const avisoUltima = `<div style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 11px; font-size: 12.5px; background: ${T.white}; border: 1px solid ${T.line}; margin-bottom: 12px;">
  ${ic('info', 15, ACC, 1.8, ' margin-top: 1px;')}
  <span><span style="display: block; font-weight: 600; color: ${T.ink};">Última dispensación hace 2 días</span><span style="display: block; color: ${T.inkSoft}; margin-top: 2px;">11/09/2026 · Paracetamol 500 mg y Fenisona 50 mg · en la visita V4.</span></span>
</div>`
const histCard = (fecha, pillHtml, items, extra = '') => `<div style="border: 1px solid ${T.line}; border-radius: 11px; background: ${T.white}; padding: 11px 13px;">
  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
    <span class="mono" style="font-size: 12px; color: ${T.muted};">${fecha}</span>
    <span style="margin-left: auto;">${pillHtml}</span>
  </div>
  ${items.map(([n, x]) => `<div style="display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 2px 0;"><span style="color: ${T.ink};">${n}</span><span class="mono" style="color: ${T.muted}; flex: 0 0 auto;">${x}</span></div>`).join('')}
  ${extra}
</div>`
const linkMudo = (t, extra = '') => `<span style="font-weight: 600; font-size: 12.5px; color: ${T.muted};${extra}">${t}</span>`
const ipBotonHoy = `<div style="display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%; height: 40px; margin-top: 4px; border-radius: 12px; border: 1px solid ${T.line}; background: ${T.white}; font-weight: 600; font-size: 13px; color: ${T.inkSoft};">${ic('plus', 15, T.muted)}Pedir producto en investigación fuera de cronograma</div>`

const historialHoy = page(frame(panel(
  avisoUltima
  + sub('Medicación concomitante', elegirBtn, true)
  + sub('Historial', `<div style="display: flex; flex-direction: column; gap: 10px;">
      ${histCard('13/09/2026', entregada, [['Paracetamol 500 mg', 'x2'], ['Fenisona 50 mg', 'x1']], `<div style="font-size: 12.5px; color: ${T.muted}; margin-top: 6px;">Comprobante N° <span class="mono">12</span></div>`)}
      ${linkMudo('Ver 1 más', ' align-self: flex-start; padding: 2px 0;')}
    </div>`)
  + ipBotonHoy,
)))

// El IP deja de ser un botón suelto al pie: la sección existe siempre y, cuando el cronograma no lo
// prevé, su estado vacío ofrece la excepción. Común a las dos opciones.
const ipVacio = IP_VACIO

const histRenglon = (fecha, texto, derecha, pillHtml, nota = '', primero = false) => `<div style="padding: 9px 12px;${primero ? '' : ` border-top: 1px solid ${T.line};`}">
  <div style="display: flex; align-items: center; gap: 10px; font-size: 13px;">
    <span class="mono" style="flex: 0 0 auto; width: 40px; font-size: 12px; color: ${T.muted};">${fecha}</span>
    <span style="flex: 1; min-width: 0; color: ${T.ink}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${texto}</span>
    ${derecha ? `<span class="mono" style="flex: 0 0 auto; font-size: 12px; color: ${T.muted};">${derecha}</span>` : ''}
    ${pillHtml}
  </div>
  ${nota ? `<div style="font-size: 12px; color: ${T.muted}; margin-top: 3px; padding-left: 50px;">${nota}</div>` : ''}
</div>`
const histLista = `<div style="border: 1px solid ${T.line}; border-radius: 11px; background: ${T.white}; overflow: hidden;">
  ${histRenglon('13/09', 'Paracetamol x2 · Fenisona x1 de 2', 'N° 12', entregada, '', true)}
  ${histRenglon('13/09', 'Omeprazol x1', '', cancelada)}
</div>`

const historialA = page(frame(panel(
  sub('Medicación concomitante', elegirBtn, true)
  + ipVacio
  + sub('Historial', histLista),
)))

const historialB = page(frame(panel(
  sub('Medicación concomitante', elegirBtn, true)
  + ipVacio
  + `<div style="margin-top: 14px; padding-top: 11px; border-top: 1px solid ${T.line}; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: ${T.inkSoft};">
      <span style="flex: 1; min-width: 0;">2 pedidos cerrados · el último, entregado el 13/09</span>
      ${linkMudo('Ver historial')}${ic('chevronDown', 14, T.muted)}
    </div>`,
)))

const rechazada = pill('Rechazada', T.deepDanger, 'rgba(166, 72, 59, 0.10)')
const historialBRechazo = page(frame(panel(
  sub('Medicación concomitante', elegirBtn, true)
  + ipVacio
  + `<div style="margin-top: 14px; padding-top: 11px; border-top: 1px solid ${T.line}; display: flex; flex-direction: column; gap: 9px;">
      <div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: ${T.inkSoft};">
        <span style="flex: 1; min-width: 0;">2 pedidos cerrados · uno rechazado</span>
        ${linkMudo('Ocultar')}${ic('chevronUp', 14, T.muted)}
      </div>
      <div style="border: 1px solid ${T.line}; border-radius: 11px; background: ${T.white}; overflow: hidden;">
        ${histRenglon('13/09', 'Omeprazol x1', '', rechazada, 'Sin stock del lote pedido', true)}
        ${histRenglon('11/09', 'Paracetamol x2 · Fenisona x1 de 2', 'N° 11', entregada)}
      </div>
    </div>`,
)))

const files = {
  'HistorialBRechazo.dc.html': historialBRechazo,
  'HistorialHoy.dc.html': historialHoy,
  'HistorialA.dc.html': historialA,
  'HistorialB.dc.html': historialB,
  'Main.dc.html': main,
  'OtroDesplegable.dc.html': otroDesplegable,
  'OtroReceta.dc.html': otroReceta,
  'OtroPedido.dc.html': otroPedido,
  'OtroRechazado.dc.html': otroRechazado,
  'EnPartes.dc.html': enPartes,
  'SaldoOfrecido.dc.html': saldoOfrecido,
  'SaldoPedido.dc.html': saldoPedido,
  'Tablero.dc.html': tablero,
  'CajonHabilitacion.dc.html': cajon,
  'NoHabilitar.dc.html': noHabilitar,
}
for (const [f, html] of Object.entries(files)) writeFileSync(join(OUT, f), html)
console.log('ok', Object.keys(files).length)
