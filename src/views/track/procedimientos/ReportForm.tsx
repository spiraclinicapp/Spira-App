import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { AutocompleteInput } from '../../../components/AutocompleteInput'
import type { Suggestion } from '../../../components/AutocompleteInput'
import { fieldInput, fieldLabelStyle } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import {
  ETA_PRESETS, PLATFORM_ORDER, PLATFORMS, PLAZO_MAX, etaValida, horasDesde, isDefaultLink,
  linkOnPlatformChange, platformMeta, plazoLibreInicial,
} from './reportes'
import type { KnownReport, UnidadPlazo } from './reportes'
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

  /* El campo de plazo libre tiene su PROPIO texto y su PROPIA unidad, separados de `eta`.
     `eta` siempre son horas (es lo que guarda la base); el interruptor decide qué significa el
     número escrito. El mismo "12" son 12 horas o 12 días — al cambiar de unidad el número NO se
     convierte, cambia lo que quiere decir.
     El texto es estado propio por un bug: antes se derivaba de `eta` con una expresión que lo
     vaciaba apenas el número coincidía con un preset, así que al teclear el "1" de "12" el campo
     se limpiaba solo y encendía el chip de 1 hora. */
  const [plazo, setPlazo] = useState(() => plazoLibreInicial(inicial?.eta_hours ?? null))

  /** Un chip fija el plazo y limpia el campo libre: manda el chip, y dos fuentes a la vez confunden. */
  const clickChip = (v: number) => {
    setEta(eta === v ? null : v)
    setPlazo((p) => ({ ...p, texto: '' }))
  }

  /** Escribir en el campo libre manda sobre los chips (el chip que coincida queda encendido igual). */
  const cambiarTexto = (texto: string) => {
    setPlazo((p) => ({ ...p, texto }))
    setEta(horasDesde(texto, plazo.unidad))
  }

  /** Cambiar de unidad reinterpreta el número que ya está escrito, sin tocarlo. */
  const cambiarUnidad = (unidad: UnidadPlazo) => {
    setPlazo((p) => ({ ...p, unidad }))
    setEta(horasDesde(plazo.texto, unidad))
  }

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
          autoFocus
        />
        {name.trim() !== '' && !known.some((k) => k.name.toLowerCase() === name.trim().toLowerCase()) && (
          <Helper>Se creará «{name.trim()}» como reporte nuevo de este estudio.</Helper>
        )}
      </label>

      {/* Plataforma — el desplegable de la app, no el nativo del sistema. El punto de color es el
          MISMO que después lleva el badge del reporte y el puntito de la lista: se elige mirando
          el color que vas a ver de acá en adelante. */}
      <div style={campo}>
        <span style={fieldLabelStyle}>Plataforma</span>
        <SearchableSelect
          value={platform}
          onChange={cambiarPlataforma}
          options={PLATFORM_ORDER.map((p) => ({ value: p, label: PLATFORMS[p].label, dot: PLATFORMS[p].color }))}
          placeholder="Elegí la plataforma"
          searchable="never"
        />
      </div>

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
        {/* Los cinco chips y el campo libre van en UN renglón (pedido del Director). Medido a 620px
            de modal: 544px de contenido contra 529 disponibles, o sea que saltaba por 15px. Se
            recuperaron ~40 apretando la geometría —no los rótulos, que son de él— y quedan ~30 de
            aire. `wrap` se deja puesto igual: es la red para una pantalla angosta, donde preferimos
            que baje antes que desbordar. */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {ETA_PRESETS.map((p) => {
            const on = eta === p.value
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => clickChip(p.value)}
                aria-pressed={on}
                style={chip(on, accent)}
              >
                {p.label}
              </button>
            )
          })}
          {/* Campo libre con el interruptor de unidad ADENTRO de la misma caja: son una sola cosa
              ("cuánto") y separarlos en dos controles obligaría a leer dos veces para entender un
              solo dato. El borde vive en este contenedor y el input va desnudo, si no se verían
              dos cajas encajadas. */}
          <span style={cajaPlazo}>
            <input
              type="number"
              min={1}
              max={PLAZO_MAX[plazo.unidad]}
              value={plazo.texto}
              onChange={(e) => cambiarTexto(e.target.value)}
              placeholder="otra"
              aria-label={plazo.unidad === 'd' ? 'Otro plazo, en días' : 'Otro plazo, en horas'}
              className="spira-num-limpio"
              style={inputDesnudo}
            />
            {/* Separador: sin él, el número y el conmutador se leen como un solo bloque apretado. */}
            <span aria-hidden style={separador} />
            {/* Riel + perilla. Los dos segmentos miden lo MISMO aunque "hs" sea más corto que
                "días": un conmutador de anchos desparejos no se lee como conmutador, se lee como
                dos botones sueltos. El elegido se levanta (papel + sombra) en vez de teñirse, que
                es como esta app señala estado; el acento queda en el texto, que es donde lleva
                significado. */}
            <span role="radiogroup" aria-label="Unidad del plazo" style={riel}>
              {([['h', 'hs', 'horas'], ['d', 'días', 'días']] as const).map(([u, corto, largo]) => {
                const on = plazo.unidad === u
                return (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={largo}
                    title={`El número son ${largo}`}
                    onClick={() => cambiarUnidad(u)}
                    className="spira-no-press"
                    style={segmento(on, accent)}
                  >
                    {corto}
                  </button>
                )
              })}
            </span>
          </span>
        </div>
        {!etaOk ? (
          /* El mensaje habla en la unidad que la persona está usando: decirle "entre 1 y 8760"
             a alguien que escribió "400 días" no le dice nada sobre qué corregir. */
          <span style={{ fontSize: 11, color: 'var(--spira-danger)' }}>
            {plazo.unidad === 'd'
              ? `El plazo tiene que ser un número entero de días, entre 1 y ${PLAZO_MAX.d} (un año).`
              : `El plazo tiene que ser un número entero de horas, entre 1 y ${PLAZO_MAX.h} (un año).`}
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

      {/* "Descartar" y no "Cancelar": mientras este form está abierto, el footer del modal muestra
          SU propio "Cancelar" cuarenta píxeles más abajo, y dos botones con la misma palabra en la
          misma tarjeta hacen exactamente lo que parece — apretar el que no era. El de acá descarta
          este reporte; el de abajo descarta el modal entero. Se detectó verificando en el navegador
          (y el que verificaba se equivocó de botón, que es la prueba). */}
      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', paddingTop: 2 }}>
        <button type="button" style={{ ...btnOutline, height: 34, fontSize: 13 }} onClick={onCancel}>
          Descartar
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

/** La caja del plazo libre: hereda el borde del input y adentro conviven el número y la unidad. */
/**
 * La caja del plazo libre: número + conmutador de unidad, en un solo marco.
 *
 * Alto 38 y no 44 a propósito. Sus vecinos en el renglón son los chips de preset (30), no los
 * campos del formulario: con 44 la caja les sacaba una cabeza y el renglón se veía desparejo.
 * 38 la deja leerse como un campo (más alta que un chip) sin dominar la fila.
 */
const cajaPlazo: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', flex: '0 0 auto',
  height: 38, padding: '0 4px', borderRadius: 10,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)',
}
/** El input va sin borde ni fondo (el marco lo pone la caja) y CENTRADO: pegado a la derecha
 *  quedaba encimado al conmutador y con un hueco muerto a la izquierda. 56px entran los cuatro
 *  dígitos del máximo (8760). */
const inputDesnudo: CSSProperties = {
  width: 56, height: 32, padding: '0 4px', border: 'none', outline: 'none', background: 'transparent',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14, textAlign: 'center',
}
/** Raya fina entre el número y el conmutador: son dos zonas de un mismo control, no una sola. */
const separador: CSSProperties = {
  width: 1, height: 20, flex: '0 0 auto', background: 'var(--spira-line)', margin: '0 5px 0 3px',
}
/** El riel del conmutador: fondo hundido sobre el que se apoya la perilla. */
const riel: CSSProperties = {
  display: 'flex', gap: 0, flex: '0 0 auto', padding: 2, borderRadius: 8,
  background: 'var(--spira-surface)',
}
/**
 * Segmento del conmutador. Los dos miden lo mismo (`minWidth`) para que se lea como conmutador y
 * no como dos botones sueltos, y el elegido se ELEVA —papel + sombra— en vez de teñirse: es como
 * esta app señala estado. El acento queda en el texto, que es donde lleva significado.
 *
 * 26px de alto: por debajo de 24 el objetivo táctil incumpliría el 2.5.8 de WCAG 2.2.
 *
 * Lleva `.spira-no-press` porque es un conmutador dentro de un campo: si se hunde 1px al pulsarlo,
 * arrastra visualmente a la caja que lo contiene y parece que se movió el input entero.
 */
function segmento(on: boolean, accent: string): CSSProperties {
  return {
    height: 26, minWidth: 34, padding: '0 5px', borderRadius: 6, border: 'none',
    background: on ? 'var(--spira-white)' : 'transparent',
    boxShadow: on ? 'var(--spira-shadow-sm)' : 'none',
    color: on ? accent : 'var(--spira-muted)',
    fontFamily: 'var(--spira-font-text)', fontSize: 12, fontWeight: on ? 700 : 600, cursor: 'pointer',
    transition: 'background-color .14s var(--spira-ease-out), box-shadow .14s var(--spira-ease-out)',
  }
}

/** Chip de preset del plazo. Elegido = borde + fondo del acento (es SELECCIÓN, no hover). */
function chip(on: boolean, accent: string): CSSProperties {
  return {
    height: 30, padding: '0 10px', borderRadius: 'var(--spira-radius-pill)',
    borderWidth: 1, borderStyle: 'solid', borderColor: on ? accent : 'var(--spira-line-2)',
    background: on ? accent + '14' : 'var(--spira-white)',
    color: on ? accent : 'var(--spira-ink)',
    fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap', flex: '0 0 auto',
  }
}
