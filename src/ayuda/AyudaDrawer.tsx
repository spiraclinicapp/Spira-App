import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, MutableRefObject } from 'react'
import { btnOutline } from '../components/buttons'
import { Drawer } from '../components/Drawer'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { SegmentedControl } from '../components/SegmentedControl'
import { MODULES } from '../modules/registry'
import type { MemoriaPanel, PestañaAyuda } from './AyudaProvider'
import { buscarTutoriales, duracionCorta, tutorialesDelAlcance, urlDelTutorial } from './catalogo'
import type { Publicado } from './catalogo'
import { PREGUNTAS } from './preguntas'
import { buscarPreguntas, moduloDeAyuda, preguntasDelAlcance, preguntasVisibles } from './reglas'
import type { ModuloAyuda, Pregunta } from './reglas'

/* ============================================================================
   AyudaDrawer — el panel «Ayuda»: Preguntas frecuentes y, desde que hay videos, Tutoriales. Plan:
   docs/plan-tutoriales.md, «Diseño»; mock: docs/mock-tutoriales.html, recuadro 4.

   Se abre desde el menú de la cuenta y desde el buscador global (chip «Ayuda»), encima de lo que estás
   haciendo: es un panel y no un módulo del registry porque la duda aparece en medio de una tarea.

   ── LA PESTAÑA «TUTORIALES» SALE SÓLO CON UN VIDEO PUBLICADO ──
   Mientras no haya ninguno que este usuario pueda ver, el panel es el de T3, sin el control de pestañas: una
   pestaña que lleva a una lista vacía promete algo que no hay (honestidad de datos). Arranca en Preguntas
   (DD7: la duda puntual se resuelve leyendo; cada respuesta enlaza a su video) y recuerda, dentro de la sesión,
   la pestaña y el alcance de la última vez; la búsqueda no.

   ── EL ALCANCE ──
   Arranca en el módulo donde estás parado (lo suyo y después lo general), con «Ver todos los módulos» para
   salir de ahí. Desde Inicio, o si sólo tenés un módulo, arranca en todo y el enlace no aparece: no tendría a
   dónde llevar. CON TEXTO EN EL BUSCADOR, el alcance no se aplica y se busca en LAS DOS pestañas, con la cuenta
   de cada una en el control (DD8b): el vacío sale sólo si el total es 0 (si no, buscar «recepción» parado en
   Preguntas decía «no encontramos nada» y el tutorial existía).

   Capas: se monta como HERMANO del reproductor y del Feedback en `AppShell`, nunca adentro. El fondo del
   `Drawer` lleva `backdropFilter`, que encierra a cualquier hijo `position: fixed` en los 440px del panel.
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
  pestañaInicial?: PestañaAyuda
  /** Pestaña y alcance de la última vez, dentro de la sesión (lo guarda `useEstadoAyuda`). */
  memoria?: MutableRefObject<MemoriaPanel>
  /** Los tutoriales publicados que este usuario ve. Vacío = sin pestaña Tutoriales. */
  tutoriales?: readonly Publicado[]
  base?: string
  vistos?: ReadonlySet<string>
  onAbrirTutorial?: (id: string) => void
  /** «Contanos»: abre el Feedback. Recibe lo que estaba en el buscador, para precargar «Buscaba: …». */
  onContanos: (buscaba: string) => void
  onClose: () => void
}

export function AyudaDrawer({
  moduleKey, isAllowed, accent, preguntaInicial = null, pestañaInicial = 'preguntas', memoria,
  tutoriales = [], base = '', vistos = new Set(), onAbrirTutorial = () => {}, onContanos, onClose,
}: Props) {
  const visibles = useMemo(() => preguntasVisibles(PREGUNTAS, isAllowed), [isAllowed])
  const inicial = preguntaInicial && visibles.some((p) => p.id === preguntaInicial) ? preguntaInicial : null
  const conTutoriales = tutoriales.length > 0
  const publicadoPorId = useMemo(() => new Map(tutoriales.map((t) => [t.id, t])), [tutoriales])

  /* El módulo del shell sólo cuenta si tiene algo que este usuario ve; si no, se arranca en todo. */
  const modulo = moduloDeAyuda(moduleKey)
  const moduloActual = modulo && (visibles.some((p) => p.modulo === modulo) || tutoriales.some((t) => t.modulo === modulo)) ? modulo : null
  const deOtroModulo = (m: ModuloAyuda) => m !== 'general' && m !== moduloActual
  const hayOtrosModulos = visibles.some((p) => deOtroModulo(p.modulo)) || tutoriales.some((t) => deOtroModulo(t.modulo))

  const [termino, setTermino] = useState('')
  /* Desde el buscador global se abre en «todos»: la pregunta pedida puede ser de otro módulo. */
  const [todos, setTodosEstado] = useState(inicial != null || moduloActual == null || (memoria?.current.todos ?? false))
  const setTodos = (v: boolean) => { setTodosEstado(v); if (memoria) memoria.current.todos = v }
  const [pestaña, setPestañaEstado] = useState<PestañaAyuda>(conTutoriales ? pestañaInicial : 'preguntas')
  const setPestaña = (p: PestañaAyuda) => { setPestañaEstado(p); if (memoria) memoria.current.pestaña = p }
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(() => new Set(inicial ? [inicial] : []))

  const buscando = termino.trim() !== ''
  const alcance = todos ? null : moduloActual
  const listaP = buscando ? buscarPreguntas(visibles, termino, moduloActual) : preguntasDelAlcance(visibles, alcance)
  const listaT = ordenarPorModulo(buscando ? buscarTutoriales(tutoriales, termino) : tutorialesDelAlcance(tutoriales, alcance), moduloActual)
  const total = listaP.length + (conTutoriales ? listaT.length : 0)

  const buscadorRef = useRef<HTMLInputElement>(null)
  const preguntaInicialRef = useRef<HTMLButtonElement>(null)

  const alternar = (id: string) =>
    setAbiertas((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })

  const que = pestaña === 'tutoriales' ? 'Tutoriales' : 'Preguntas'
  const cabecera = (
    <div style={{ display: 'grid', gap: 10 }}>
      <label className="spira-field-group" style={campo}>
        <Icon name="search" size={16} color="var(--spira-muted)" />
        <input
          ref={buscadorRef}
          className="spira-bare-input"
          value={termino}
          onChange={(e) => setTermino(e.target.value)}
          placeholder={conTutoriales ? 'Buscá una pregunta o un tutorial' : 'Buscá una pregunta'}
          aria-label="Buscar en la Ayuda"
          style={input}
        />
        {buscando && (
          <button type="button" onClick={() => { setTermino(''); buscadorRef.current?.focus() }} aria-label="Borrar la búsqueda" title="Borrar la búsqueda" style={borrar}>
            <Icon name="x" size={14} color="var(--spira-muted)" />
          </button>
        )}
      </label>
      {conTutoriales && (
        <div style={{ alignSelf: 'flex-start' }}>
          <SegmentedControl<PestañaAyuda>
            label="Sección de la Ayuda"
            forma="pista"
            value={pestaña}
            onChange={setPestaña}
            options={[
              { value: 'preguntas', label: 'Preguntas', badge: buscando ? String(listaP.length) : undefined },
              { value: 'tutoriales', label: 'Tutoriales', badge: buscando ? String(listaT.length) : undefined },
            ]}
          />
        </div>
      )}
      <div style={alcanceStyle} aria-live="polite">
        {buscando ? (
          <span>
            {conTutoriales
              ? 'En todos los módulos'
              : `${listaP.length === 1 ? '1 pregunta' : `${listaP.length} preguntas`} en todos los módulos`}
          </span>
        ) : todos || !moduloActual ? (
          <>
            <span>{conTutoriales ? `${que} de todos los módulos` : 'Todas las preguntas'}</span>
            {moduloActual && (
              <button type="button" onClick={() => setTodos(false)} style={enlace}>
                Sólo {NOMBRE[moduloActual]}
              </button>
            )}
          </>
        ) : (
          <>
            <span>{que} de <b style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>{NOMBRE[moduloActual]}</b> y generales</span>
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

  let cuerpo: React.ReactNode
  if (buscando && total === 0) {
    cuerpo = (
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
    )
  } else if (pestaña === 'tutoriales') {
    cuerpo = listaT.length === 0 ? (
      buscando ? (
        <OtraPestaña texto={`Ningún tutorial con «${termino.trim()}».`} accion={`Ver las preguntas (${listaP.length})`} onAccion={() => setPestaña('preguntas')} />
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 16px', display: 'grid', gap: 6, justifyItems: 'center' }}>
          <strong style={{ fontSize: 15, color: 'var(--spira-ink)' }}>Todavía no hay tutoriales de {moduloActual ? NOMBRE[moduloActual] : 'tus módulos'}</strong>
          <span style={{ fontSize: 13, color: 'var(--spira-muted)' }}>Las preguntas frecuentes sí están.</span>
          {hayOtrosModulos && <button type="button" onClick={() => setTodos(true)} style={{ ...enlace, marginTop: 4 }}>Ver los de todos los módulos</button>}
        </div>
      )
    ) : (
      <div style={{ paddingTop: 4 }}>
        {agrupar(listaT).map(({ modulo: m, items }) => (
          <section key={m} aria-label={NOMBRE[m]}>
            <div style={grupoTut}>
              <h3 className="spira-eyebrow" style={{ margin: 0 }}>{NOMBRE[m]}</h3>
              <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-muted)' }}>
                {items.filter((t) => vistos.has(t.id)).length} de {items.length} vistos
              </span>
            </div>
            {items.map((t) => <FilaTutorial key={t.id} tutorial={t} base={base} visto={vistos.has(t.id)} onAbrir={() => onAbrirTutorial(t.id)} />)}
          </section>
        ))}
      </div>
    )
  } else {
    cuerpo = listaP.length === 0 ? (
      <OtraPestaña texto={`Ninguna pregunta con «${termino.trim()}».`} accion={`Ver los tutoriales (${listaT.length})`} onAccion={() => setPestaña('tutoriales')} />
    ) : (
      <div style={{ paddingTop: 4 }}>
        {agrupar(listaP).map(({ modulo: m, items }) => (
          <section key={m} aria-label={NOMBRE[m]}>
            <h3 className="spira-eyebrow" style={rotulo}>{NOMBRE[m]}</h3>
            {items.map((p) => (
              <FilaPregunta
                key={p.id}
                pregunta={p}
                abierta={abiertas.has(p.id)}
                onAlternar={() => alternar(p.id)}
                botonRef={p.id === inicial ? preguntaInicialRef : undefined}
                tutorial={p.tutorial ? publicadoPorId.get(p.tutorial) ?? null : null}
                onVerTutorial={onAbrirTutorial}
              />
            ))}
          </section>
        ))}
      </div>
    )
  }

  return (
    <Drawer
      title="Ayuda"
      onClose={onClose}
      maxWidth={440}
      initialFocusRef={inicial ? preguntaInicialRef : buscadorRef}
      cabecera={cabecera}
      pie={pie}
    >
      {cuerpo}
    </Drawer>
  )
}

/** Primero el módulo actual, después los otros, lo general al final; dentro de cada uno, el orden del archivo. */
function ordenarPorModulo<T extends { modulo: ModuloAyuda }>(lista: readonly T[], actual: ModuloAyuda | null): T[] {
  const orden = (m: ModuloAyuda) => (m === 'general' ? 2 : m === actual ? 0 : 1)
  return lista.map((x, i) => ({ x, i })).sort((a, b) => orden(a.x.modulo) - orden(b.x.modulo) || a.i - b.i).map(({ x }) => x)
}

/** Corta la lista (ya ordenada) en tramos consecutivos del mismo módulo, para el rótulo de cada grupo. */
function agrupar<T extends { modulo: ModuloAyuda }>(lista: readonly T[]): { modulo: ModuloAyuda; items: T[] }[] {
  const grupos: { modulo: ModuloAyuda; items: T[] }[] = []
  for (const x of lista) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.modulo === x.modulo) ultimo.items.push(x)
    else grupos.push({ modulo: x.modulo, items: [x] })
  }
  return grupos
}

/** Buscando: la pestaña elegida no tiene nada, la otra sí. Se dice, en vez de mostrar una lista vacía. */
function OtraPestaña({ texto, accion, onAccion }: { texto: string; accion: string; onAccion: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 16px', display: 'grid', gap: 8, justifyItems: 'center', fontSize: 13, color: 'var(--spira-muted)' }}>
      <span>{texto}</span>
      <button type="button" onClick={onAccion} style={enlace}>{accion}</button>
    </div>
  )
}

function FilaPregunta({ pregunta, abierta, onAlternar, botonRef, tutorial, onVerTutorial }: {
  pregunta: Pregunta
  abierta: boolean
  onAlternar: () => void
  botonRef?: React.Ref<HTMLButtonElement>
  /** El tutorial publicado que muestra la respuesta, si hay. */
  tutorial: Publicado | null
  onVerTutorial: (id: string) => void
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
          {tutorial && (
            <button type="button" onClick={() => onVerTutorial(tutorial.id)} style={{ ...enlace, display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13 }}>
              <Icon name="play" size={12} color="currentColor" fill="currentColor" stroke={1} />
              Ver cómo se hace
              <span className="spira-mono" style={{ fontWeight: 500, color: 'var(--spira-muted)' }}>{duracionCorta(tutorial.meta.duracionMs)}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FilaTutorial({ tutorial, base, visto, onAbrir }: { tutorial: Publicado; base: string; visto: boolean; onAbrir: () => void }) {
  return (
    <button type="button" onClick={onAbrir} className="spira-row-link spira-no-press" style={filaTut}>
      <span aria-hidden="true" style={mini}>
        <img
          src={urlDelTutorial(base, tutorial, 'poster.jpg')}
          alt=""
          loading="lazy"
          /* Sin póster (todavía no se subió, o sin red) queda el cuadro de papel: la fila sigue diciendo qué es. */
          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <span className="spira-mono" style={miniDur}>{duracionCorta(tutorial.meta.duracionMs)}</span>
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, lineHeight: 1.3, color: 'var(--spira-ink)' }}>{tutorial.titulo}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 12, color: 'var(--spira-muted)' }}>
          {tutorial.resumen}
          {visto && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="check" size={13} color="var(--spira-good)" stroke={2.2} /> Visto
            </span>
          )}
        </span>
      </span>
    </button>
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
const alcanceStyle: CSSProperties = {
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
const grupoTut: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '16px 0 4px' }
const filaBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, padding: '12px 6px',
  border: 'none', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
  font: '600 13.5px/1.35 var(--spira-font-text)', color: 'var(--spira-ink)',
}
const respuesta: CSSProperties = { padding: '0 6px 14px', fontSize: 13, lineHeight: 1.55, color: 'var(--spira-muted)' }
const filaTut: CSSProperties = {
  display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 12, alignItems: 'center', width: '100%', minHeight: 64,
  padding: '8px 6px', border: 'none', borderRadius: 10, textAlign: 'left', cursor: 'pointer', font: 'inherit',
}
const mini: CSSProperties = {
  position: 'relative', width: 96, aspectRatio: '16 / 9', borderRadius: 6, overflow: 'hidden',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)', background: 'var(--spira-paper)',
}
const miniDur: CSSProperties = {
  position: 'absolute', right: 4, bottom: 4, background: 'rgba(20, 48, 46, 0.78)', color: '#F4F1EA',
  font: '600 10px/1 var(--spira-font-text)', padding: '3px 4px', borderRadius: 4,
}
