import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'
import type { ClavePastilla, EstudioInsumo, PastillaPedido } from '../../../data/pharma'
import { protocolStatusLabel, protocolStatusVar } from '../../protocolStatus'
import { card } from '../reportes/estilos'

/**
 * Piezas chicas del submódulo Reposición, con los valores del mock
 * (docs/design_handoff_reposicion_submodulo/generar-artboards.mjs). Viven juntas porque las usan la
 * grilla, el estudio, los modales y la Recepción: repetirlas era garantizar que se separen.
 */

/**
 * Botón chico con borde: «Ver», «Reimprimir», «No va a llegar», «Reabrir», «Cargar» (RD16). Va con
 * `className="spira-card-link"`, que le pone el borde y el realce: acá NO va `border`, que le ganaría a la
 * clase por especificidad y dejaría el hover sin efecto.
 */
export const botonChico: CSSProperties = {
  height: 32, borderRadius: 10, background: 'var(--spira-white)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)',
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 11px', flex: '0 0 auto', whiteSpace: 'nowrap',
}

/**
 * La acción de la fila del estudio: 38 de alto, como las de la cabecera del shell. Sólida o con borde, y el
 * borde SIEMPRE en longhands: el mismo botón pasa de «Armar pedido» (sólido) a «Armar otro pedido» (con
 * borde) sin desmontarse, y mezclar la abreviada con longhands lo dejaría sin borde.
 */
export function botonAccion(primario: boolean, accentSolid: string): CSSProperties {
  return {
    height: 38, padding: '0 15px', borderRadius: 10, borderWidth: 1, borderStyle: 'solid',
    borderColor: primario ? accentSolid : 'var(--spira-line-2)',
    background: primario ? accentSolid : 'var(--spira-white)',
    color: primario ? 'var(--spira-on-accent)' : 'var(--spira-ink)',
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', flex: '0 0 auto',
  }
}

export const errorTexto: CSSProperties = {
  fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)',
  borderRadius: 8, padding: '9px 12px', margin: 0,
}

/** La versalita de los rótulos de columna. Una sola, así las tablas del submódulo no se separan. */
export const versalita: CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)',
}
/** Rótulo de columna de la tabla del estudio (el `th` de Estadísticas, sin el borde: lo pone la fila). */
export const rotuloColumna: CSSProperties = { ...versalita, padding: '10px 16px 9px', whiteSpace: 'nowrap' }
/** Rótulo de columna de las tablas de los modales («Armar pedido», el pedido). */
export const rotuloTabla: CSSProperties = { ...versalita, padding: '0 0 8px' }

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
export const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** El estado del estudio con su punto de color, como en Pacientes (la grilla y el estudio). */
export function PuntoEstado({ status }: { status: EstudioInsumo['status'] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: protocolStatusVar(status) }} />
      {protocolStatusLabel(status)}
    </span>
  )
}

/** El número grande con su unidad («7 envases»). */
export function Envases({ n, tamano = 22 }: { n: number; tamano?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
      <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontSize: tamano, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--spira-ink)', lineHeight: 1 }}>{n}</span>
      <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 13, fontWeight: 600, color: 'var(--spira-muted)' }}>{n === 1 ? 'envase' : 'envases'}</span>
    </span>
  )
}

const TONO_PASTILLA: Record<ClavePastilla, CSSProperties> = {
  sin_recibir: { color: 'var(--spira-ink-soft)', background: 'var(--spira-surface)', borderColor: 'var(--spira-line-2)' },
  llego: { color: 'var(--spira-acc-deep-warn)', background: 'rgba(176, 130, 63, 0.14)', borderColor: 'transparent' },
  en_parte: { color: 'var(--spira-acc-deep-warn)', background: 'rgba(176, 130, 63, 0.14)', borderColor: 'transparent' },
  recibido: { color: 'var(--spira-acc-deep-good)', background: 'rgba(92, 138, 90, 0.14)', borderColor: 'transparent' },
  no_llego: { color: 'var(--spira-muted)', background: 'var(--spira-surface)', borderColor: 'var(--spira-line-2)' },
  anulado: { color: 'var(--spira-muted)', background: 'var(--spira-surface)', borderColor: 'var(--spira-line-2)' },
}

/** RD8: EL estado de un pedido, igual en toda la app. El texto va siempre; el color acompaña. */
export function Pastilla({ p }: { p: PastillaPedido }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap', borderWidth: 1, borderStyle: 'solid', ...TONO_PASTILLA[p.clave] }}>
      {p.texto}
    </span>
  )
}

/** Un aviso de una línea: ícono + frase (los de la boleta, «Armar pedido», el día de corte). */
export function AvisoLinea({ texto, tono = 'info' }: { texto: ReactNode; tono?: 'info' | 'warn' | 'danger' }) {
  const color = tono === 'warn' ? 'var(--spira-acc-deep-warn)' : tono === 'danger' ? 'var(--spira-acc-deep-danger)' : 'var(--spira-ink-soft)'
  // En `danger` el aviso es el resultado de algo que se acaba de intentar (no se pudo emitir): se anuncia,
  // igual que los `role="alert"` de los otros modales. Un aviso informativo o de atención, no.
  return (
    <div role={tono === 'danger' ? 'alert' : undefined} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', fontSize: 12.5, lineHeight: 1.45, color: tono === 'info' ? 'var(--spira-ink)' : color }}>
      <span style={{ flex: '0 0 14px', marginTop: 2 }}><Icon name={tono === 'info' ? 'info' : 'alert'} size={14} stroke={1.9} color={color} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>{texto}</span>
    </div>
  )
}

/** Un renglón de información arriba de la tabla del estudio: período cerrado, sólo lectura, pedido tarde. */
export function Informacion({ icono, children }: { icono: IconName; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 0 14px', fontSize: 13, color: 'var(--spira-ink-soft)', flexWrap: 'wrap' }}>
      <Icon name={icono} size={15} stroke={1.9} color="var(--spira-ink-soft)" />
      {children}
    </div>
  )
}

/** El estado de la pantalla en una caja (mock «Cargando y error», «Sin día de corte»). */
export function EstadoCaja({ icono, titulo, texto, peligro = false, accion }: {
  icono: IconName
  titulo: string
  texto: string
  peligro?: boolean
  accion?: ReactNode
}) {
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '22px 24px', flexWrap: 'wrap' }}>
      <span style={{ width: 52, height: 52, borderRadius: 14, background: peligro ? 'rgba(166, 72, 59, 0.10)' : 'rgba(15, 95, 87, 0.08)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
        <Icon name={icono} size={22} stroke={1.9} color={peligro ? 'var(--spira-danger)' : 'var(--spira-pharma-solid)'} />
      </span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, color: 'var(--spira-ink)' }}>{titulo}</div>
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 3, lineHeight: 1.45 }}>{texto}</div>
      </div>
      {accion}
    </div>
  )
}

/** Título de sección con su regla («Pedidos del estudio»). */
export function TituloSeccion({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 10px' }}>
      <h2 style={{ fontFamily: 'var(--spira-font-display)', fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: 'var(--spira-ink)' }}>{children}</h2>
      <div style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
    </div>
  )
}

/** Por debajo de 1024 px el libro baja a un segundo renglón y la grilla pasa a dos columnas (RD14). */
export function useAngosto(): boolean {
  const [angosto, setAngosto] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024)
  useEffect(() => {
    const alCambiar = () => setAngosto(window.innerWidth < 1024)
    window.addEventListener('resize', alCambiar)
    return () => window.removeEventListener('resize', alCambiar)
  }, [])
  return angosto
}
