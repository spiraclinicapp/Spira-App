import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { protocolStatusLabel, protocolStatusVar } from './protocolStatus'
import type { ProtocolRow } from '../data/protocols'
import { VISIT_STATES } from './visitStates'
import { claseDeAlerta, ICONO_REPORTE, SEVERIDAD_ICONO } from './alertSeverity'
import { pendientesPorProtocolo } from './pendientesPorProtocolo'
import type { ReporteConProtocolo, VisitaConProtocolo } from './pendientesPorProtocolo'

/**
 * Las tarjetas de protocolo de la pantalla **Pendientes**: un atajo para enfocar la lista de abajo
 * en un protocolo, con el desglose de lo que hay en cada uno.
 *
 * CALCADA DEL ATAJO DE STOCK (`ProtocoloCards`, en `MedicamentosView`) — pedido del Director, y a
 * propósito hasta en el detalle que más importa: **tildar una tarjeta es tildar esa opción del menú
 * "Protocolo"**, porque las dos escriben el MISMO `protocolFilter` que ya vive en la URL. Dos
 * maneras de tocar un solo interruptor, no dos fuentes de verdad — si fueran dos estados
 * separados, la tarjeta y el desplegable podrían contradecirse y ganaría el que se dibuje último.
 *
 * **LA ANATOMÍA ES LA DE STOCK, renglón por renglón** (pedido del Director, con captura): código +
 * estado del protocolo arriba, nombre debajo, separador, y el resumen con su ícono. Nació más baja
 * —sin nombre ni estado— para ahorrar alto en la pantalla que más se mira, y esa versión duró un
 * rato: **si dos pantallas ofrecen el mismo gesto, tienen que verse iguales**, y el nombre del
 * protocolo es justamente lo que permite elegir sin saberse los códigos de memoria. El alto que
 * cuesta está medido y anotado en la bitácora.
 *
 * LO ÚNICO QUE SE APARTA DE STOCK es el ORDEN: allá es alfabético porque se navega un catálogo, acá
 * es por gravedad porque se decide qué atender primero (ver `pendientesPorProtocolo`).
 *
 * LOS CONTEOS SON SOBRE LOS DATOS CRUDOS, no sobre la lista ya filtrada: si se calcularan sobre lo
 * filtrado, tildar una tarjeta pondría en cero a todas las demás y el atajo se volvería un callejón
 * sin salida. Es el mismo criterio que ya usan las opciones del menú Protocolo.
 *
 * EL SELECCIONADO SE SEÑALA CON COLOR (borde + tinte) y no con elevación, que es la regla de la
 * casa al revés de lo habitual: acá la elevación ya la gasta el hover, y una tarjeta enfocada tiene
 * que verse distinta con el mouse en cualquier lado. Mismo idioma que `MultiFilterMenu` y que las
 * tarjetas de Stock.
 */
export function PendientesProtocoloCards({ visitas, reportes, protocols, seleccionados, accentSolid, onToggle }: {
  /** Alertas de visita SIN filtrar. */
  visitas: readonly VisitaConProtocolo[]
  /** Reportes pendientes SIN filtrar. */
  reportes: readonly ReporteConProtocolo[]
  /**
   * El catálogo, para el NOMBRE y el ESTADO de cada protocolo: las filas de alerta traen el código
   * pero no el resto. Si un protocolo todavía no está acá —la consulta carga por su cuenta— la
   * tarjeta se dibuja igual con lo que tiene: mejor una tarjeta sin nombre que un hueco donde había
   * un atajo.
   */
  protocols: readonly ProtocolRow[]
  /** Los `protocol_id` tildados — el mismo arreglo que el menú "Protocolo". */
  seleccionados: string[]
  accentSolid: string
  onToggle: (protocolId: string) => void
}) {
  const filas = pendientesPorProtocolo(visitas, reportes)
  const porId = new Map(protocols.map((p) => [p.id, p]))
  /* Con un solo protocolo el atajo no sirve de nada: enfocar en el único que hay deja la lista igual.
     Se esconde entero en vez de dibujar una tarjeta que no cambia nada al tocarla. */
  if (filas.length < 2) return null

  const hint = seleccionados.length === 0
    ? 'Elegí uno para enfocar la lista de abajo'
    : `Mostrando ${seleccionados.length} de ${filas.length}`

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="spira-eyebrow">Protocolos con pendientes</span>
        <span style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
        <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>{hint}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {filas.map((p) => {
          const sel = seleccionados.includes(p.protocolId)
          const proto = porId.get(p.protocolId)
          /* El ícono espeja al de la campana, y desde que hay UNA sola tabla eso es literal en vez
             de una intención: sale de `SEVERIDAD_ICONO`, la misma que leen la campana, la lista de
             abajo y la cabecera de la tarjeta de alertas. Antes era un ternario propio
             —`ventana_vencida ? alertCircle : clock`— con dos agujeros: "no vino" quedaba con el
             reloj de "pendiente vencido", y `p.peor === null` —que es el caso de un protocolo cuyos
             únicos pendientes son REPORTES— también, cuando ahí el ícono correcto es el del reporte.
             Un ícono fijo desperdiciaría el único lugar de la tarjeta donde la gravedad se ve sin
             leer; uno equivocado es peor, porque igual se lee. */
          const icono = p.peor ? SEVERIDAD_ICONO[claseDeAlerta(p.peor)] : ICONO_REPORTE
          const tono = p.peor ? VISIT_STATES[p.peor].color : 'var(--spira-acc-deep-blue)'
          return (
            <button
              key={p.protocolId}
              type="button"
              className="spira-card-link"
              aria-pressed={sel}
              /* El rótulo accesible dice el TOTAL y la acción, porque los puntos de color de abajo
                 son decoración para el lector de pantalla: sin esto, la tarjeta se anuncia como una
                 ristra de números sueltos. */
              aria-label={`${p.code}: ${p.total} ${p.total === 1 ? 'pendiente' : 'pendientes'}. ${sel ? 'Quitar el foco' : 'Ver sólo este protocolo'}`}
              onClick={() => onToggle(p.protocolId)}
              style={{
                ...tarjeta,
                /* `accentSolid + '12'` es válido acá porque llega como hex crudo de `registry.ts` y
                   no como `var(--…)`: con un token habría que usar `color-mix` (ver el gotcha del
                   hex concatenado en `alertItem.ts`). */
                borderColor: sel ? accentSolid : 'var(--spira-line)',
                background: sel ? accentSolid + '12' : 'var(--spira-white)',
              }}
            >
              {/* Renglón 1 — código + estado del protocolo, igual que en Stock. */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17, color: accentSolid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.code}
                </span>
                {proto && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
                    <span style={{ ...punto, background: protocolStatusVar(proto.status) }} />
                    {protocolStatusLabel(proto.status)}
                  </span>
                )}
              </div>

              {/* Renglón 2 — el nombre. Es lo que permite elegir sin saberse los códigos de memoria.
                  Recorta con puntos suspensivos: un nombre largo no puede empujar la tarjeta. */}
              {proto && (
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {proto.name}
                </div>
              )}

              <div style={{ height: 1, background: 'var(--spira-line)', margin: '2px 0' }} />

              {/* Renglón 3 — el resumen, con el ícono teñido por la peor clase presente. El desglose
                  se lee como un MARCADOR ("Ventana 9"), no como una frase ("9 ventanas"): los
                  `short` de `VISIT_STATES` están escritos para estar solos en un chip, y detrás de
                  un número salían mal ("9 ventana", "2 vencido"). Escribir plurales acá sería un
                  diccionario paralelo de rótulos — justo lo que viene fallando en esta pantalla. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: tinte(tono) }}>
                  <Icon name={icono} size={18} color={tono} stroke={1.8} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)' }}>
                    {p.total} {p.total === 1 ? 'pendiente' : 'pendientes'}
                  </div>
                  {/* Envuelve en vez de recortarse: son como mucho cuatro y cortar uno escondería
                      una clase entera. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', fontSize: 11, color: 'var(--spira-muted)', marginTop: 1 }}>
                    {p.porEstado.map((x) => (
                      <span key={x.estado} style={parte}>
                        <span style={{ ...punto, background: VISIT_STATES[x.estado].color }} />
                        {VISIT_STATES[x.estado].short} <b style={cifra}>{x.n}</b>
                      </span>
                    ))}
                    {p.reportes > 0 && (
                      <span style={parte}>
                        <span style={{ ...punto, background: 'var(--spira-acc-deep-blue)' }} />
                        Reporte <b style={cifra}>{p.reportes}</b>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, fontSize: 12, fontWeight: 600, color: sel ? accentSolid : 'var(--spira-muted)' }}>
                {sel && <Icon name="check" size={14} color={accentSolid} stroke={2.6} />}
                {sel ? 'Enfocado' : 'Ver sólo este'}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* Borde en LONGHANDS: el `borderColor` se escribe inline según el estado, y mezclarlo con la
   abreviada deja el borde roto al salir del estado (React vacía las longhand en el render
   siguiente). Es el gotcha de la casa, documentado en CLAUDE.md. */
const tarjeta: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
  borderWidth: 1, borderStyle: 'solid', borderRadius: 16,
  padding: '16px 18px', boxShadow: 'var(--spira-shadow-sm)', cursor: 'pointer',
  font: 'inherit', color: 'inherit',
}

/* El fondo del ícono. Va con `color-mix` y NO concatenando alpha al hex: el tono puede llegar como
   token (`var(--spira-acc-deep-blue)` cuando el protocolo sólo tiene reportes) y
   `var(--…)12` no es CSS válido — se descarta en silencio y el cuadrado queda transparente.
   Es el gotcha que documenta `alertItem.ts`. */
const tinte = (tono: string) => `color-mix(in srgb, ${tono} 12%, transparent)`
const parte: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }
/* La cifra en tinta y tabular: es el dato que se compara entre tarjetas, el rótulo es la etiqueta. */
const cifra: CSSProperties = { fontWeight: 700, color: 'var(--spira-ink)', fontVariantNumeric: 'tabular-nums' }
const punto: CSSProperties = { width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto' }
