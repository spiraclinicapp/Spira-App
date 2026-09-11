import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * Tarjeta de estadística chica (ícono en cuadro tintado + valor grande + label). Usada en tiras
 * de 3 (p. ej. "En la cola" / "Espera más larga" / "Atendidos hoy" de Para ver médico). El color
 * es del ESTADO que representa el número (no decorativo): acento del módulo, o good/warn/danger
 * si el valor mismo comunica un umbral (p. ej. la espera más larga).
 *
 * `color` debe ser un HEX LITERAL (ej. `'#2E7D74'`), NUNCA una referencia `var(--spira-x)`: el
 * cuadro del ícono le suma un sufijo de alfa (`color + '16'`), y eso solo es CSS válido sobre un
 * hex de verdad — `var(--spira-x)16` se descarta en silencio (ver TONE_HEX de WaitBadge.tsx para
 * el hex de good/warn/danger).
 *
 * ── EL HEX CRUDO ES PARA EL TINTE, NO PARA LA TINTA (2026-09-11) ──
 * Ese mismo hex se usaba también para el ÍCONO y para el VALOR, y ahí no sirve: un hex literal no
 * se aclara en tema oscuro, así que sobre la card casi negra el acento del módulo se apagaba. No
 * era un caso raro — fallaban las TRES tarjetas de "Para ver médico", medido con el umbral de
 * texto grande y gráficos (3:1; el valor va en 22px/800 y el ícono en 18px):
 *
 *                        ÍCONO sobre su tinte        VALOR sobre la card
 *     accent track       4,78 claro · 2,79 osc ❌     5,36 · 3,00 ✅
 *     accent pharma      6,57 claro · 2,05 osc ❌     7,51 · 2,14 ❌
 *     danger             5,13 claro · 2,61 osc ❌     5,81 · 2,77 ❌
 *     sin dato (gris)    2,09 claro ❌ · 6,20 osc     2,23 ❌ · 7,23
 *
 * El 2,09:1 se entiende solo: ahí el ícono es `#A6B0AC` sobre `#A6B0AC` al 8,6%.
 *
 * La corrección NO puede ser un token por color, porque el acento llega como HEX CRUDO desde el
 * registro de módulos (y desde `TONE_HEX`): tiene que ser una OPERACIÓN sobre lo que venga. Es
 * exactamente lo que ya resuelve `--spira-aclarado-acento` —0% en claro, 55% en oscuro— y lo que
 * `Chip.tsx` hace con la misma receta. En claro no cambia ni un pixel; en oscuro aclara.
 *
 * El TINTE del cuadrito se queda en el hex crudo a propósito: es decoración detrás del ícono, y
 * aclararlo lo convertiría en una mancha clara sobre la card oscura.
 *
 * ── Y CUANDO EL COLOR NO PUEDE SER TINTA: `tinta` ──
 * Aclarar arregla el tema oscuro, no el claro. Un color DEMASIADO CLARO sigue sin servir de tinta
 * sobre papel, y hay un caso real: el gris de "sin dato" (`FAINT_HEX`, #A6B0AC) daba 2,09:1 en el
 * ícono y 2,23:1 en el valor. No es un bug del color: un mismo valor no puede ser a la vez un tinte
 * sutil y una tinta legible, y para los acentos cromáticos funciona sólo porque son oscuros.
 *
 * Por eso `tinta` es opcional y se pasa SÓLO en ese caso. Quien la pasa manda un token que ya se
 * adapta al tema (`var(--spira-muted)`), así que no se le aplica el aclarado — ya lo trae. El tinte
 * sigue saliendo de `color`, que es lo que debe quedar claro y discreto.
 */
export function StatCard({ icon, value, label, color, tinta: tintaProp }: {
  icon: IconName
  value: string
  label: string
  /** HEX literal, no `var(--spira-x)` — ver nota arriba. Manda el TINTE del cuadrito. */
  color: string
  /** Tinta del ícono y del valor, cuando `color` es demasiado claro para leerse sobre papel.
   *  Mandá un token que se adapte al tema; no se le aplica ninguna corrección. */
  tinta?: string
}) {
  /** El acento llevado a tinta: idéntico en claro, aclarado en oscuro. */
  const tinta = tintaProp ?? `color-mix(in oklab, ${color}, white var(--spira-aclarado-acento))`
  return (
    <div style={card}>
      <span style={{ ...iconBox, background: color + '16' }}>
        <Icon name={icon} size={18} color={tinta} stroke={1.9} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...valueStyle, color: tinta }}>{value}</div>
        <div style={labelStyle}>{label}</div>
      </div>
    </div>
  )
}

const card: CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', gap: 12,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 14, padding: '13px 16px', minWidth: 0,
}
const iconBox: CSSProperties = {
  flex: '0 0 auto', width: 38, height: 38, borderRadius: 11,
  display: 'grid', placeItems: 'center',
}
const valueStyle: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 800, fontSize: 22,
  fontVariantNumeric: 'tabular-nums', lineHeight: 1.15, whiteSpace: 'nowrap',
}
const labelStyle: CSSProperties = {
  fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 1, whiteSpace: 'nowrap',
}
