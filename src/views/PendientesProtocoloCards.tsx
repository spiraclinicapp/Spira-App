import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import type { ProtocolRow } from '../data/protocols'
import { AtajoProtocolos, TarjetaProtocolo } from './AtajoProtocolos'
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
 * LA CÁSCARA ES COMPARTIDA CON STOCK (`AtajoProtocolos`, 2026-10-03): cabecera, tarjeta, pie,
 * «Ver todos» y el aviso de un protocolo enfocado que se quedó sin pendientes. Acá queda sólo lo
 * propio de Pendientes: el orden y el resumen por gravedad.
 */
export function PendientesProtocoloCards({ visitas, reportes, ips, retomar, fechaPasada, sinMarcar, protocols, seleccionados, accentSolid, onToggle, onVerTodos }: {
  /** Alertas de visita SIN filtrar. */
  visitas: readonly VisitaConProtocolo[]
  /** Reportes pendientes SIN filtrar. */
  reportes: readonly ReporteConProtocolo[]
  /** IP sin entregar SIN filtrar (0119). */
  ips: readonly ReporteConProtocolo[]
  /** Procedimientos por retomar SIN filtrar, una fila por visita (v0145). */
  retomar: readonly ReporteConProtocolo[]
  /** Visitas con la fecha pasada y la ventana abierta, SIN filtrar (2026-09-28). */
  fechaPasada: readonly ReporteConProtocolo[]
  /** Visitas finalizadas con procedimientos sin marcar, SIN filtrar, una fila por visita (2026-09-28). */
  sinMarcar: readonly ReporteConProtocolo[]
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
  /** Suelta sólo el filtro de protocolo: los demás filtros de la barra quedan como estaban. */
  onVerTodos: () => void
}) {
  const filas = pendientesPorProtocolo(visitas, reportes, ips, retomar, fechaPasada, sinMarcar)
  const porId = new Map(protocols.map((p) => [p.id, p]))
  const total = filas.reduce((s, p) => s + p.total, 0)
  const haySeleccion = seleccionados.length > 0

  return (
    /* `minimo` 2: con un solo protocolo el atajo no sirve de nada, enfocar en el único que hay deja
       la lista igual. Pero con un filtro puesto se dibuja igual (ver `AtajoProtocolos`). */
    <AtajoProtocolos
      titulo="Protocolos con pendientes"
      objeto="lista"
      conTarjeta={filas.map((p) => p.protocolId)}
      minimo={2}
      seleccionados={seleccionados}
      codigoDe={(id) => porId.get(id)?.code ?? null}
      sinNada={{ uno: 'ya no tiene pendientes', varios: 'ya no tienen pendientes' }}
      resumenTodos={{
        titular: `${total} ${total === 1 ? 'pendiente' : 'pendientes'}`,
        detalle: `en ${filas.length} ${filas.length === 1 ? 'protocolo' : 'protocolos'}`,
      }}
      accentSolid={accentSolid}
      onVerTodos={onVerTodos}
    >
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
        /* Sin alerta de visita, el IP sin entregar (0119) manda sobre los reportes: mismo orden que
           el punto de la campana (`tonoDelPunto`). Ícono y tono son los de `CLASES.ip`, escritos acá
           porque `views/` no importa de `shell/`. */
        const icono = p.peor ? SEVERIDAD_ICONO[claseDeAlerta(p.peor)] : p.ips > 0 ? 'pill' : p.reportes > 0 ? ICONO_REPORTE : 'clock'
        const tono = p.peor ? VISIT_STATES[p.peor].color : p.ips > 0 ? 'var(--spira-acc-deep-warn)' : p.reportes > 0 ? 'var(--spira-acc-deep-blue)' : 'var(--spira-muted)'
        const resumen = `${p.total} ${p.total === 1 ? 'pendiente' : 'pendientes'}`
        return (
          <TarjetaProtocolo
            key={p.protocolId}
            code={p.code}
            protocolo={proto ?? null}
            sel={sel}
            haySeleccion={haySeleccion}
            accentSolid={accentSolid}
            resumen={resumen}
            onClick={() => onToggle(p.protocolId)}
          >
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
                  {resumen}
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
                  {p.fechaPasada > 0 && (
                    <span style={parte}>
                      <span style={{ ...punto, background: 'var(--spira-acc-deep-warn)' }} />
                      Fecha pasada <b style={cifra}>{p.fechaPasada}</b>
                    </span>
                  )}
                  {p.ips > 0 && (
                    <span style={parte}>
                      <span style={{ ...punto, background: 'var(--spira-acc-deep-warn)' }} />
                      IP <b style={cifra}>{p.ips}</b>
                    </span>
                  )}
                  {p.sinMarcar > 0 && (
                    <span style={parte}>
                      <span style={{ ...punto, background: 'var(--spira-acc-deep-warn)' }} />
                      Sin marcar <b style={cifra}>{p.sinMarcar}</b>
                    </span>
                  )}
                  {p.reportes > 0 && (
                    <span style={parte}>
                      <span style={{ ...punto, background: 'var(--spira-acc-deep-blue)' }} />
                      Reporte <b style={cifra}>{p.reportes}</b>
                    </span>
                  )}
                  {p.retomar > 0 && (
                    <span style={parte}>
                      <span style={{ ...punto, background: 'var(--spira-muted)' }} />
                      Por retomar <b style={cifra}>{p.retomar}</b>
                    </span>
                  )}
                </div>
              </div>
            </div>

          </TarjetaProtocolo>
        )
      })}
    </AtajoProtocolos>
  )
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
