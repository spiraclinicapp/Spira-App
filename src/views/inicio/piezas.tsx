import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { btnOutline } from '../../components/buttons'
import type { IconName } from '../../components/Icon'

/**
 * Las piezas de Inicio › Resumen, del handoff `docs/design_handoff_resumen/`.
 *
 * Medidas, radios y copy salen del README de ese bundle; los colores salen de `tokens.css` y NO se
 * re-declaran hex, que es lo que el propio handoff pide cuando el codebase ya tiene los tokens.
 */

const display = 'var(--spira-font-display)'

/* ────────────────────────────────────────────────────────────────────────────
   A — Banda de saludo
   ──────────────────────────────────────────────────────────────────────────── */

/** Una cifra de la banda: número grande sobre papel, rótulo debajo. */
function CifraHero({ n, rotulo, tono }: { n: ReactNode; rotulo: ReactNode; tono?: string }) {
  return (
    <div>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: 44, letterSpacing: '-0.035em', lineHeight: 1, color: tono, fontVariantNumeric: 'tabular-nums' }}>
        {n}
      </div>
      <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 6 }}>{rotulo}</div>
    </div>
  )
}

/**
 * La banda de saludo. El gradiente va de `primary` a `primary-deep` con texto `on-accent`; los dos
 * tonos son FIJOS en ambos temas, así que la banda se ve igual en claro y en oscuro — es a
 * propósito, es la única superficie de marca plena de la pantalla.
 *
 * La píldora de evento no se pinta si hoy no hay evento: es condicional por naturaleza, no un
 * hueco. Ver `saludo.ts` para la regla de qué frase y qué evento tocan.
 */
export function BandaSaludo({
  fecha, saludo, frase, evento, cifras,
}: {
  fecha: string
  saludo: string
  frase: string
  evento: string | null
  cifras: { n: ReactNode; rotulo: ReactNode; tono?: string }[]
}) {
  return (
    <div
      style={{
        borderRadius: 18, padding: '26px 28px',
        background: 'linear-gradient(140deg, var(--spira-primary), var(--spira-primary-deep))',
        color: 'var(--spira-on-accent)', display: 'flex', alignItems: 'center', gap: 32,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* `opacity: .8` y no el .7 del mock: medido con la fórmula de WCAG sobre el extremo claro
            del gradiente, .7 da 4.13:1 y .8 da 4.9:1. Son 10.5px, o sea texto NORMAL para WCAG
            (el umbral de "grande" arranca en 18.66px bold), así que el mínimo es 4.5. */}
        <div style={{ fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, opacity: 0.8 }}>
          {fecha}
        </div>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 30, letterSpacing: '-0.025em', marginTop: 9, lineHeight: 1.1 }}>
          {saludo}
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.5, marginTop: 9, opacity: 0.9, maxWidth: 460 }}>{frase}</div>
        {evento && (
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 9, marginTop: 13,
              padding: '7px 13px 7px 10px', borderRadius: 'var(--spira-radius-pill)',
              background: 'rgba(244,241,234,.14)', border: '1px solid rgba(244,241,234,.22)',
            }}
          >
            <Icon name="gift" size={15} color="#F0E4C9" stroke={1.9} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{evento}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 26, paddingLeft: 32, borderLeft: '1px solid rgba(244,241,234,.22)' }}>
        {cifras.map((c, i) => <CifraHero key={i} {...c} />)}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   B — Card de la Fundación
   ──────────────────────────────────────────────────────────────────────────── */

const cardBase: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16,
}

/**
 * Identidad institucional + los números de la clínica.
 *
 * Las CREDENCIALES (+20 años, +120 estudios…) son copy institucional, no dato calculado: salen del
 * sitio de la Fundación y el handoff pide confirmarlas antes de producción. Van como constante y
 * declaradas como tal, no disfrazadas de métrica.
 *
 * Los NÚMEROS de abajo sí son reales y se calculan sobre los últimos 30 días. El handoff decidió
 * NO rotularlos con el período: si hace falta comunicarlo, va en tooltip.
 */
export function CardFundacion({
  credenciales, numeros,
}: {
  credenciales: { cifra: string; rotulo: string }[]
  numeros: { cifra: ReactNode; rotulo: string; tono?: string }[]
}) {
  return (
    <div style={{ ...cardBase, padding: '20px 22px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <img src="/fundacion-mark.png" alt="" style={{ height: 48, width: 'auto', display: 'block' }} />
          <div>
            <div style={{ fontFamily: display, fontWeight: 700, fontSize: 17.5, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Fundación Scherbovsky
            </div>
            <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 3 }}>un cambio de aire</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 250, paddingLeft: 22, borderLeft: '1px solid var(--spira-line)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)', whiteSpace: 'nowrap' }}>
            Centro de investigación médica
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', marginTop: 3, whiteSpace: 'nowrap' }}>
            Líder en ensayos clínicos en el país
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 1 }}>
          {credenciales.map((c) => (
            <div key={c.rotulo}>
              <div style={{ fontFamily: display, fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', lineHeight: 1 }}>{c.cifra}</div>
              <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 4 }}>{c.rotulo}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--spira-line)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          {numeros.map((n, i) => (
            <div
              key={n.rotulo}
              style={{
                padding: i === 0 ? '0 18px 0 0' : i === numeros.length - 1 ? '0 0 0 18px' : '0 18px',
                borderLeft: i === 0 ? undefined : '1px solid var(--spira-line)',
              }}
            >
              <div style={{ fontFamily: display, fontWeight: 700, fontSize: 26, letterSpacing: '-0.025em', lineHeight: 1, color: n.tono, fontVariantNumeric: 'tabular-nums' }}>
                {n.cifra}
              </div>
              <div style={{ fontSize: 12, color: 'var(--spira-ink-soft)', marginTop: 5 }}>{n.rotulo}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   C — Card de módulo
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Un módulo operativo, con sus tres cifras. La card entera entra al módulo.
 *
 * ⚠️ LA BARRA DE 5px SE FUE — decisión del Director (2026-09-09), que revierte la del 2026-08-18.
 * No la repongas "para que se note el módulo": la venía pidiendo el handoff del 17/08/2026 y era
 * la única excepción viva a una regla explícita del sistema. Ahora la excepción no existe y las
 * tres razones que ya la hacían frágil quedan del lado del sistema:
 *
 * 1. `DESIGN.md` prohíbe la franja de color lateral en cards ("Don't usar `border-left`/
 *    `border-right` de color como franja de acento"); el código vuelve a coincidir con el sistema.
 * 2. En tema OSCURO nunca llegó al contraste de elementos gráficos: medido sobre la card `#212121`
 *    daba 2.14:1 en Farmacia y 3.3:1 en Coordinación, contra un umbral de 3.0. La de Farmacia era
 *    prácticamente invisible, porque `--spira-pharma` es el mismo hex en los dos temas.
 * 3. Era redundante: el módulo ya lo dicen el chip del ícono, que sigue teñido con el acento, y el
 *    nombre. Sacarla no le quita ninguna información a la card.
 *
 * Con la barra afuera el padding interno queda parejo (21px de los dos lados, antes eran 26 a la
 * izquierda por los 5 de la franja).
 */
export function CardModulo({
  nombre, bajada, icono, acento, chipFondo, cifras, onClick,
}: {
  nombre: string
  bajada: string
  icono: IconName
  acento: string
  chipFondo: string
  cifras: { n: ReactNode; rotulo: string; tono?: string }[]
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="spira-card-link"
      onClick={onClick}
      aria-label={`Entrar a ${nombre}`}
      style={{ ...cardBase, overflow: 'hidden', display: 'flex', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--spira-font-text)', color: 'var(--spira-ink)' }}
    >
      <span style={{ flex: 1, minWidth: 0, padding: '19px 21px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: chipFondo, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
            <Icon name={icono} size={20} color={acento} stroke={2} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: display, fontWeight: 700, fontSize: 17.5 }}>{nombre}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--spira-ink-soft)', marginTop: 2 }}>{bajada}</span>
          </span>
          <Icon name="arrowRight" size={17} color="var(--spira-faint)" />
        </span>
        <span style={{ display: 'flex', gap: 26, marginTop: 17 }}>
          {cifras.map((c) => (
            <span key={c.rotulo}>
              <span style={{ display: 'block', fontFamily: display, fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em', lineHeight: 1, color: c.tono, fontVariantNumeric: 'tabular-nums' }}>
                {c.n}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--spira-ink-soft)', marginTop: 4 }}>{c.rotulo}</span>
            </span>
          ))}
        </span>
      </span>
    </button>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   D — Card de Novedades
   ──────────────────────────────────────────────────────────────────────────── */

export interface Novedad {
  /** Etiqueta de la izquierda: "Producto · v0.38" o "Clínica"/"Equipo". */
  etiqueta: string
  titulo: string
  /** Solo la destacada la trae. */
  bajada?: string
  tono?: string
}

/**
 * Novedades, alimentado por el changelog real de `lib/version.ts`.
 *
 * SIN PORTADA y SIN el toggle de "Resumen del lunes por mail" del mock: la portada es un
 * placeholder declarado en el propio handoff, y el toggle prendería un envío de mail que no
 * existe. Un interruptor que no hace nada es un botón que finge acción; se repone cuando haya
 * imagen y envío de verdad.
 *
 * Las novedades tampoco traen fecha: el changelog guarda versión y texto, no cuándo salió. Antes
 * que inventar un "hace 2 días", no se muestra.
 *
 * LA COLUMNA LLEGA HASTA EL PIE DE LAS CARDS DE MÓDULO — pedido del Director (2026-09-09): el
 * Resumen tiene que cerrar como un rectángulo, sin la columna derecha colgando a media altura. La
 * card ocupa todo el alto de su celda (la grilla de `InicioResumenView` la estira) y se reparte en
 * tres: cabecera fija, lista que CEDE y bloque de feedback al pie. Que la lista sea la que cede
 * —`flex: 1` + `minHeight: 0` + scroll propio— es lo que garantiza el límite: si algún día entran
 * más novedades, scrollean adentro en vez de empujar el pie fuera del cuadro. Sin `minHeight: 0`
 * un hijo flex se niega a achicarse por debajo de su contenido y el `overflow: hidden` del radio
 * se come el bloque de abajo (la misma trampa que documenta `.spira-notif-lista` en tokens.css).
 */
export function CardNovedades({ destacada, secundarias, onVerTodas, onFeedback }: {
  destacada: Novedad | null
  secundarias: Novedad[]
  onVerTodas: () => void
  /** Abre el modal "Dar feedback" del shell. Sin handler, el bloque del pie no se dibuja: un
   *  botón que no puede abrir nada es un botón que finge acción. */
  onFeedback?: () => void
}) {
  return (
    <div style={{ ...cardBase, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '15px 18px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: display, fontWeight: 700, fontSize: 16 }}>Novedades</span>
        <button
          type="button"
          onClick={onVerTodas}
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-track)' }}
        >
          Ver todas
        </button>
      </div>

      <div className="spira-scroll" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', paddingBottom: 14 }}>
        {destacada && (
          <div style={{ padding: '14px 18px 0' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--spira-radius-pill)', fontSize: 10.5, fontWeight: 700, background: 'rgba(15,95,87,.10)', color: 'var(--spira-acc-deep-track)' }}>
              {destacada.etiqueta}
            </span>
            <div style={{ fontFamily: display, fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', marginTop: 9 }}>
              {destacada.titulo}
            </div>
            {destacada.bajada && (
              <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--spira-ink-soft)', marginTop: 5 }}>{destacada.bajada}</div>
            )}
          </div>
        )}

        {secundarias.map((n, i) => (
          <div key={i} style={{ padding: '14px 18px 0', marginTop: 15, borderTop: '1px solid var(--spira-line)' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: n.tono ?? 'var(--spira-muted)' }}>{n.etiqueta}</span>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 5, color: 'var(--spira-ink-2)' }}>{n.titulo}</div>
          </div>
        ))}
      </div>

      {onFeedback && <BloqueFeedback onFeedback={onFeedback} />}
    </div>
  )
}

/**
 * El pie de Novedades: la invitación a escribirnos.
 *
 * NO es un formulario nuevo. Abre el MISMO modal "Dar feedback" que el pie del popover Acerca de
 * —tipo + mensaje + contexto autoadjuntado, enviado por el RPC `submit_feedback`—, así que lo que
 * se escribe acá queda registrado igual que siempre y no hay dos caminos que mantener. Lo que
 * agrega es el lugar: hasta ahora había que saber que el feedback vivía adentro de un popover del
 * riel, y nadie lo sabía.
 *
 * Va sobre `surface` y no sobre la card blanca para que se lea como una zona aparte de las
 * novedades sin necesidad de una línea de color: en oscuro, `surface` es un escalón más ABAJO que
 * la card, así que el bloque se hunde en vez de brillar.
 *
 * Es UNA tarjeta-enlace (`.spira-card-link`) y no un título con un botón debajo, por una razón
 * medida: en la notebook de referencia (1536×864) el panel tiene 499px y las novedades ya se
 * comen 328; la versión con botón aparte pedía 162 de alto y dejaba la lista 28px corta, o sea
 * estrenaba la pantalla con una barra de scroll y la última novedad cortada. Ésta pide 108 y deja
 * ~30 de aire. Además habla el mismo idioma que las cards de módulo que tiene al lado —chip con
 * ícono + título + bajada, la card entera es el botón—, así que se entiende que se toca sin
 * necesidad de explicarlo.
 */
function BloqueFeedback({ onFeedback }: { onFeedback: () => void }) {
  return (
    <div style={{ borderTop: '1px solid var(--spira-line)', background: 'var(--spira-surface)', padding: '14px 16px 15px' }}>
      <button
        type="button"
        className="spira-card-link"
        onClick={onFeedback}
        style={{
          ...btnOutline, height: 'auto', width: '100%', padding: '11px 13px', textAlign: 'left',
          display: 'flex', alignItems: 'flex-start', gap: 11, fontWeight: 400, fontSize: 12,
        }}
      >
        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(15,95,87,.10)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
          <Icon name="message" size={16} color="var(--spira-acc-deep-track)" stroke={1.9} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: display, fontWeight: 700, fontSize: 13.5, letterSpacing: '-0.01em' }}>
            ¿Se te ocurre una mejora?
          </span>
          <span style={{ display: 'block', fontSize: 12, lineHeight: 1.45, color: 'var(--spira-ink-soft)', marginTop: 3 }}>
            Contanos qué mejorarías: nos ayuda a seguir mejorando y a facilitar lo que crean necesario.
          </span>
        </span>
      </button>
    </div>
  )
}
