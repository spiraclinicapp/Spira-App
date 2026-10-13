import { useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { btnOutline } from '../components/buttons'
import { Drawer } from '../components/Drawer'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { MODULES } from '../modules/registry'
import { PREGUNTAS } from './preguntas'
import { buscarPreguntas, moduloDeAyuda, preguntasDelAlcance, preguntasVisibles } from './reglas'
import type { ModuloAyuda, Pregunta } from './reglas'

/* ============================================================================
   AyudaDrawer — el panel «Ayuda», con las Preguntas frecuentes. Plan: docs/plan-tutoriales.md, «Diseño»;
   mock: docs/mock-tutoriales.html, recuadro 4.

   Se abre desde el menú de la cuenta y desde el buscador global (chip «Ayuda»), encima de lo que estás
   haciendo: es un panel y no un módulo del registry porque la duda aparece en medio de una tarea.

   ── LA PESTAÑA «TUTORIALES» TODAVÍA NO ESTÁ, A PROPÓSITO ──
   El diseño la dibuja al lado de Preguntas, pero no hay videos hasta la tarea T5. Una pestaña que lleva a
   una lista vacía es un control que promete algo que no hay, y esta app no los tiene (honestidad de datos).
   Entra con el primer video.

   ── EL ALCANCE ──
   Arranca en el módulo donde estás parado (sus preguntas y después las generales), con «Ver todos los
   módulos» para salir de ahí. Desde Inicio, o si sólo tenés un módulo, arranca en todo y el enlace no
   aparece: no tendría a dónde llevar. CON TEXTO EN EL BUSCADOR, el alcance no se aplica: se busca en todo
   lo que podés ver (ver `reglas.ts`, el vacío falso que se pescó en la revisión de diseño).

   Capas: se monta como HERMANO del Feedback en `AppShell`, nunca adentro. El fondo del `Drawer` lleva
   `backdropFilter`, que encierra a cualquier hijo `position: fixed` en los 440px del panel.
   ============================================================================ */

const NOMBRE: Record<ModuloAyuda, string> = {
  track: MODULES.find((m) => m.key === 'track')?.name ?? 'Coordinación',
  pharma: MODULES.find((m) => m.key === 'pharma')?.name ?? 'Farmacia',
  general: 'Generales',
}

interface Props {
  moduleKey: string
  isAllowed: (moduleKey: string) => boolean
  /** Acento del módulo activo: tiñe el ícono del estado vacío, como en el resto de la app. */
  accent: string
  /** Abrir con esta respuesta desplegada y a la vista (viene del buscador global). */
  preguntaInicial?: string | null
  /** «Contanos»: abre el Feedback. Recibe lo que estaba en el buscador, para precargar «Buscaba: …». */
  onContanos: (buscaba: string) => void
  onClose: () => void
}

export function AyudaDrawer({ moduleKey, isAllowed, accent, preguntaInicial = null, onContanos, onClose }: Props) {
  const visibles = useMemo(() => preguntasVisibles(PREGUNTAS, isAllowed), [isAllowed])
  const inicial = preguntaInicial && visibles.some((p) => p.id === preguntaInicial) ? preguntaInicial : null

  /* El módulo del shell sólo cuenta si tiene preguntas que este usuario ve; si no, se arranca en todo. */
  const modulo = moduloDeAyuda(moduleKey)
  const moduloActual = modulo && visibles.some((p) => p.modulo === modulo) ? modulo : null
  const hayOtrosModulos = visibles.some((p) => p.modulo !== 'general' && p.modulo !== moduloActual)

  const [termino, setTermino] = useState('')
  /* Desde el buscador global se abre en «todos»: la pregunta pedida puede ser de otro módulo. */
  const [todos, setTodos] = useState(inicial != null || moduloActual == null)
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(() => new Set(inicial ? [inicial] : []))

  const buscando = termino.trim() !== ''
  const lista = buscando
    ? buscarPreguntas(visibles, termino, moduloActual)
    : preguntasDelAlcance(visibles, todos ? null : moduloActual)

  const buscadorRef = useRef<HTMLInputElement>(null)
  const preguntaInicialRef = useRef<HTMLButtonElement>(null)

  const alternar = (id: string) =>
    setAbiertas((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })

  const cabecera = (
    <div style={{ display: 'grid', gap: 10 }}>
      <label className="spira-field-group" style={campo}>
        <Icon name="search" size={16} color="var(--spira-muted)" />
        <input
          ref={buscadorRef}
          className="spira-bare-input"
          value={termino}
          onChange={(e) => setTermino(e.target.value)}
          placeholder="Buscá una pregunta"
          aria-label="Buscar en la Ayuda"
          style={input}
        />
        {buscando && (
          <button type="button" onClick={() => { setTermino(''); buscadorRef.current?.focus() }} aria-label="Borrar la búsqueda" title="Borrar la búsqueda" style={borrar}>
            <Icon name="x" size={14} color="var(--spira-muted)" />
          </button>
        )}
      </label>
      <div style={alcance} aria-live="polite">
        {buscando ? (
          <span>{lista.length === 1 ? '1 pregunta' : `${lista.length} preguntas`} en todos los módulos</span>
        ) : todos || !moduloActual ? (
          <>
            <span>Todas las preguntas</span>
            {moduloActual && (
              <button type="button" onClick={() => setTodos(false)} style={enlace}>
                Sólo {NOMBRE[moduloActual]}
              </button>
            )}
          </>
        ) : (
          <>
            <span>Preguntas de <b style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>{NOMBRE[moduloActual]}</b> y generales</span>
            {hayOtrosModulos && (
              <button type="button" onClick={() => setTodos(true)} style={enlace}>Ver todos los módulos</button>
            )}
          </>
        )}
      </div>
    </div>
  )

  const pie = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-muted)' }}>
      <Icon name="message" size={15} color="var(--spira-muted)" />
      <span>¿No está tu duda?</span>
      <button type="button" onClick={() => onContanos(termino.trim())} style={enlace}>Contanos</button>
    </div>
  )

  return (
    <Drawer
      title="Ayuda"
      onClose={onClose}
      maxWidth={440}
      initialFocusRef={inicial ? preguntaInicialRef : buscadorRef}
      cabecera={cabecera}
      pie={pie}
    >
      {lista.length === 0 ? (
        <div style={{ paddingTop: 18 }}>
          <EmptyState
            icon="search"
            accent={accent}
            minHeight={220}
            title={`No encontramos nada con «${termino.trim()}»`}
            description="Probá con otra palabra, o contanos qué estabas buscando y lo sumamos."
          />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <button type="button" onClick={() => onContanos(termino.trim())} style={{ ...btnOutline, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="message" size={15} color="var(--spira-ink)" /> Contanos qué buscabas
            </button>
          </div>
        </div>
      ) : (
        <div style={{ paddingTop: 4 }}>
          {agrupar(lista).map(({ modulo, preguntas }) => (
            <section key={modulo} aria-label={NOMBRE[modulo]}>
              <h3 className="spira-eyebrow" style={rotulo}>{NOMBRE[modulo]}</h3>
              {preguntas.map((p) => (
                <FilaPregunta
                  key={p.id}
                  pregunta={p}
                  abierta={abiertas.has(p.id)}
                  onAlternar={() => alternar(p.id)}
                  botonRef={p.id === inicial ? preguntaInicialRef : undefined}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </Drawer>
  )
}

/** Corta la lista (ya ordenada) en tramos consecutivos del mismo módulo, para el rótulo de cada grupo. */
function agrupar(lista: Pregunta[]): { modulo: ModuloAyuda; preguntas: Pregunta[] }[] {
  const grupos: { modulo: ModuloAyuda; preguntas: Pregunta[] }[] = []
  for (const p of lista) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.modulo === p.modulo) ultimo.preguntas.push(p)
    else grupos.push({ modulo: p.modulo, preguntas: [p] })
  }
  return grupos
}

function FilaPregunta({ pregunta, abierta, onAlternar, botonRef }: {
  pregunta: Pregunta
  abierta: boolean
  onAlternar: () => void
  botonRef?: React.Ref<HTMLButtonElement>
}) {
  const idBoton = `ayuda-p-${pregunta.id}`
  const idRespuesta = `ayuda-r-${pregunta.id}`
  return (
    <div style={{ borderBottom: '1px solid var(--spira-line)' }}>
      <button
        ref={botonRef}
        id={idBoton}
        type="button"
        aria-expanded={abierta}
        aria-controls={idRespuesta}
        onClick={onAlternar}
        /* Sin el levante de 1px: es una fila de una lista, el realce es el fondo de `.spira-row-link`. */
        className="spira-row-link spira-no-press"
        style={filaBtn}
      >
        <span style={{ flex: 1 }}>{pregunta.pregunta}</span>
        <Icon name={abierta ? 'chevronUp' : 'chevronDown'} size={16} color="var(--spira-muted)" />
      </button>
      {abierta && (
        <div id={idRespuesta} role="region" aria-labelledby={idBoton} style={respuesta}>
          {pregunta.respuesta.split(/\n\s*\n/).map((parrafo, i) => <p key={i} style={{ margin: i ? '8px 0 0' : 0 }}>{parrafo}</p>)}
        </div>
      )}
    </div>
  )
}

/* —— estilos —— */
const campo: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 8px 0 12px',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)', borderRadius: 'var(--spira-radius-md)',
  background: 'var(--spira-white)', cursor: 'text',
}
const input: CSSProperties = {
  flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
  font: '400 14px var(--spira-font-text)', color: 'var(--spira-ink)',
}
const borrar: CSSProperties = {
  width: 26, height: 26, border: 'none', borderRadius: 7, background: 'transparent',
  display: 'grid', placeItems: 'center', cursor: 'pointer', flex: '0 0 auto',
}
const alcance: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  fontSize: 12.5, color: 'var(--spira-muted)', minHeight: 20,
}
const enlace: CSSProperties = {
  border: 'none', background: 'none', padding: 0, cursor: 'pointer',
  font: '600 12.5px var(--spira-font-text)',
  // acc-deep y no primary: el primario NO se aclara en oscuro y el enlace quedaba petróleo sobre casi negro.
  color: 'var(--spira-acc-deep-track)',
}
const rotulo: CSSProperties = { margin: '16px 0 4px' }
const filaBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, padding: '12px 6px',
  border: 'none', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
  font: '600 13.5px/1.35 var(--spira-font-text)', color: 'var(--spira-ink)',
}
const respuesta: CSSProperties = { padding: '0 6px 14px', fontSize: 13, lineHeight: 1.55, color: 'var(--spira-muted)' }
