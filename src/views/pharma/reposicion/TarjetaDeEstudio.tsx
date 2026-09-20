import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import type { EstudioReposicion, TarjetaEstudio } from '../../../data/pharma'
import { Envases, Pastilla, PuntoEstado } from './piezas'

const caja: CSSProperties = {
  background: 'var(--spira-white)', borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
  display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', font: 'inherit', color: 'inherit',
}

/**
 * La tarjeta de un estudio en la grilla (R2): la de Pacientes (`ProtocolsView`) con la parte de abajo
 * cambiada. QUÉ dice lo decide `tarjetaDe` (con tests); acá se dibuja. Sin medicación de base no se entra
 * (RD16): es un `div`, no un botón, y no lleva la flecha.
 */
export function TarjetaDeEstudio({ e, t, accent, onAbrir }: {
  e: EstudioReposicion
  t: TarjetaEstudio
  accent: string
  onAbrir: () => void
}) {
  const contenido = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.01em', color: accent }}>{e.estudio.code}</span>
        <PuntoEstado status={e.estudio.status} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.estudio.name}</div>
      <div style={{ height: 1, background: 'var(--spira-line)', margin: '5px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 30 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0, flexWrap: 'wrap' }}><Principal t={t} accent={accent} /></div>
        {t.clicable && <Icon name="chevronRight" size={18} color="var(--spira-faint)" />}
      </div>
      {t.detalle.length > 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', marginTop: -4 }}>
          {t.detalle.map((d, i) => (
            <span key={d.texto}>
              {i > 0 && ' · '}
              <span style={d.aviso ? { color: 'var(--spira-acc-deep-warn)', fontWeight: 600 } : undefined}>{d.texto}</span>
            </span>
          ))}
        </div>
      )}
      {t.renglones.map((r) => (
        <div key={r.texto} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12.5, color: r.mudo ? 'var(--spira-muted)' : 'var(--spira-ink)' }}>
          <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="truck" size={14} color={r.mudo ? 'var(--spira-faint)' : accent} /></span>
          <span style={{ minWidth: 0 }}>{r.texto}</span>
        </div>
      ))}
    </>
  )
  if (!t.clicable) return <div style={{ ...caja, border: '1px solid var(--spira-line)' }}>{contenido}</div>
  return (
    <button type="button" className="spira-card-link" onClick={onAbrir} style={caja} aria-label={`${e.estudio.code} ${e.estudio.name}: abrir la reposición del estudio`}>
      {contenido}
    </button>
  )
}

function Principal({ t, accent }: { t: TarjetaEstudio; accent: string }) {
  const p = t.principal
  switch (p.tipo) {
    case 'comprar':
      return (
        <>
          <Envases n={p.envases} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>para comprar</span>
        </>
      )
    case 'cubierto':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--spira-acc-deep-good)' }}><Icon name="check" size={16} stroke={2} />Cubierto</span>
    case 'falta_cargar':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--spira-acc-deep-warn)' }}><Icon name="pencil" size={15} stroke={1.9} />Falta cargar cómo se repone</span>
    case 'sin_medicacion':
      return <span style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Sin medicación para reponer</span>
    case 'sin_cuenta':
      return <span style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Sin cuenta para este período</span>
    case 'pedido':
      return (
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>
            <Icon name="truck" size={16} color={accent} />Pedido Nº {p.numero}
          </span>
          <Pastilla p={p.pastilla} />
        </>
      )
  }
}
