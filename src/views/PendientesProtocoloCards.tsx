import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { VISIT_STATES } from './visitStates'
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
 * DOS COSAS SE APARTAN DE STOCK, y las dos por lo mismo — allá se navega un catálogo y acá se
 * decide qué atender primero:
 *
 *   · **El orden no es alfabético** sino por gravedad (ver `pendientesPorProtocolo`).
 *   · **La tarjeta es más baja.** La de Stock lleva nombre del protocolo, estado, ícono y dos
 *     líneas de resumen (~150 px). Acá el mosaico entero se interpone entre el filtro y el trabajo,
 *     así que dice lo mínimo que sirve para elegir: el código, cuántos hay y de qué clase.
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
export function PendientesProtocoloCards({ visitas, reportes, seleccionados, accentSolid, onToggle }: {
  /** Alertas de visita SIN filtrar. */
  visitas: readonly VisitaConProtocolo[]
  /** Reportes pendientes SIN filtrar. */
  reportes: readonly ReporteConProtocolo[]
  /** Los `protocol_id` tildados — el mismo arreglo que el menú "Protocolo". */
  seleccionados: string[]
  accentSolid: string
  onToggle: (protocolId: string) => void
}) {
  const filas = pendientesPorProtocolo(visitas, reportes)
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(228px, 1fr))', gap: 12 }}>
        {filas.map((p) => {
          const sel = seleccionados.includes(p.protocolId)
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
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15.5, color: accentSolid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.code}
                </span>
                <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' }}>
                  {p.total}
                </span>
              </div>

              {/* El desglose se lee como un MARCADOR ("Ventana 9"), no como una frase ("9 ventanas").
                  Los `short` de `VISIT_STATES` están escritos para estar solos en un chip, así que
                  detrás de un número salían mal: "9 ventana", "4 no vino", "2 vencido". La salida no
                  es escribir plurales acá —sería un diccionario paralelo de rótulos, que es
                  exactamente lo que viene fallando en esta pantalla— sino ponerle el número DESPUÉS
                  al rótulo tal cual, que es neutro y no le pide concordancia a nada.

                  Envuelve en vez de recortarse: son como mucho cuatro y cortar uno escondería una
                  clase entera. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--spira-muted)' }}>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, fontSize: 11.5, fontWeight: 600, color: sel ? accentSolid : 'var(--spira-faint)' }}>
                {sel && <Icon name="check" size={13} color={accentSolid} stroke={2.6} />}
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
  display: 'flex', flexDirection: 'column', gap: 7, textAlign: 'left',
  borderWidth: 1, borderStyle: 'solid', borderRadius: 14,
  padding: '12px 14px', boxShadow: 'var(--spira-shadow-sm)', cursor: 'pointer',
  font: 'inherit', color: 'inherit',
}
const parte: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }
/* La cifra en tinta y tabular: es el dato que se compara entre tarjetas, el rótulo es la etiqueta. */
const cifra: CSSProperties = { fontWeight: 700, color: 'var(--spira-ink)', fontVariantNumeric: 'tabular-nums' }
const punto: CSSProperties = { width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto' }
