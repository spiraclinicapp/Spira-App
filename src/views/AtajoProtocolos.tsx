import { useEffect, useRef } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { protocolStatusLabel, protocolStatusVar } from './protocolStatus'
import type { ProtocolStatus } from '../data/protocols'
import { avisoDeHuerfanos, estadoDelAtajo, pieDeTarjeta, pistaDelAtajo } from './reglasAtajoProtocolos'

/**
 * El atajo de tarjetas de protocolo, UNO para las dos pantallas que lo tienen: Pendientes
 * (Coordinación) y Stock (Farmacia). Eran dos copias que ya habían divergido en tres detalles —el
 * rótulo accesible, cómo se declaraba el borde, dónde vivía «Limpiar»—, y el comentario de las dos
 * pedía lo mismo: si dos pantallas ofrecen el mismo gesto, tienen que verse y portarse igual. Acá
 * vive lo que es del GESTO (cabecera, grilla, tarjeta, «Ver todos», el caso huérfano); cada pantalla
 * pone el resumen de su tarjeta, que es lo único que de verdad cambia.
 *
 * **«VER TODOS» ES UNA TARJETA MÁS, que aparece al elegir y se va al tocarla** (Director,
 * 2026-10-03). Antes la única salida visible era «× Limpiar N», en gris, debajo de toda la barra de
 * filtros, y además borraba los demás filtros. La crítica de diseño propuso ponerla en la cabecera
 * para que no moviera nada; el Director eligió la tarjeta, sabiendo el costo: cuando la última fila
 * de la grilla está llena, la tarjeta abre una fila nueva y la lista de abajo baja ese alto mientras
 * haya algo enfocado. Cuando la fila tiene lugar, entra ahí y no mueve nada. Va AL FINAL: al
 * principio correría todas las tarjetas un lugar justo debajo del cursor.
 *
 * Toca sólo el filtro de protocolo. «Limpiar N» sigue siendo lo que dice: limpiar TODO.
 */
export function AtajoProtocolos({ titulo, objeto, conTarjeta, minimo, seleccionados, codigoDe, sinNada, resumenTodos, accentSolid, onVerTodos, children }: {
  /** El rótulo de la sección: «Protocolos con pendientes». */
  titulo: string
  /** Lo que recorta: «la lista de abajo», «la tabla de abajo». */
  objeto: 'lista' | 'tabla'
  /** Los protocolos que tienen tarjeta, en el orden en que se dibujan. */
  conTarjeta: readonly string[]
  /**
   * Por debajo de cuántas tarjetas el atajo no se dibuja. Pendientes pide dos: con una sola, enfocarla
   * deja la lista igual. Pero NUNCA se esconde con un filtro de protocolo puesto: sería esconder la
   * única salida que está a la vista.
   */
  minimo: number
  seleccionados: readonly string[]
  /** El código para el aviso de huérfanos; null si el catálogo todavía no lo trajo. */
  codigoDe: (protocolId: string) => string | null
  /** «ya no tiene pendientes» / «ya no tienen pendientes». */
  sinNada: { uno: string; varios: string }
  /** El cuerpo de la tarjeta «Ver todos»: «30 pendientes» / «en 4 protocolos». */
  resumenTodos: { titular: string; detalle: string }
  accentSolid: string
  onVerTodos: () => void
  /** Las tarjetas, ya armadas con `TarjetaProtocolo`. */
  children: ReactNode
}) {
  const grilla = useRef<HTMLDivElement>(null)
  /* La tarjeta «Ver todos» se desmonta al tocarla, y con ella el foco: el lector de pantalla pierde
     el lugar y el teclado vuelve a empezar desde arriba. Se lo pasa a la primera tarjeta, que es la
     más grave (Pendientes) o la primera del catálogo (Stock). Sólo si lo tenía ella: con el foco en
     otro lado, moverlo sería robarlo. */
  const devolverFoco = useRef(false)
  const haySeleccion = seleccionados.length > 0
  useEffect(() => {
    if (haySeleccion || !devolverFoco.current) return
    devolverFoco.current = false
    grilla.current?.querySelector<HTMLButtonElement>('button[aria-pressed]')?.focus()
  }, [haySeleccion])

  if (conTarjeta.length < minimo && !haySeleccion) return null

  const e = estadoDelAtajo(conTarjeta, seleccionados)
  const pista = pistaDelAtajo(conTarjeta.length, e, objeto)
  const aviso = avisoDeHuerfanos(e.huerfanos.map(codigoDe), sinNada)

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="spira-eyebrow">{titulo}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
        {/* Región viva: el cambio de «1 de 4» a «2 de 4» se anuncia, y el aviso de un huérfano
            también (aparece sin que nadie toque nada, cuando se resuelve el último pendiente). */}
        <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontSize: 12, color: 'var(--spira-muted)', textAlign: 'right' }}>
          {aviso && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--spira-ink-soft)', fontWeight: 600 }}>
              <Icon name="info" size={13} color="var(--spira-ink-soft)" />{aviso}
            </span>
          )}
          {aviso && pista && <span aria-hidden="true">·</span>}
          {pista}
        </span>
      </div>
      <div ref={grilla} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {children}
        {haySeleccion && (
          <TarjetaVerTodos
            resumen={resumenTodos}
            accentSolid={accentSolid}
            onClick={(ev) => {
              devolverFoco.current = document.activeElement === ev.currentTarget
              onVerTodos()
            }}
          />
        )}
      </div>
    </section>
  )
}

/**
 * La tarjeta de un protocolo: código + estado arriba, nombre, separador, el resumen que pone cada
 * pantalla y el pie con lo que hace el clic. Es la anatomía que las dos pantallas ya compartían
 * «renglón por renglón»; ahora es literal.
 *
 * EL SELECCIONADO SE SEÑALA CON COLOR (borde + tinte) y no con elevación, al revés de la regla de la
 * casa: acá la elevación ya la gasta el hover, y una tarjeta enfocada tiene que verse distinta con
 * el mouse en cualquier lado. Mismo idioma que `MultiFilterMenu`. La excepción está escrita en
 * DESIGN.md («Selección persistente»), para que nadie la «corrija».
 */
export function TarjetaProtocolo({ code, protocolo, sel, haySeleccion, accentSolid, resumen, onClick, children }: {
  code: string
  /** Nombre y estado; null si el catálogo todavía no lo trajo (la tarjeta se dibuja igual). */
  protocolo: { name: string; status: ProtocolStatus } | null
  sel: boolean
  haySeleccion: boolean
  accentSolid: string
  /** El dato principal en palabras, para el rótulo accesible: «21 pendientes», «12 kits en stock». */
  resumen: string
  onClick: () => void
  children: ReactNode
}) {
  const pie = pieDeTarjeta(sel, haySeleccion)
  /* El rótulo accesible dice el resumen y la acción, porque los puntos de color del cuerpo son
     decoración para el lector de pantalla. Contiene el texto visible del pie («Enfocado», «Sumar»,
     «Ver sólo este»): quien maneja la voz dice lo que ve (WCAG 2.5.3). */
  const accion = sel ? 'Enfocado; tocá para quitar el foco' : pie === 'Sumar' ? 'Sumar este protocolo a la vista' : 'Ver sólo este protocolo'
  return (
    <button
      type="button"
      className="spira-card-link"
      aria-pressed={sel}
      aria-label={`${code}: ${resumen}. ${accion}`}
      onClick={onClick}
      style={{
        ...tarjeta,
        /* `accentSolid + '12'` es válido porque llega como hex crudo de `registry.ts` y no como
           `var(--…)`: con un token habría que usar `color-mix` (ver el gotcha del hex concatenado). */
        borderColor: sel ? accentSolid : 'var(--spira-line)',
        background: sel ? accentSolid + '12' : 'var(--spira-white)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="spira-mono" style={{ ...codigo, color: accentSolid }}>{code}</span>
        {protocolo && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
            <span style={{ ...punto, background: protocolStatusVar(protocolo.status) }} />
            {protocolStatusLabel(protocolo.status)}
          </span>
        )}
      </div>
      {/* El nombre es lo que permite elegir sin saberse los códigos de memoria. Recorta con puntos:
          un nombre largo no puede empujar la tarjeta. */}
      {protocolo && <div style={nombre}>{protocolo.name}</div>}
      <div style={separador} />
      {children}
      <div style={{ ...pieEstilo, color: sel ? accentSolid : 'var(--spira-muted)' }}>
        {sel && <Icon name="check" size={14} color={accentSolid} stroke={2.6} />}
        {pie}
      </div>
    </button>
  )
}

/**
 * «Ver todos»: misma silueta que una tarjeta de protocolo —así ocupa su celda sin desentonar—, pero
 * sin código ni estado, sobre `surface` en vez de blanco y con el ícono de lista: tiene que leerse
 * como «todos», no como un protocolo más. No lleva `aria-pressed`: no es un interruptor, es una
 * acción que se cumple y se va.
 */
function TarjetaVerTodos({ resumen, accentSolid, onClick }: {
  resumen: { titular: string; detalle: string }
  accentSolid: string
  onClick: (ev: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      className="spira-card-link"
      aria-label={`Ver todos los protocolos: ${resumen.titular}`}
      onClick={onClick}
      style={{ ...tarjeta, borderColor: 'var(--spira-line)', background: 'var(--spira-surface)' }}
    >
      <span style={{ ...codigo, color: accentSolid }}>Ver todos</span>
      <div style={nombre}>Todos los protocolos</div>
      <div style={separador} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${accentSolid} 10%, transparent)` }}>
          <Icon name="list" size={18} color={accentSolid} stroke={1.8} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)' }}>{resumen.titular}</div>
          <div style={{ fontSize: 11, color: 'var(--spira-muted)', marginTop: 1 }}>{resumen.detalle}</div>
        </div>
      </div>
      <div style={{ ...pieEstilo, color: 'var(--spira-muted)' }}>
        <Icon name="x" size={13} color="var(--spira-muted)" stroke={2.2} />
        Quitar el foco
      </div>
    </button>
  )
}

/* Borde en LONGHANDS: el `borderColor` se escribe inline según el estado, y mezclarlo con la
   abreviada deja el borde roto al salir del estado (React vacía las longhand en el render
   siguiente). Es el gotcha de la casa, documentado en CLAUDE.md. Stock lo resolvía distinto
   —`borderColor: undefined` sobre la abreviada de la clase—; ahora las dos van por acá. */
const tarjeta: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
  borderWidth: 1, borderStyle: 'solid', borderRadius: 16,
  padding: '16px 18px', boxShadow: 'var(--spira-shadow-sm)', cursor: 'pointer',
  font: 'inherit', color: 'inherit',
}
const codigo: CSSProperties = { fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const nombre: CSSProperties = { fontSize: 14.5, fontWeight: 600, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const separador: CSSProperties = { height: 1, background: 'var(--spira-line)', margin: '2px 0' }
/* `marginTop: auto`: en una fila de la grilla las tarjetas se estiran al alto de la más alta (la de
   «Ver todos» tiene menos renglones de desglose), y el pie queda abajo en todas, alineado. */
const pieEstilo: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, fontSize: 12, fontWeight: 600, marginTop: 'auto' }
const punto: CSSProperties = { width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto' }
