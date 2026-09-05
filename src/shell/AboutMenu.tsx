import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { Vilano } from '../components/Vilano'
import { SPIRA_VERSION } from '../lib/version'
import type { ChangelogEntry } from '../lib/version'

/* ============================================================================
   AboutMenu — botón «i» al pie del rail de módulos + popover "Acerca de Spira".

   Reemplaza la tuerca de Ajustes (sus ítems se movieron al UserMenu). Muestra
   marca + versión de plataforma + chip de canal + Novedades (changelog), y su
   acción principal es "Dar feedback" (que el shell monta como modal aparte).

   Autocontenido, mismo patrón que UserMenu/NotificationsMenu: trigger + popover,
   foco/Esc/click-afuera propios. El acento es contextual (color del módulo activo).
   ============================================================================ */

interface AboutMenuProps {
  /** Acento del módulo activo (hex). */
  accent: string
  /** El shell abre el FeedbackModal (montado a nivel shell). */
    onFeedback: () => void
    /** Abierto o no. El estado vive en el shell porque este popover se abre desde DOS lados: su
     *  propio botón del riel y el "Ver todas" de Novedades en Inicio › Resumen. */
    open: boolean
    onOpenChange: (v: boolean) => void
}

/** Cuántas novedades se muestran por defecto; el resto se pliega tras "Ver más
    antiguas". Tres, no cinco: decisión del Director al ver que el popover abría
    scrolleando. Se sostiene aunque los textos hoy sean cortos — lo que se busca al
    abrir es enterarse de lo último, no leer la historia entera. */
const VISIBLE_NEWS = 3

/** Cuántos renglones se muestran de cada novedad antes de recortarla. Hoy **ninguna
    llega** a los tres: el changelog se acortó a una línea por entrada (2026-09-04) y
    `version.ts` lo pide explícitamente. Esto queda como red: cuando alguien escriba
    una novedad larga —ya pasó, la 0.53 llegó a ocho renglones a este ancho—, el
    popover no se estira, la recorta y ofrece "Seguir leyendo". Si el botón aparece,
    es una señal de que ese texto se pasó de una línea. */
const NEWS_LINES = 3

export function AboutMenu({ accent, onFeedback, open, onOpenChange }: AboutMenuProps) {
  const setOpen = onOpenChange
  // Novedades viejas plegadas por defecto (ver VISIBLE_NEWS).
  const [showAllNews, setShowAllNews] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Cerrar al click afuera.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Esc cierra — pero NO si hay un modal encima (para no pisar el Escape del FeedbackModal).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Al cerrar, volver a plegar las novedades viejas: reabrir arranca colapsado.
  useEffect(() => { if (!open) setShowAllNews(false) }, [open])

  // Desplegar (o plegar) devuelve la lista al tope: lo que se quiere leer al tocar
  // "Ver más antiguas" es la novedad siguiente a la última visible, no el punto donde
  // había quedado el scroll. Al plegar, además, el navegador dejaría un scrollTop
  // heredado de la lista larga sobre una lista corta.
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0 }, [showAllNews])

  const V = SPIRA_VERSION
  // Canal pre-release (beta/alpha/rc) → etiqueta junto al wordmark. En 'estable' no
  // se muestra: un producto estable no necesita rotularse.
  const isPre = V.channel !== 'estable'
  const feedback = () => { setOpen(false); onFeedback() }

  return (
    <div ref={rootRef} style={{ marginTop: 'auto', position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Acerca de Spira · versión"
        style={{
          width: 46, height: 46, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: open ? accent + '16' : 'transparent', display: 'grid', placeItems: 'center',
        }}
      >
        <Icon name="info" size={21} stroke={1.9} color={open ? accent : 'var(--spira-muted)'} />
      </button>

      {open && (
        <div role="dialog" aria-label="Acerca de Spira" style={panel}>
          {/* 1 · cabecera de marca */}
          <div style={header}>
            <span style={{ ...markBox, background: accent + '16' }}><Vilano size={25} color={accent} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em', color: 'var(--spira-ink)' }}>Spira</span>
                {isPre && <span style={betaBadge(accent)}>{V.channel}</span>}
              </div>
              <span className="spira-mono" style={{ display: 'inline-block', marginTop: 3, fontSize: 11.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>Plataforma {V.app}</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" style={closeBtn}>
              <Icon name="x" size={18} color="var(--spira-muted)" />
            </button>
          </div>

          {/* 2 · barra de la sección — rótulo + plegado. Va FIJA (fuera del área que
               scrollea) porque con las 40 novedades desplegadas el botón de "Ver menos"
               quedaba al fondo de la lista: para volver a plegar había que recorrerla
               entera. Acá el control está siempre a un clic. */}
          <div style={newsBar}>
            <span className="spira-eyebrow">Novedades</span>
            {V.changelog.length > VISIBLE_NEWS && (
              <button
                type="button"
                onClick={() => setShowAllNews((v) => !v)}
                aria-expanded={showAllNews}
                aria-controls="spira-about-novedades"
                style={moreNewsBtn(accent)}
              >
                {showAllNews ? 'Ver menos' : `Ver ${V.changelog.length - VISIBLE_NEWS} más antiguas`}
                <Icon name={showAllNews ? 'chevronUp' : 'chevronDown'} size={14} color={accent} />
              </button>
            )}
          </div>

          {/* 3 · listado — la ÚNICA banda que scrollea. Por defecto solo las
               VISIBLE_NEWS más recientes; desplegadas, el popover deja de crecer al
               llegar a su techo (ver `panel`) y la lista se recorre acá adentro. */}
          <div ref={listRef} id="spira-about-novedades" className="spira-scroll" style={newsList}>
            {(showAllNews ? V.changelog : V.changelog.slice(0, VISIBLE_NEWS)).map((c, i) => (
              <NewsItem key={i} entry={c} />
            ))}
          </div>

          {/* 4 · pie — dar feedback */}
          <div style={{ flex: '0 0 auto', padding: '11px 14px', borderTop: '1px solid var(--spira-line)', background: 'var(--spira-surface)' }}>
            <button type="button" onClick={feedback} style={feedbackBtn}>
              <Icon name="message" size={16} color={accent} /> Dar feedback
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ————————————————————————————————————————————————————————————————————————————
   Una novedad del changelog: badge de versión + texto recortado a NEWS_LINES
   renglones, con "Seguir leyendo" debajo para desplegarla en el lugar.
   ———————————————————————————————————————————————————————————————————————————— */
function NewsItem({ entry }: { entry: ChangelogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const textRef = useRef<HTMLParagraphElement | null>(null)
  // ¿El texto REALMENTE se recortó? Las novedades viejas son de un renglón: ahí no hay
  // nada que seguir leyendo y el botón sería un control que no hace nada. Se mide
  // comparando el alto del contenido contra la ventana que le deja el recorte, y solo
  // mientras está plegado (desplegado los dos coinciden y la respuesta sería siempre
  // "no"). Sin array de deps a propósito: cualquier re-render lo revalida, así que si
  // la tipografía carga tarde y cambia el alto de renglón, la respuesta se corrige.
  const [clipped, setClipped] = useState(false)
  useLayoutEffect(() => {
    const el = textRef.current
    if (!el || expanded) return
    setClipped(el.scrollHeight > el.clientHeight + 1)
  })

  return (
    <div style={{ display: 'flex', gap: 9, padding: '5px 0', alignItems: 'flex-start' }}>
      <span className="spira-mono" style={verBadge}>{entry.version}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p ref={textRef} style={expanded ? newsText : newsTextClipped}>{entry.text}</p>
        {clipped && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={readMoreBtn}
          >
            {expanded ? 'Mostrar menos' : 'Seguir leyendo'}
            <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={12} color="var(--spira-muted)" />
          </button>
        )}
      </div>
    </div>
  )
}

/* —— estilos —— */
/** El popover está anclado por su borde INFERIOR (`bottom`) al pie del riel, así que
    crece hacia arriba: sin techo, desplegar las novedades viejas lo empujaba fuera del
    viewport y el `overflow: hidden` recortaba la cabecera — el comienzo quedaba
    inalcanzable, sin scroll que lo trajera de vuelta. El techo cuenta los 60px de la
    barra superior más aire arriba y abajo; de ahí en más scrollea el listado, que es
    columna flexible con `minHeight: 0` (sin eso, un hijo flex no se deja achicar por
    debajo de su contenido y el `overflow` del listado no llega a activarse). */
const panel: CSSProperties = {
  position: 'absolute', bottom: 10, left: 60, zIndex: 40, width: 288,
  maxHeight: 'calc(100vh - 104px)', display: 'flex', flexDirection: 'column',
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 18,
  boxShadow: '0 24px 60px rgba(20, 48, 46, 0.24)', overflow: 'hidden',
}
const header: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 11, flex: '0 0 auto',
  padding: '15px 12px 13px 18px', borderBottom: '1px solid var(--spira-line)',
}
/** Rótulo de la sección + el plegado, en un renglón fijo sobre el listado. */
const newsBar: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  flex: '0 0 auto', padding: '12px 18px 6px',
}
const newsList: CSSProperties = {
  flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
  padding: '0 18px 12px',
}
const markBox: CSSProperties = {
  width: 38, height: 38, flex: '0 0 auto', borderRadius: 11, display: 'grid', placeItems: 'center',
}
/** Etiqueta de canal pre-release (BETA) pegada al wordmark: rótulo (mayúsculas +
    tracking, la convención de marca), tintada con el acento del módulo. Integrada al
    lockup pero con borde propio para que se note que es una etiqueta. */
function betaBadge(accent: string): CSSProperties {
  return {
    fontFamily: 'var(--spira-font-text)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: accent, background: accent + '1e', border: `1px solid ${accent}33`,
    borderRadius: 5, padding: '2px 5px', lineHeight: 1, whiteSpace: 'nowrap',
  }
}
const closeBtn: CSSProperties = {
  width: 28, height: 28, flex: '0 0 auto', borderRadius: 8, border: 'none', background: 'transparent',
  cursor: 'pointer', display: 'grid', placeItems: 'center',
}
const newsText: CSSProperties = {
  margin: 0, fontSize: 12.5, color: 'var(--spira-ink)', lineHeight: 1.35,
}
/** El recorte por renglones (`line-clamp`) en vez de un alto fijo: así el corte cae
    siempre entre líneas y no parte una a la mitad, y el "…" lo pone el navegador. */
const newsTextClipped: CSSProperties = {
  ...newsText,
  display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: NEWS_LINES,
  overflow: 'hidden',
}
/** "Seguir leyendo": deliberadamente MÁS discreto que el "Ver más antiguas" de la
    barra (gris en vez del acento). Se repite una vez por novedad, y tres o cuatro
    textos con el color del módulo en una lista de 288px convierten el acento en
    decoración — que es justo lo que no hace en esta app. */
const readMoreBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, padding: 0,
  border: 'none', background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 11.5,
  color: 'var(--spira-muted)',
}
const verBadge: CSSProperties = {
  flex: '0 0 auto', fontSize: 10.5, fontWeight: 500, color: 'var(--spira-muted)',
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 6,
  padding: '1px 6px', whiteSpace: 'nowrap',
}
/** Botón de plegado de novedades: texto discreto tintado con el acento, a la derecha
    del rótulo de la sección. */
function moreNewsBtn(accent: string): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5, flex: '0 0 auto', padding: 0,
    border: 'none', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap',
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12, color: accent,
  }
}
const feedbackBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 38,
  border: '1px solid var(--spira-line-2)', borderRadius: 10, background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
}
