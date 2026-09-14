import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { DANGER_TINT, WARN_TINT_AVISO, btnChico } from './panelDispensacion'
import type { AvisoRojo } from './avisoReciente'
import type { SaldoCaja } from './saldoModel'
import { textoSaldo } from './saldoModel'

/** La consulta de `contexto_dispensacion`, entera: los avisos cubren carga y error, no sólo el dato. */
export interface ContextoQuery {
  loading: boolean
  error: string | null
}

const caja: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 11,
  fontSize: 12.5, marginBottom: 12,
}
const titulo: CSSProperties = { display: 'block', fontWeight: 600, color: 'var(--spira-ink)' }
const detalle: CSSProperties = { display: 'block', color: 'var(--spira-ink-soft)', marginTop: 2, lineHeight: 1.4 }

/**
 * Los avisos de arriba de la tarjeta de Dispensación (plan D14, D21, D24, D25, R9): lo que frena la
 * mano ANTES de cargar nada. Primero el rojo, después los saldos (D25: «el rojo va primero»).
 *
 * Reemplaza a `AvisoReciente`, que decía «Última dispensación hace N días» sin nombrar la droga y sin
 * mirar otros protocolos. Las reglas viven en `avisoReciente.ts` y `saldoModel.ts`; acá sólo se dibuja.
 *
 * NUNCA SE CALLA. Mientras la consulta vuelve, si hay algo elegido, se dice que se está comprobando;
 * si falla, una caja ámbar lo dice. Un silencio acá se lee como «no hubo entregas», que es justo el
 * falso negativo que el aviso existe para evitar.
 */
export function AvisosDeEntrega({ query, rojo, saldos, hayElegido, readOnly, accent, onPedirSaldo }: {
  query: ContextoQuery
  rojo: AvisoRojo | null
  saldos: readonly SaldoCaja[]
  /** Hay un medicamento elegido (en el desplegable o sumado sin mandar). */
  hayElegido: boolean
  readOnly: boolean
  accent: string
  onPedirSaldo: (s: SaldoCaja) => void
}) {
  if (query.loading) {
    if (!hayElegido) return null
    return (
      <div style={{ ...caja, alignItems: 'center', background: 'var(--spira-white)', border: '1px solid var(--spira-line)' }}>
        <Icon name="clock" size={15} color="var(--spira-muted)" style={{ flex: '0 0 auto' }} />
        <span style={{ color: 'var(--spira-muted)' }}>Comprobando entregas recientes…</span>
      </div>
    )
  }

  if (query.error) {
    return (
      <div style={{ ...caja, background: WARN_TINT_AVISO, border: '1px solid transparent' }}>
        <Icon name="alert" size={15} color="var(--spira-warn)" style={{ flex: '0 0 auto', marginTop: 1 }} />
        <span>
          <span style={titulo}>
            {hayElegido
              ? 'No se pudo comprobar si recibió esta droga hace poco'
              : 'No se pudo comprobar las entregas recientes ni los saldos'}
          </span>
          <span style={detalle}>Revisá el historial antes de pedir.</span>
        </span>
      </div>
    )
  }

  return (
    <>
      {rojo && (
        // `role="status"`: se anuncia sin interrumpir, porque nunca bloquea.
        <div role="status" style={{ ...caja, background: DANGER_TINT, border: '1px solid transparent' }}>
          <Icon name="alert" size={15} color="var(--spira-danger)" style={{ flex: '0 0 auto', marginTop: 1 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            {/* El título en el rojo PROFUNDO: 4,97:1 sobre el tinte. El `--spira-danger` del mock no
                llega a AA a este tamaño. */}
            <span style={{ ...titulo, color: 'var(--spira-acc-deep-danger)' }}>{rojo.titulo}</span>
            {rojo.lineas.map((l) => <span key={l} style={detalle}>{l}</span>)}
          </span>
        </div>
      )}

      {saldos.map((s) => {
        const t = textoSaldo(s)
        return (
          // Sobre papel blanco: un saldo es información, no alarma. El color es para el rojo.
          <div key={s.itemId} style={{ ...caja, alignItems: 'center', flexWrap: 'wrap', rowGap: 8, background: 'var(--spira-white)', border: '1px solid var(--spira-line)' }}>
            <Icon name="info" size={15} color={accent} style={{ flex: '0 0 auto' }} />
            <span style={{ flex: '1 1 200px', minWidth: 0 }}>
              <span style={titulo}>{t.titulo}</span>
              <span style={detalle}>{t.detalle}</span>
            </span>
            {!readOnly && s.estado === 'pedible' && (
              <button type="button" style={btnChico} onClick={() => onPedirSaldo(s)} aria-label={`Pedir el saldo de ${s.nombre}`}>
                Pedir el saldo
              </button>
            )}
            {s.estado === 'no_habilitado' && (
              <span style={{ flex: '0 0 auto', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)' }}>
                Ya no está habilitada
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}

/**
 * El aviso del producto en investigación, adentro de la excepción fuera de cronograma (R11): la
 * última entrega de IP del enrolamiento en 30 días, en ámbar. Mismos estados de carga y error.
 */
export function AvisoIpReciente({ query, aviso }: { query: ContextoQuery; aviso: AvisoRojo | null }) {
  if (query.loading) {
    return (
      <div style={{ ...caja, alignItems: 'center', marginBottom: 9, background: 'var(--spira-white)', border: '1px solid var(--spira-line)' }}>
        <Icon name="clock" size={15} color="var(--spira-muted)" style={{ flex: '0 0 auto' }} />
        <span style={{ color: 'var(--spira-muted)' }}>Comprobando entregas recientes…</span>
      </div>
    )
  }
  if (query.error || aviso) {
    return (
      <div style={{ ...caja, marginBottom: 9, background: WARN_TINT_AVISO, border: '1px solid transparent' }}>
        <Icon name="alert" size={15} color="var(--spira-warn)" style={{ flex: '0 0 auto', marginTop: 1 }} />
        <span>
          <span style={titulo}>
            {aviso ? aviso.titulo : 'No se pudo comprobar si recibió producto en investigación hace poco'}
          </span>
          {aviso
            ? aviso.lineas.map((l) => <span key={l} style={detalle}>{l}</span>)
            : <span style={detalle}>Revisá el historial antes de pedir.</span>}
        </span>
      </div>
    )
  }
  return null
}
