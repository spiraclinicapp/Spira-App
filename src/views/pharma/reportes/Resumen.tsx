import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { formatNumberAR, sharePct } from '../../../lib/numbers'
import { formatDateTimeAR } from '../../../lib/dates'
import type { Consistencia, Totales } from './agregados'
import { bigNumber, card, cardFooter, eyebrow, printBtn, unidadSufijo } from './estilos'

/**
 * El resumen del período: tres tarjetas hero, la tira de seis indicadores y la línea que dice si
 * los números cierran.
 *
 * DOS COSAS QUE NO SON DEL HANDOFF Y SÍ DE LA REVISIÓN:
 *
 * 1 · La tira va ORDENADA POR SEMÁNTICA: primero los cuatro indicadores neutros, después los dos
 *     que piden acción. En el handoff estaban intercalados y las dos alertas se perdían entre las
 *     otras cuatro, porque el ojo escanea la fila entera como una sola cosa.
 *
 * 2 · La LÍNEA DE CONSISTENCIA al pie. El paso de mayor ansiedad del recorrido es mirar si los
 *     números cierran antes de imprimir, y el handoff no tenía nada ahí. La cuenta ya existe
 *     —`invariantes()` se escribe igual para los tests—, así que mostrarla cuesta un string. Si
 *     algo no cuadra, lo dice y la pantalla bloquea la impresión: una hoja que se firma con
 *     números que no cierran es peor que no tener hoja.
 */

export interface IndicadorTira {
  label: string
  valor: string
  sufijo?: string
  /** Segunda línea, para los indicadores que nombran algo ("Empagliflozina 25 mg"). */
  detalle?: string
  /** El valor mismo comunica un umbral: se tiñe. Neutro por defecto. */
  tono?: 'warn' | 'danger'
  /** Clave del reporte que imprime este indicador. */
  reporte: string
}

export function Resumen({
  totales, ingresos, indicadores, consistencia, emitidoEn, sparkline, onImprimir,
}: {
  totales: Totales
  ingresos: { unidades: number; recepciones: number }
  indicadores: IndicadorTira[]
  consistencia: Consistencia
  emitidoEn: string
  /** Serie ya normalizada 0..1 para el sparkline de dispensadas. */
  sparkline: number[]
  onImprimir: (clave: string) => void
}) {
  const balance = ingresos.unidades - totales.unidades
  const promedioDiario = totales.dispensaciones === 0 ? 0 : totales.unidades / totales.dispensaciones

  return (
    <>
      <div style={heroGrid}>
        <Hero
          label="Unidades dispensadas"
          valor={formatNumberAR(totales.unidades)}
          sufijo="u."
          reporte="dispensadas"
          onImprimir={onImprimir}
          extra={<Sparkline valores={sparkline} />}
          pie={`${formatNumberAR(totales.dispensaciones)} dispensaciones · ${formatNumberAR(promedioDiario)} u. por dispensación`}
        />

        <Hero
          label="Unidades ingresadas"
          valor={formatNumberAR(ingresos.unidades)}
          sufijo="u."
          reporte="ingresadas"
          onImprimir={onImprimir}
          pie={`${formatNumberAR(ingresos.recepciones)} recepciones verificadas`}
        />

        <Hero
          label="Balance del período"
          valor={(balance >= 0 ? '+' : '') + formatNumberAR(balance)}
          sufijo="u. de saldo"
          color={balance >= 0 ? 'var(--spira-good)' : 'var(--spira-danger)'}
          reporte="balance"
          onImprimir={onImprimir}
          extra={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
              <BarraBalance label="Ingresadas" valor={ingresos.unidades} max={Math.max(ingresos.unidades, totales.unidades)} color="var(--spira-good)" />
              <BarraBalance label="Dispensadas" valor={totales.unidades} max={Math.max(ingresos.unidades, totales.unidades)} color="var(--spira-pharma-solid)" />
            </div>
          }
          /* El balance es SÓLO de unidades. Los kits del producto de investigación son otra
             magnitud y restarlos de unidades daría un número sin significado. */
          pie="Sólo unidades. El producto de investigación se mide en kits y va aparte."
        />
      </div>

      <div style={tiraGrid}>
        {indicadores.map((ind) => (
          <div key={ind.label} style={celda}>
            <div style={{ flex: 1, fontSize: 12.5, color: 'var(--spira-ink-soft)', lineHeight: 1.35, paddingRight: 18 }}>
              {ind.label}
            </div>
            <div style={{ textAlign: 'right', paddingRight: 34 }}>
              <div style={{
                fontFamily: 'var(--spira-font-display)', fontSize: ind.detalle ? 14.5 : 21,
                fontWeight: 700, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums',
                color: ind.tono === 'warn' ? 'var(--spira-acc-deep-warn)'
                  : ind.tono === 'danger' ? 'var(--spira-danger)' : undefined,
              }}>
                {ind.valor}
                {ind.sufijo && <span style={{ ...unidadSufijo, fontSize: 12 }}>{ind.sufijo}</span>}
              </div>
              {ind.detalle && (
                <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {ind.detalle}
                </div>
              )}
            </div>
            <BotonImprimir clave={ind.reporte} que={ind.label} onImprimir={onImprimir} absoluto />
          </div>
        ))}
      </div>

      <LineaConsistencia
        consistencia={consistencia}
        totales={totales}
        emitidoEn={emitidoEn}
      />
    </>
  )
}

/* ── La línea que dice si los números cierran ────────────────────────────────── */

function LineaConsistencia({ consistencia, totales, emitidoEn }: {
  consistencia: Consistencia
  totales: Totales
  emitidoEn: string
}) {
  const ok = consistencia.ok
  return (
    <p style={{
      display: 'flex', alignItems: 'flex-start', gap: 9,
      margin: '12px 0 0', padding: '11px 14px',
      background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 10,
      fontSize: 12.5, lineHeight: 1.5, color: ok ? 'var(--spira-ink-soft)' : 'var(--spira-acc-deep-danger)',
    }}>
      <span style={{ flex: '0 0 15px', marginTop: 1, color: ok ? 'var(--spira-acc-deep-good)' : 'var(--spira-acc-deep-danger)' }}>
        <Icon name={ok ? 'check' : 'alert'} size={15} stroke={1.9} />
      </span>
      {ok ? (
        <span>
          <b style={{ color: 'var(--spira-ink-2)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {formatNumberAR(totales.unidades)} u.
          </b>{' '}
          en{' '}
          <b style={{ color: 'var(--spira-ink-2)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {formatNumberAR(totales.dispensaciones)}
          </b>{' '}
          dispensaciones. La serie diaria y las tablas coinciden con este total.
          Emitido el <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDateTimeAR(emitidoEn)}</span>.
        </span>
      ) : (
        <span>
          <b style={{ fontWeight: 600 }}>Los números del informe no cierran entre sí.</b>{' '}
          {consistencia.problemas.join('; ')}. La impresión está bloqueada: avisale al equipo
          técnico antes de usar estos datos.
        </span>
      )}
    </p>
  )
}

/* ── Piezas ──────────────────────────────────────────────────────────────────── */

function Hero({ label, valor, sufijo, color, pie, extra, reporte, onImprimir }: {
  label: string
  valor: string
  sufijo?: string
  color?: string
  pie: string
  extra?: ReactNode
  reporte: string
  onImprimir: (clave: string) => void
}) {
  return (
    <div style={{ ...card, padding: '16px 18px 14px', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
      <BotonImprimir clave={reporte} que={label} onImprimir={onImprimir} absoluto />
      <div style={eyebrow}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
        <div style={{ ...bigNumber, color }}>
          {valor}
          {sufijo && <span style={unidadSufijo}>{sufijo}</span>}
        </div>
        {extra}
      </div>
      <div style={cardFooter}>{pie}</div>
    </div>
  )
}

function BarraBalance({ label, valor, max, color }: { label: string; valor: number; max: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
      <span style={{ width: 86, fontSize: 11.5, color: 'var(--spira-ink-soft)' }}>{label}</span>
      <span style={{ flex: 1, minWidth: 70, height: 10, background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 999, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${sharePct(valor, max)}%`, background: color }} />
      </span>
      <span style={{ width: 52, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {formatNumberAR(valor)}
      </span>
    </div>
  )
}

/**
 * Sparkline de área. SVG a mano y no una librería: el repo tiene cuatro dependencias y ninguna de
 * gráficos, y esto es un `path` de nueve puntos.
 */
function Sparkline({ valores }: { valores: number[] }) {
  if (valores.length < 2) return null
  const max = Math.max(...valores, 1)
  const paso = 120 / (valores.length - 1)
  const puntos = valores.map((v, i) => `${i * paso} ${30 - (v / max) * 26}`)
  const linea = `M${puntos.join(' L')}`
  return (
    <svg viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true" style={{ flex: 1, minWidth: 84, height: 34 }}>
      <path d={`${linea} L120 34 L0 34 Z`} fill="rgba(15,95,87,0.13)" />
      <path d={linea} fill="none" stroke="var(--spira-primary)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/**
 * El botón de impresión de un bloque.
 *
 * `aria-label` propio y no `title="Imprimir"`: hay nueve en la pantalla y con el genérico un
 * lector de pantalla los lee todos igual, sin manera de saber cuál imprime qué.
 */
export function BotonImprimir({ clave, que, onImprimir, absoluto }: {
  clave: string
  que: string
  onImprimir: (clave: string) => void
  absoluto?: boolean
}) {
  return (
    <button
      type="button"
      className="spira-card-link"
      onClick={() => onImprimir(clave)}
      aria-label={`Imprimir ${que.toLowerCase()}`}
      title={`Imprimir ${que.toLowerCase()}`}
      style={absoluto
        ? { ...printBtn, position: 'absolute', top: 11, right: 11 }
        : printBtn}
    >
      <Icon name="printer" size={14} stroke={1.8} />
    </button>
  )
}

/* ── Estilos locales ─────────────────────────────────────────────────────────── */

const heroGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }

/** El truco del hairline: fondo de línea + gap de 1px + overflow hidden, sin bordes por celda. */
const tiraGrid: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1,
  background: 'var(--spira-line)', border: '1px solid var(--spira-line)',
  borderRadius: 16, overflow: 'hidden', marginTop: 12,
}

const celda: CSSProperties = {
  background: 'var(--spira-white)', padding: '13px 16px', minHeight: 68,
  display: 'flex', alignItems: 'center', gap: 14, position: 'relative',
}
