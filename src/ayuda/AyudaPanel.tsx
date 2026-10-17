import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Drawer } from '../components/Drawer'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { MODULES } from '../modules/registry'
import './ayuda.css'
import type { EstadoPanel } from './AyudaProvider'
import { capituloActual, duracionCorta, duracionHablada, urlDelTutorial } from './catalogo'
import type { Publicado } from './catalogo'
import { DESTACADOS } from './destacados'
import { buscarEnAyuda, destacadosVisibles, pestañasVisibles, preguntasDeLaPestaña, tutorialInicial } from './panel'
import type { PestañaPanel, Resultado } from './panel'
import { DiscoPlay, TextoAyuda } from './piezas'
import { PREGUNTAS } from './preguntas'
import { preguntasVisibles } from './reglas'
import type { ModuloAyuda, Pregunta } from './reglas'
import { useVideoTutorial } from './useVideoTutorial'

/* ============================================================================
   AyudaPanel — la Ayuda v2 (E2 de docs/plan-ayuda-manual.md; handoff docs/handoff-ayuda-manual/, §2).

   Un solo panel con pestañas: Inicio · Primeros pasos · Coordinación · Farmacia. Cada pestaña de módulo es una
   vista: el video con sus capítulos (se mira ACÁ, ya no hay reproductor aparte), las preguntas del tema y los
   otros tutoriales del módulo. Con texto en cualquier buscador desaparecen las pestañas y se busca en todo lo que
   el usuario ve (la regla de `reglas.ts`).

     abrir ──► Inicio ──(mosaico / pestaña)──► Pestaña de módulo ◄──(bajada, globo, buscador global)
                 │                                   │
                 └──── texto en un buscador ──► Búsqueda ──(borrar)──► vuelve a donde estaba

   El tutorial de cada pestaña se ELIGE una vez, al entrar (`tutorialInicial`), y queda: si se recalculara en
   cada redibujo, terminar de ver el video lo marcaría «visto» y la pestaña saltaría sola al siguiente sin ver.

   Lo que todavía NO está, a propósito: los accesos al Manual de usuario (la franja de Inicio, «Leer … en el
   manual», «<Módulo> en el manual»). Llegan con el manual (E5); antes serían botones que llevan a nada.

   Capas: se monta como HERMANO del Feedback en `AppShell` (ver `AyudaProvider.tsx`).
   ============================================================================ */

const nombreModulo = (key: string, alt: string) => MODULES.find((m) => m.key === key)?.name ?? alt
const NOMBRE: Record<ModuloAyuda, string> = {
  general: 'Primeros pasos',
  track: nombreModulo('track', 'Coordinación'),
  pharma: nombreModulo('pharma', 'Farmacia'),
}
/* Íconos y colores de las pestañas: los del handoff (§2, «Pestañas»). Inicio en tinta para que se vea en oscuro. */
const PESTAÑA: Record<PestañaPanel, { nombre: string; icono: IconName; color: string }> = {
  inicio: { nombre: 'Inicio', icono: 'home', color: 'var(--spira-ink)' },
  general: { nombre: NOMBRE.general, icono: 'flag', color: '#B07A1E' },
  track: { nombre: NOMBRE.track, icono: 'calendarCheck', color: '#2E7D74' },
  pharma: { nombre: NOMBRE.pharma, icono: 'pill', color: '#3F7A3A' },
}

interface Props {
  isAllowed: (moduleKey: string) => boolean
  /** La pantalla donde está el usuario, `"<modulo>/<sub>"`: elige el tutorial que se carga primero. */
  vista: string | null
  tutoriales: readonly Publicado[]
  base: string
  vistos: ReadonlySet<string>
  onVisto: (id: string) => void
  inicial: EstadoPanel
  /** «Contanos»: abre el Feedback. Recibe lo que estaba en el buscador, para precargar «Buscaba: …». */
  onContanos: (buscaba: string) => void
  onClose: () => void
}

export function AyudaPanel({ isAllowed, vista, tutoriales, base, vistos, onVisto, inicial, onContanos, onClose }: Props) {
  const preguntas = useMemo(() => preguntasVisibles(PREGUNTAS, isAllowed), [isAllowed])
  const publicadosIds = useMemo(() => new Set(tutoriales.map((t) => t.id)), [tutoriales])
  const pestañas = pestañasVisibles(isAllowed)

  const elegir = (m: ModuloAyuda) => tutorialInicial(tutoriales, m, vista, vistos)?.id ?? null
  const [pestaña, setPestaña] = useState<PestañaPanel>(pestañas.includes(inicial.pestaña) ? inicial.pestaña : 'inicio')
  /* El tutorial elegido en cada pestaña de módulo. `undefined` = todavía no se entró. */
  const [elegidos, setElegidos] = useState<Partial<Record<ModuloAyuda, string | null>>>(() =>
    inicial.pestaña === 'inicio' ? {} : { [inicial.pestaña]: inicial.tutorialId ?? elegir(inicial.pestaña) })
  /* Las preguntas abiertas. `null` = nadie tocó nada en esta vista: va abierta la primera (handoff). */
  const [abiertas, setAbiertas] = useState<ReadonlySet<string> | null>(inicial.preguntaId ? new Set([inicial.preguntaId]) : null)
  const [enfocar, setEnfocar] = useState<string | null>(inicial.preguntaId)
  const [termino, setTermino] = useState('')
  /* Arrancar a reproducir desde un segundo: sólo una vez, en el tutorial con el que se abrió. */
  const arranque = useRef(inicial.segundo > 0 && inicial.tutorialId ? { id: inicial.tutorialId, segundo: inicial.segundo } : null)

  const buscadorRef = useRef<HTMLInputElement>(null)
  const cuerpoRef = useRef<HTMLDivElement>(null)
  const buscando = termino.trim() !== ''

  /* La pregunta pedida (desde el buscador global o un resultado): a la vista y con el foco, después de dibujarse. */
  useEffect(() => {
    if (!enfocar) return
    const el = document.getElementById(`ayuda-p-${enfocar}`)
    el?.scrollIntoView({ block: 'center' })
    el?.focus({ preventScroll: true })
    setEnfocar(null)
  }, [enfocar])

  const irA = (p: PestañaPanel, o: { tutorialId?: string | null; preguntaId?: string } = {}) => {
    setPestaña(p)
    setTermino('')
    setAbiertas(o.preguntaId ? new Set([o.preguntaId]) : null)
    if (p !== 'inicio') {
      const m = p
      if (o.tutorialId !== undefined) setElegidos((prev) => ({ ...prev, [m]: o.tutorialId }))
      else if (elegidos[m] === undefined) setElegidos((prev) => ({ ...prev, [m]: elegir(m) }))
    }
    if (o.preguntaId) setEnfocar(o.preguntaId)
    else cuerpoRef.current?.scrollTo({ top: 0 })
  }
  const abrirResultado = (r: Resultado) => {
    if (r.tipo === 'tutorial') irA(r.tutorial.modulo, { tutorialId: r.tutorial.id })
    else {
      const p = r.pregunta
      const suTutorial = p.tutorial && publicadosIds.has(p.tutorial) ? p.tutorial : undefined
      irA(p.modulo, { tutorialId: suTutorial, preguntaId: p.id })
    }
  }

  const onTeclaPestañas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const i = pestañas.indexOf(pestaña)
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? pestañas.length - 1
      : (i + (e.key === 'ArrowRight' ? 1 : -1) + pestañas.length) % pestañas.length
    irA(pestañas[j])
    document.getElementById(`ayuda-tab-${pestañas[j]}`)?.focus()
  }

  const buscador = (grande: boolean) => (
    <label className={`spira-ayuda-buscador${grande ? ' spira-ayuda-buscador--grande' : ''}`}>
      <Icon name="search" size={16} color="var(--spira-muted)" />
      <input
        ref={buscadorRef}
        value={termino}
        onChange={(e) => setTermino(e.target.value)}
        placeholder={grande ? 'Ej.: dispensar, reprogramar, campana' : 'Buscá una pregunta o un tutorial'}
        aria-label="Buscar en la Ayuda"
      />
      {buscando && (
        <button
          type="button"
          className="spira-no-press"
          onClick={() => { setTermino(''); buscadorRef.current?.focus() }}
          aria-label="Borrar la búsqueda"
          title="Borrar la búsqueda"
          style={{ width: 26, height: 26, border: 'none', borderRadius: 7, background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
        >
          <Icon name="x" size={14} color="var(--spira-muted)" />
        </button>
      )}
    </label>
  )

  const cabecera = pestaña === 'inicio' && !buscando ? (
    <PestañasAyuda pestañas={pestañas} actual={pestaña} onElegir={(p) => irA(p)} onTecla={onTeclaPestañas} />
  ) : pestaña === 'inicio' ? undefined : (
    <div style={{ display: 'grid', gap: 12 }}>
      {buscador(false)}
      {!buscando && <PestañasAyuda pestañas={pestañas} actual={pestaña} onElegir={(p) => irA(p)} onTecla={onTeclaPestañas} />}
    </div>
  )

  const resultados = buscando ? buscarEnAyuda(preguntas, tutoriales, termino) : []
  const vistaResultados = (
    <Resultados resultados={resultados} termino={termino} vistos={vistos} onAbrir={abrirResultado} onContanos={() => onContanos(termino.trim())} />
  )

  let cuerpo
  if (pestaña === 'inicio') {
    cuerpo = (
      <>
        <h3 style={{ font: '700 17px/1.3 var(--spira-font-display)', margin: '16px 0 10px', color: 'var(--spira-ink)' }}>¿Qué querés hacer?</h3>
        {buscador(true)}
        {buscando ? vistaResultados : (
          <Inicio
            pestañas={pestañas}
            preguntas={preguntas}
            tutoriales={tutoriales}
            vistos={vistos}
            onAbrir={abrirResultado}
            onPestaña={(p) => irA(p)}
          />
        )}
      </>
    )
  } else if (buscando) {
    cuerpo = vistaResultados
  } else {
    const m = pestaña
    const tutorial = tutoriales.find((t) => t.id === elegidos[m]) ?? null
    const lista = preguntasDeLaPestaña(preguntas, publicadosIds, m, tutorial?.id ?? null)
    const segundo = arranque.current && tutorial && arranque.current.id === tutorial.id ? arranque.current.segundo : 0
    cuerpo = (
      <VistaModulo
        key={`${m}-${tutorial?.id ?? 'sin'}`}
        modulo={m}
        tutorial={tutorial}
        otros={tutoriales.filter((t) => t.modulo === m && t.id !== tutorial?.id)}
        preguntas={lista}
        abiertas={abiertas ?? new Set(lista[0] ? [lista[0].id] : [])}
        onAlternar={(id) => setAbiertas((prev) => {
          const s = new Set(prev ?? (lista[0] ? [lista[0].id] : []))
          if (s.has(id)) s.delete(id); else s.add(id)
          return s
        })}
        base={base}
        vistos={vistos}
        onVisto={onVisto}
        segundoInicial={segundo}
        onArranco={() => { arranque.current = null }}
        onOtro={(id) => irA(m, { tutorialId: id })}
      />
    )
  }

  const pie = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
      <Icon name="message" size={15} color="var(--spira-muted)" />
      <span>¿No está tu duda?</span>
      <button type="button" className="spira-ayuda-enlace" onClick={() => onContanos(termino.trim())}>Contanos</button>
    </div>
  )

  return (
    <Drawer
      title="Ayuda"
      onClose={onClose}
      maxWidth={440}
      velo="suave"
      initialFocusRef={inicial.preguntaId ? undefined : buscadorRef}
      cabecera={cabecera}
      pie={pie}
    >
      <div
        ref={cuerpoRef}
        id="ayuda-cuerpo"
        role={buscando ? undefined : 'tabpanel'}
        aria-labelledby={buscando ? undefined : `ayuda-tab-${pestaña}`}
        style={{ paddingBottom: 4 }}
      >
        {cuerpo}
      </div>
    </Drawer>
  )
}

/* —— pestañas —— */

function PestañasAyuda({ pestañas, actual, onElegir, onTecla }: {
  pestañas: PestañaPanel[]
  actual: PestañaPanel
  onElegir: (p: PestañaPanel) => void
  onTecla: (e: KeyboardEvent<HTMLDivElement>) => void
}) {
  return (
    <div role="tablist" aria-label="Secciones de la Ayuda" className="spira-ayuda-pestanas" onKeyDown={onTecla}>
      {pestañas.map((p) => (
        <button
          key={p}
          id={`ayuda-tab-${p}`}
          type="button"
          role="tab"
          aria-selected={p === actual}
          aria-controls="ayuda-cuerpo"
          tabIndex={p === actual ? 0 : -1}
          className="spira-ayuda-pestana spira-no-press"
          onClick={() => onElegir(p)}
        >
          <Icon name={PESTAÑA[p].icono} size={15} stroke={2} color={PESTAÑA[p].color} />
          {PESTAÑA[p].nombre}
        </button>
      ))}
    </div>
  )
}

/* —— Inicio —— */

function Inicio({ pestañas, preguntas, tutoriales, vistos, onAbrir, onPestaña }: {
  pestañas: PestañaPanel[]
  preguntas: readonly Pregunta[]
  tutoriales: readonly Publicado[]
  vistos: ReadonlySet<string>
  onAbrir: (r: Resultado) => void
  onPestaña: (p: PestañaPanel) => void
}) {
  const esenciales = destacadosVisibles(DESTACADOS, preguntas, tutoriales)
  const modulos = pestañas.filter((p): p is ModuloAyuda => p !== 'inicio')
  return (
    <>
      {esenciales.length > 0 && (
        <section aria-label="Lo esencial">
          <h4 className="spira-ayuda-sec" style={{ marginTop: 22 }}>Lo esencial</h4>
          {esenciales.map((r) => <FilaResultado key={claveDe(r)} resultado={r} vistos={vistos} onAbrir={onAbrir} />)}
        </section>
      )}
      <section aria-label="Por módulo">
        <h4 className="spira-ayuda-sec" style={{ marginTop: 22 }}>Por módulo</h4>
        <div className="spira-ayuda-mosaicos">
          {modulos.map((m) => {
            const nTut = tutoriales.filter((t) => t.modulo === m).length
            const nPreg = preguntas.filter((p) => p.modulo === m).length
            return (
              <button key={m} type="button" className="spira-ayuda-mosaico" onClick={() => onPestaña(m)}>
                {/* El fondo es el color del ícono al 10 %: hex constante del handoff, no un token (no se le pega «1A» a un var). */}
                <span className="spira-ayuda-mosaico__ic" style={{ background: `${PESTAÑA[m].color}1A` }}>
                  <Icon name={PESTAÑA[m].icono} size={18} stroke={2} color={PESTAÑA[m].color} />
                </span>
                <span>
                  <span style={{ display: 'block', font: '700 13.5px/1.25 var(--spira-font-display)' }}>{PESTAÑA[m].nombre}</span>
                  <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>
                    {nTut > 0 ? cuenta(nTut, 'tutorial', 'tutoriales') : cuenta(nPreg, 'pregunta', 'preguntas')}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </>
  )
}

/* —— resultados de búsqueda —— */

function Resultados({ resultados, termino, vistos, onAbrir, onContanos }: {
  resultados: Resultado[]
  termino: string
  vistos: ReadonlySet<string>
  onAbrir: (r: Resultado) => void
  onContanos: () => void
}) {
  if (resultados.length === 0) {
    return (
      <div aria-live="polite" style={{ padding: '36px 8px', textAlign: 'center', fontSize: 13, color: 'var(--spira-muted)', display: 'grid', gap: 8, justifyItems: 'center' }}>
        <span>Nada para «{termino.trim()}».</span>
        <button type="button" className="spira-ayuda-enlace" onClick={onContanos}>Contanos qué buscabas</button>
      </div>
    )
  }
  return (
    <section aria-label="Resultados">
      <h4 className="spira-ayuda-sec" aria-live="polite">Resultados<span>{resultados.length}</span></h4>
      {resultados.map((r) => <FilaResultado key={claveDe(r)} resultado={r} termino={termino} vistos={vistos} onAbrir={onAbrir} />)}
    </section>
  )
}

function FilaResultado({ resultado: r, termino = '', vistos, onAbrir }: {
  resultado: Resultado
  termino?: string
  vistos: ReadonlySet<string>
  onAbrir: (r: Resultado) => void
}) {
  if (r.tipo === 'tutorial') {
    const t = r.tutorial
    return (
      <button type="button" className="spira-ayuda-fila spira-no-press" onClick={() => onAbrir(r)}>
        <DiscoPlay visto={vistos.has(t.id)} tamaño="sm" />
        <span className="spira-ayuda-fila__titulo" style={{ fontWeight: 600 }}><TextoAyuda texto={t.titulo} termino={termino} /></span>
        <span className="spira-ayuda-fila__meta">
          {NOMBRE[t.modulo]} · <span className="spira-mono" aria-label={duracionHablada(t.meta.duracionMs)}>{duracionCorta(t.meta.duracionMs)}</span>
        </span>
      </button>
    )
  }
  const p = r.pregunta
  return (
    <button type="button" className="spira-ayuda-fila spira-no-press" onClick={() => onAbrir(r)}>
      <span className="spira-ayuda-texto-ic" aria-hidden="true"><Icon name="list" size={11} stroke={2} color="currentColor" /></span>
      <span className="spira-ayuda-fila__titulo"><TextoAyuda texto={p.pregunta} termino={termino} /></span>
      <span className="spira-ayuda-fila__meta">{NOMBRE[p.modulo]}</span>
    </button>
  )
}

/* —— la pestaña de un módulo —— */

function VistaModulo({
  modulo, tutorial, otros, preguntas, abiertas, onAlternar, base, vistos, onVisto, segundoInicial, onArranco, onOtro,
}: {
  modulo: ModuloAyuda
  tutorial: Publicado | null
  otros: Publicado[]
  preguntas: Pregunta[]
  abiertas: ReadonlySet<string>
  onAlternar: (id: string) => void
  base: string
  vistos: ReadonlySet<string>
  onVisto: (id: string) => void
  segundoInicial: number
  onArranco: () => void
  onOtro: (id: string) => void
}) {
  const v = useVideoTutorial({
    src: tutorial ? urlDelTutorial(base, tutorial, 'video.mp4') : '',
    segundoInicial,
    onVisto: () => { if (tutorial) onVisto(tutorial.id) },
  })
  /* Se abrió para seguir mirando desde un segundo («Ver en grande» de la tarjeta): arranca solo, una vez. */
  const { reproducir } = v
  useEffect(() => {
    if (segundoInicial > 0) { reproducir(); onArranco() }
    // Sólo al montar, a propósito: cada tutorial monta su propia vista (`key`).
  }, [])

  const capitulos = tutorial?.meta.capitulos ?? []
  const actual = capituloActual(capitulos, v.tiempo * 1000)
  const falla = v.estado === 'noDisponible' || v.estado === 'sinRed'
  const pantalla = tutorial?.vista
    ? MODULES.find((m) => `${m.key}` === tutorial.vista!.split('/')[0])?.submodules.find((s) => s.key === tutorial.vista!.split('/')[1])?.name
    : undefined

  return (
    <>
      {tutorial && (
        <section aria-label={`Tutorial: ${tutorial.titulo}`}>
          <h4 className="spira-ayuda-sec">
            {pantalla ?? NOMBRE[modulo]}
            <span className="spira-mono" aria-label={duracionHablada(tutorial.meta.duracionMs)}>{duracionCorta(tutorial.meta.duracionMs)}</span>
          </h4>
          <div className="spira-ayuda-video">
            {!falla && (
              <video
                {...v.props}
                poster={urlDelTutorial(base, tutorial, 'poster.jpg')}
                controls={v.estado !== 'inicio'}
                preload="metadata"
                playsInline
                crossOrigin="anonymous"
                aria-label={`Tutorial: ${tutorial.titulo}`}
              >
                <track kind="captions" src={urlDelTutorial(base, tutorial, 'subtitulos.vtt')} srcLang="es" label="Español" default />
              </video>
            )}
            {v.estado === 'inicio' && !falla && (
              <button
                type="button"
                className="spira-ayuda-video__play spira-no-press"
                onClick={v.reproducir}
                aria-label={`Reproducir «${tutorial.titulo}», ${duracionHablada(tutorial.meta.duracionMs)}`}
              >
                <DiscoPlay visto={vistos.has(tutorial.id)} tamaño="lg" />
                <span className="spira-ayuda-video__dur" aria-hidden="true">{duracionCorta(tutorial.meta.duracionMs)}</span>
              </button>
            )}
            {falla && (
              <div className="spira-ayuda-video__aviso" role="status">
                <div style={{ display: 'grid', gap: 6, justifyItems: 'center', maxWidth: 300 }}>
                  <strong style={{ fontSize: 14, color: 'var(--spira-ink)' }}>
                    {v.estado === 'noDisponible' ? 'Este video todavía no está disponible' : 'No se pudo cargar el video'}
                  </strong>
                  <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
                    {v.estado === 'noDisponible' ? 'Los pasos de abajo cuentan lo mismo.' : 'Revisá la conexión y probá de nuevo.'}
                  </span>
                  {v.estado === 'sinRed' && (
                    <button type="button" className="spira-ayuda-enlace" onClick={v.reintentar} style={{ marginTop: 4 }}>
                      <Icon name="rotateCcw" size={13} color="currentColor" /> Reintentar
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <h3 style={{ font: '700 15px/1.3 var(--spira-font-display)', color: 'var(--spira-ink)', margin: '12px 0 6px' }}>{tutorial.titulo}</h3>

          {capitulos.length > 0 && (
            <nav aria-label="Capítulos">
              {capitulos.map((c, i) => (
                <button
                  key={c.inicioMs}
                  type="button"
                  className="spira-ayuda-cap spira-no-press"
                  aria-current={i === actual ? 'true' : undefined}
                  aria-label={`Ir a ${duracionHablada(c.inicioMs)}: ${c.titulo}`}
                  onClick={() => v.irA(c.inicioMs / 1000)}
                  disabled={falla}
                >
                  <span className="spira-ayuda-cap__n" aria-hidden="true">{i + 1}</span>
                  <span className="spira-ayuda-cap__cuerpo">
                    <span className="spira-ayuda-cap__titulo">{c.titulo}</span>
                    {c.texto && <TextoAyuda texto={c.texto} />}
                  </span>
                  <span className="spira-ayuda-cap__t" aria-hidden="true">{duracionCorta(c.inicioMs)}</span>
                </button>
              ))}
            </nav>
          )}

          {/* Lo que dice la voz, entero: la alternativa al video (WCAG 1.2.1) y lo que se lee si no carga. */}
          <details style={{ marginTop: 8 }}>
            <summary className="spira-ayuda-enlace" style={{ cursor: 'pointer' }}>Leer la transcripción</summary>
            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, color: 'var(--spira-ink-soft)' }}>
              {tutorial.meta.transcripcion.map((linea, i) => <p key={i} style={{ margin: i ? '6px 0 0' : 0 }}><TextoAyuda texto={linea} /></p>)}
            </div>
          </details>
        </section>
      )}

      {preguntas.length > 0 && (
        <section aria-label="Preguntas">
          <h4 className="spira-ayuda-sec">Preguntas</h4>
          {preguntas.map((p) => {
            const cap = tutorial && p.tutorial === tutorial.id && p.capitulo ? capitulos.find((c) => c.titulo === p.capitulo) : undefined
            return (
              <FilaPregunta
                key={p.id}
                pregunta={p}
                abierta={abiertas.has(p.id)}
                onAlternar={() => onAlternar(p.id)}
                salto={cap && !falla ? { texto: duracionCorta(cap.inicioMs), hablado: duracionHablada(cap.inicioMs), ir: () => v.irA(cap.inicioMs / 1000) } : undefined}
              />
            )
          })}
        </section>
      )}

      {otros.length > 0 && (
        <section aria-label={`Otros tutoriales de ${NOMBRE[modulo]}`}>
          <h4 className="spira-ayuda-sec">Otros tutoriales de {NOMBRE[modulo]}</h4>
          {otros.map((t) => (
            <button key={t.id} type="button" className="spira-ayuda-fila spira-no-press" onClick={() => onOtro(t.id)} style={{ alignItems: 'center' }}>
              <span className="spira-ayuda-mini" aria-hidden="true">
                <img
                  src={urlDelTutorial(base, t, 'poster.jpg')}
                  alt=""
                  loading="lazy"
                  /* Sin póster (no se subió, o sin red) queda el cuadro de papel: la fila sigue diciendo qué es. */
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                />
                <span className="spira-ayuda-video__dur">{duracionCorta(t.meta.duracionMs)}</span>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 13.6, lineHeight: 1.35 }}>{t.titulo}</span>
                <span style={{ display: 'block', fontSize: 12.3, lineHeight: 1.45, color: 'var(--spira-ink-soft)', marginTop: 2 }}>{t.resumen}</span>
                {vistos.has(t.id) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 3 }}>
                    <Icon name="check" size={12} color="var(--spira-good)" stroke={2.2} /> Visto
                  </span>
                )}
              </span>
            </button>
          ))}
        </section>
      )}

      {!tutorial && preguntas.length === 0 && (
        <p style={{ padding: '36px 8px', textAlign: 'center', fontSize: 13, color: 'var(--spira-muted)' }}>
          Todavía no hay ayuda de {NOMBRE[modulo]}.
        </p>
      )}
    </>
  )
}

function FilaPregunta({ pregunta, abierta, onAlternar, salto }: {
  pregunta: Pregunta
  abierta: boolean
  onAlternar: () => void
  /** «▶ 0:26 en el video»: sólo si la respuesta corresponde a un capítulo del tutorial cargado. */
  salto?: { texto: string; hablado: string; ir: () => void }
}) {
  const idBoton = `ayuda-p-${pregunta.id}`
  const idRespuesta = `ayuda-r-${pregunta.id}`
  return (
    <div className="spira-ayuda-q">
      <button
        id={idBoton}
        type="button"
        className="spira-ayuda-q__boton spira-no-press"
        aria-expanded={abierta}
        aria-controls={idRespuesta}
        onClick={onAlternar}
      >
        <span><TextoAyuda texto={pregunta.pregunta} /></span>
        <Icon name={abierta ? 'chevronUp' : 'chevronDown'} size={16} color="var(--spira-faint)" />
      </button>
      {abierta && (
        <div id={idRespuesta} role="region" aria-labelledby={idBoton} className="spira-ayuda-q__resp">
          <TextoAyuda texto={pregunta.respuesta} parrafos />
          {salto && (
            <button type="button" className="spira-ayuda-enlace" onClick={salto.ir} aria-label={`Ver en el video, desde ${salto.hablado}`}>
              <DiscoPlay visto tamaño="sm" /> <span className="spira-mono">{salto.texto}</span> en el video
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* —— utilidades —— */

const claveDe = (r: Resultado) => (r.tipo === 'tutorial' ? `t-${r.tutorial.id}` : `p-${r.pregunta.id}`)
const cuenta = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
