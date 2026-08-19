import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
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
 * ⚠️ La barra de acento de 5px a la izquierda viene del handoff (17/08/2026) y CHOCA con
 * `DESIGN.md`, que prohíbe la franja de color lateral en cards. Se implementa como pide el mock
 * porque es la decisión de diseño más reciente y explícita; si el Director prefiere sostener la
 * regla del sistema, se saca de acá y el acento queda solo en el chip del ícono.
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
      <span style={{ width: 5, flex: '0 0 5px', background: acento }} />
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
 */
export function CardNovedades({ destacada, secundarias, onVerTodas }: {
  destacada: Novedad | null
  secundarias: Novedad[]
  onVerTodas: () => void
}) {
  return (
    <div style={{ ...cardBase, overflow: 'hidden' }}>
      <div style={{ padding: '15px 18px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: display, fontWeight: 700, fontSize: 16 }}>Novedades</span>
        <button
          type="button"
          onClick={onVerTodas}
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-primary)' }}
        >
          Ver todas
        </button>
      </div>

      {destacada && (
        <div style={{ padding: '14px 18px 0' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--spira-radius-pill)', fontSize: 10.5, fontWeight: 700, background: 'rgba(15,95,87,.10)', color: 'var(--spira-primary)' }}>
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

      <div style={{ height: 18 }} />
    </div>
  )
}
