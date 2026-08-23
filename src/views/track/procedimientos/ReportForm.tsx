import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { AutocompleteInput } from '../../../components/AutocompleteInput'
import type { Suggestion } from '../../../components/AutocompleteInput'
import { fieldInput, fieldLabelStyle } from '../../../components/FormField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import {
  ETA_PRESETS, PLATFORM_ORDER, PLATFORMS, etaValida, isDefaultLink, linkOnPlatformChange, platformMeta,
} from './reportes'
import type { KnownReport } from './reportes'
import type { ReportInput } from '../../../data/protocolProcedures'

/**
 * Los controles de este modal usan el primitivo de formulario del repo (`fieldInput`, alto 44),
 * NO el alto 36 que dibuja el handoff.
 *
 * El motivo es concreto: la categoría se elige con `SearchableSelect`, cuyo disparador mide 44 y
 * no es parametrizable. Con los inputs en 36 al lado, el mismo modal tendría dos alturas de campo
 * — la clase de desprolijidad que se nota sin poder nombrarla. Entre desviarse del handoff en 8px
 * o desviarse del resto de la app, gana la app: el modal entra igual (el cuerpo scrollea solo).
 */
export const boxH = 44
export const boxInput: CSSProperties = fieldInput

/** Texto de ayuda gris debajo de un campo. */
export function Helper({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 11, color: 'var(--spira-muted)', lineHeight: 1.45 }}>{children}</span>
}

/**
 * Alta / edición de UN reporte de un procedimiento.
 *
 * Trabaja sobre un borrador en memoria: `onSave` devuelve el reporte al modal padre, que lo suma a
 * su lista de trabajo. NADA se escribe en la base desde acá — el guardado real pasa por el único
 * "Guardar cambios" del modal, con la RPC atómica. Es lo que hace que "Cancelar" cancele de verdad.
 *
 * El combobox del nombre es `AutocompleteInput` (el mismo de sponsor/médico/especialidad): completa
 * en línea mientras se tipea y despliega los reportes ya usados en OTROS procedimientos de este
 * protocolo. Elegir uno existente arrastra su plataforma y su plazo, que es el 90% de la carga.
 */
export function ReportForm({ inicial, known, accent, accentSolid, onCancel, onSave }: {
  /** Reporte a editar, o undefined para uno nuevo. */
  inicial?: ReportInput
  known: KnownReport[]
  accent: string
  accentSolid: string
  onCancel: () => void
  onSave: (r: ReportInput) => void
}) {
  const [name, setName] = useState(inicial?.name ?? '')
  const [platform, setPlatform] = useState(inicial?.platform ?? 'otro')
  const [link, setLink] = useState(inicial?.link ?? '')
  const [eta, setEta] = useState<number | null>(inicial?.eta_hours ?? null)
  const [notes, setNotes] = useState(inicial?.notes ?? '')

  /* Sugerencias del combobox. El `value` es el ÍNDICE y no el nombre: el mismo rótulo en dos
     portales son DOS opciones distintas (ver `knownReports`), y cualquier separador que los pegue
     en un solo string se rompe con el primer nombre que lo contenga — los de reporte llevan espacios
     ("Hematología completa") y a veces barras. El índice no tiene ese problema y se lee de una. */
  const suggestions: Suggestion[] = known.map((k, i) => ({
    value: String(i),
    label: k.name,
    hint: PLATFORMS[k.platform].label,
  }))

  const pick = (value: string) => {
    const k = known[Number(value)]
    if (!k) return
    setName(k.name)
    // Elegir un reporte ya usado arrastra su plataforma y su plazo: es la misma cosa en otro
    // procedimiento, y volver a cargarlos a mano es la vía más corta a que queden distintos.
    setLink(linkOnPlatformChange(platform, k.platform, link))
    setPlatform(k.platform)
    setEta(k.eta_hours)
  }

  const cambiarPlataforma = (next: string) => {
    setLink(linkOnPlatformChange(platform, next, link))
    setPlatform(next)
  }

  const meta = platformMeta(platform)
  const linkEditado = !isDefaultLink(platform, link) && (meta.url ?? '') !== ''
  const etaOk = etaValida(eta)
  const puedeGuardar = name.trim() !== '' && etaOk

  const guardar = () => {
    if (!puedeGuardar) return
    onSave({
      id: inicial?.id,
      name: name.trim(),
      platform,
      link: link.trim() || null,
      eta_hours: eta,
      notes: notes.trim() || null,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0 2px' }}>
      {/* Nombre — combobox con lo ya usado en el protocolo */}
      <label style={campo}>
        <span style={fieldLabelStyle}>Nombre del reporte</span>
        <AutocompleteInput
          value={name}
          onChange={setName}
          onPick={pick}
          suggestions={suggestions}
          placeholder="Ej. Hematología completa"
          compact
          autoFocus
        />
        {name.trim() !== '' && !known.some((k) => k.name.toLowerCase() === name.trim().toLowerCase()) && (
          <Helper>Se creará «{name.trim()}» como reporte nuevo de este estudio.</Helper>
        )}
      </label>

      {/* Plataforma */}
      <label style={campo}>
        <span style={fieldLabelStyle}>Plataforma</span>
        <select value={platform} onChange={(e) => cambiarPlataforma(e.target.value)} style={boxInput}>
          {PLATFORM_ORDER.map((p) => (
            <option key={p} value={p}>{PLATFORMS[p].label}</option>
          ))}
        </select>
      </label>

      {/* Link directo */}
      <label style={campo}>
        <span style={fieldLabelStyle}>Link directo a la plataforma</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            style={boxInput}
          />
          {/* El botón de restablecer solo existe si HAY un default al que volver. Con las URLs por
              defecto vacías (ver la nota de PLATFORMS en reportes.ts) nunca aparece, que es lo
              correcto: un botón que no puede hacer nada no se dibuja. */}
          {linkEditado && (
            <button
              type="button"
              onClick={() => setLink(meta.url ?? '')}
              title={`Volver al link por defecto de ${meta.label}`}
              aria-label={`Volver al link por defecto de ${meta.label}`}
              style={{
                width: boxH, height: boxH, flex: '0 0 auto', borderRadius: 8,
                borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
                background: 'var(--spira-white)', cursor: 'pointer', display: 'grid', placeItems: 'center',
              }}
            >
              <Icon name="rotateCcw" size={14} color="var(--spira-muted)" />
            </button>
          )}
        </span>
      </label>

      {/* Plazo — chips + valor libre */}
      <div style={campo}>
        <span style={fieldLabelStyle}>¿Cuánto tarda en estar listo?</span>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          {ETA_PRESETS.map((p) => {
            const on = eta === p.value
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setEta(on ? null : p.value)}
                aria-pressed={on}
                style={chip(on, accent)}
              >
                {p.label}
              </button>
            )
          })}
          <input
            type="number"
            min={1}
            max={8760}
            value={eta != null && !ETA_PRESETS.some((p) => p.value === eta) ? String(eta) : ''}
            onChange={(e) => {
              const v = e.target.value.trim()
              setEta(v === '' ? null : Number(v))
            }}
            placeholder="otra (h)"
            aria-label="Otro plazo, en horas"
            style={{ ...boxInput, width: 108, flex: '0 0 auto' }}
          />
        </div>
        {!etaOk ? (
          <span style={{ fontSize: 11, color: 'var(--spira-danger)' }}>
            El plazo tiene que ser un número entero de horas, entre 1 y 8760 (un año).
          </span>
        ) : (
          <Helper>
            Tiempo desde que se realiza el procedimiento hasta que el reporte aparece en la
            plataforma. Sin plazo, el reporte no vence.
          </Helper>
        )}
      </div>

      {/* Notas */}
      <label style={campo}>
        <span style={fieldLabelStyle}>
          Notas o instrucciones <span style={{ fontWeight: 400, color: 'var(--spira-faint)' }}>(opcional)</span>
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Ej. Tubo lila (EDTA). Subir la orden firmada junto con el tubo."
          style={{ ...boxInput, height: 'auto', minHeight: 58, padding: '9px 11px', resize: 'vertical', lineHeight: 1.45 }}
        />
      </label>

      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', paddingTop: 2 }}>
        <button type="button" style={{ ...btnOutline, height: 34, fontSize: 13 }} onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={!puedeGuardar}
          style={{
            ...btnPrimary(accentSolid), height: 34, fontSize: 13,
            opacity: puedeGuardar ? 1 : 0.5, cursor: puedeGuardar ? 'pointer' : 'default',
          }}
        >
          {inicial?.id ? 'Guardar reporte' : 'Agregar reporte'}
        </button>
      </div>
    </div>
  )
}

const campo: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 }

/** Chip de preset del plazo. Elegido = borde + fondo del acento (es SELECCIÓN, no hover). */
function chip(on: boolean, accent: string): CSSProperties {
  return {
    height: 30, padding: '0 12px', borderRadius: 'var(--spira-radius-pill)',
    borderWidth: 1, borderStyle: 'solid', borderColor: on ? accent : 'var(--spira-line-2)',
    background: on ? accent + '14' : 'var(--spira-white)',
    color: on ? accent : 'var(--spira-ink)',
    fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  }
}
