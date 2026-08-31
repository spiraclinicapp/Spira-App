import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { formatAR, parseARInput } from '../../lib/dates'

/**
 * Campo de fecha del encabezado de la visita (handoff §6): 32px, cifras tabulares, ícono de agenda
 * a la derecha y, al enfocarlo, **confirmar y descartar** al costado. Enter guarda, Escape descarta.
 *
 * POR QUÉ NO ES EL `DateField` DEL REPO. Aquel guarda **al salir del campo** (`commitText` en su
 * `onBlur`) y no tiene confirmación explícita. Acá eso sería peligroso: estas dos fechas alimentan
 * el cálculo de desvío de protocolo y la ventana del cronograma, así que un clic distraído no puede
 * escribir una fecha nueva. Tampoco entra en 32px (es un control de formulario). Y meterle un modo
 * compacto por prop pondría en riesgo los nueve formularios donde ya vive, para servir a un solo
 * caso. Lo que SÍ se reusa es su lógica pura: `parseARInput` y `formatAR` de `lib/dates`, que son
 * las que saben leer "14/8/26" y escribir "14/08/2026" — DRY donde importa, no en la caja.
 *
 * Sin permiso de edición (`editable=false`) se dibuja el MISMO texto al MISMO tamaño, sin borde y
 * sin ícono: ningún salto de layout entre poder y no poder editar (checklist de QA del handoff).
 *
 * ```
 *   LECTURA ──click──▶ EDICIÓN ──Enter/✓──▶ GUARDANDO ──ok──▶ LECTURA
 *      ▲                  │                     │
 *      └──── Escape/✗ ────┘                     └── error ──▶ EDICIÓN (el valor vuelve al anterior)
 * ```
 */
export function VisitDateInline({
  label, value, editable, tone = 'strong', badge, suffix, placeholder = '—', title, onSave,
}: {
  label: string
  /** Fecha ISO ('YYYY-MM-DD') o null. */
  value: string | null
  editable: boolean
  /**
   * Adorno a la derecha del VALOR, sólo en lectura (la hora del sello de atención, 0102).
   *
   * Va como nodo aparte y NO concatenado al texto de la fecha, y no es cosmético: al entrar a
   * editar, este campo RELEE su propio valor con `parseARInput`, que sólo entiende una fecha. Un
   * "29/08/2026 16:31" adentro del valor volvería intipeable el campo — el mismo pozo que en la
   * v0.45.0 dejó al `DateField` sin poder tipearse con el formato `iso`.
   */
  suffix?: ReactNode
  /** `soft` = la estimada (tinta atenuada); `strong` = la real. */
  tone?: 'soft' | 'strong'
  /** Pastillas de la etiqueta (desvío, fuera de ventana). Van al lado del RÓTULO y no del valor,
   *  para no ensanchar el campo (handoff §6). */
  badge?: ReactNode
  placeholder?: string
  /** Explicación cuando no se puede editar (ej.: la fecha real todavía no existe). */
  title?: string
  /** Devuelve el mensaje de error, o null si guardó. Opcional: un campo que nunca es editable no
   *  tiene nada que guardar (la fecha "según protocolo" es una cuenta, no un dato). */
  onSave?: (iso: string) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Si el valor cambia desde afuera (navegar con ↑↓ a otra visita), se sale de edición: seguir
  // editando el texto de la visita anterior sobre la fila nueva es la peor de las confusiones.
  useEffect(() => { setEditing(false); setErr(null) }, [value])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const abrir = () => {
    if (!editable || busy) return
    setText(value ? formatAR(value) : '')
    setErr(null)
    setEditing(true)
  }
  const descartar = () => { setEditing(false); setErr(null) }
  const confirmar = async () => {
    const iso = parseARInput(text.trim())
    if (!iso) { setErr('Fecha inválida. Usá dd/mm/aaaa.'); return }
    if (iso === value) { setEditing(false); return }   // sin cambios: no molestamos a la base
    if (!onSave) { setEditing(false); return }         // campo de sólo lectura: nada que guardar
    setBusy(true)
    const e = await onSave(iso)
    setBusy(false)
    if (e) { setErr(e); return }
    setEditing(false)
  }

  return (
    <div>
      <div style={dlb}>
        {label}
        {badge}
      </div>

      {!editable ? (
        // Mismo texto, mismo tamaño, sin caja: el bloque conserva su alto (32px) para que alternar
        // entre editable y bloqueado no mueva el encabezado.
        <div style={{ ...bigBase, border: '1px solid transparent', background: 'transparent', cursor: 'default', ...(value ? toneStyle(tone) : phStyle) }} title={title}>
          {value ? formatAR(value) : placeholder}
          {value && suffix}
        </div>
      ) : editing ? (
        // Confirmar y descartar van DENTRO de la caja, en el lugar que ocupa el ícono de agenda
        // cuando no se edita. Al costado —como los dibuja el mock— el bloque de fechas crece y
        // empuja al resto del encabezado para el costado cada vez que se entra a editar; acá la
        // caja mide siempre lo mismo y no se mueve nada. De paso se leen como parte del campo y
        // no como dos cajitas sueltas.
        <div style={{ ...bigBase, ...toneStyle(tone), ...focusLift, padding: '0 4px 0 10px', gap: 4 }}>
          <input
            ref={inputRef}
            // `spira-bare-input`: el foco lo señala el RECUADRO (esta caja), no el input pelado de
            // adentro — si no, su sombra rectangular asoma por los bordes. Patrón del buscador del
            // SearchableSelect, ver tokens.css.
            className="spira-bare-input"
            value={text}
            onChange={(e) => { setText(e.target.value); setErr(null) }}
            onKeyDown={(e) => {
              // Escape NO puede llegar al listener de `document` de VisitDetail (ahí cierra el
              // modal entero). Se corta acá además del guard por target que tiene el modal.
              if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); descartar(); return }
              if (e.key === 'Enter') { e.preventDefault(); void confirmar() }
            }}
            placeholder="dd/mm/aaaa"
            inputMode="numeric"
            disabled={busy}
            aria-label={label}
            style={inputStyle}
          />
          <button type="button" onClick={() => void confirmar()} disabled={busy} title="Guardar (Enter)" aria-label="Guardar" style={okBtn(busy)}>
            <Icon name="check" size={14} color="var(--spira-on-accent)" stroke={2.4} />
          </button>
          <button type="button" onClick={descartar} disabled={busy} title="Descartar (Escape)" aria-label="Descartar" style={koBtn}>
            <Icon name="x" size={13} color="var(--spira-muted)" />
          </button>
        </div>
      ) : (
        <div
          role="button" tabIndex={0} onClick={abrir}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir() } }}
          title={`Editar ${label.toLowerCase()}`}
          style={{ ...bigBase, ...(value ? toneStyle(tone) : phStyle) }}
        >
          {value ? formatAR(value) : placeholder}
          {value && suffix}
          <Icon name="calendar" size={16} color="var(--spira-track)" style={{ marginLeft: 'auto', flex: '0 0 auto' }} />
        </div>
      )}

      {err && <div style={errStyle}>{err}</div>}
    </div>
  )
}

const dlb: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 700,
  letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--spira-muted)', marginBottom: 4,
}
const bigBase: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, height: 32, padding: '0 10px', borderRadius: 8,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '.01em',
  whiteSpace: 'nowrap', cursor: 'text',
}
/**
 * Foco = ELEVACIÓN, nunca un borde de color. El handoff §6 pide "borde --track + halo verde", pero
 * el estándar del proyecto manda lo contrario y gana el estándar: todo input/select/textarea del
 * repo marca el foco con una sombra tenue + un levante de 1px, sin outline ni recuadro verde
 * (tokens.css, "Foco de controles de formulario"). El color se reserva para SIGNIFICADO —estado
 * clínico, alerta, error—, no para decir "el cursor está acá".
 */
const focusLift: CSSProperties = {
  boxShadow: '0 5px 14px rgba(20, 48, 46, 0.1)', transform: 'translateY(-1px)',
}
const phStyle: CSSProperties = { color: 'var(--spira-muted)', fontWeight: 500 }
const toneStyle = (t: 'soft' | 'strong'): CSSProperties => ({
  color: t === 'soft' ? 'var(--spira-ink-soft)' : 'var(--spira-ink-2)',
})
const inputStyle: CSSProperties = {
  flex: 1, width: '100%', minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
  font: 'inherit', color: 'inherit', fontVariantNumeric: 'tabular-nums', padding: 0, height: '100%',
}
/* `padding:0` no es opcional en cajas fijas: el del navegador descentra el ícono (handoff §4).
   24px porque van DENTRO de la caja de 32: entran con aire y sin estirarla. */
const sqBtn: CSSProperties = {
  width: 24, height: 24, padding: 0, borderRadius: 6, display: 'grid', placeItems: 'center',
  cursor: 'pointer', flex: '0 0 auto', lineHeight: 0,
}
const okBtn = (busy: boolean): CSSProperties => ({
  ...sqBtn, border: 'none', background: 'var(--spira-track)', opacity: busy ? 0.6 : 1,
})
const koBtn: CSSProperties = {
  ...sqBtn, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)',
}
const errStyle: CSSProperties = { fontSize: 11.5, color: 'var(--spira-danger)', marginTop: 4, maxWidth: 200 }
