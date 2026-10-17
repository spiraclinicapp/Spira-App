import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { previewScheduleSync, applyScheduleSync, useNombresDeInscripciones, useVisitasFueraDeVentana } from '../../data/visitDefinitions'
import type { DetalleDelSync, NombreDeInscripcion, SchedulePlan } from '../../data/visitDefinitions'
import { formatDayMonth } from '../../lib/dates'
import { avisoFueraDeVentana, gruposDelDetalle, lineasDelPlan, planSinCambios, textoDelRenglon } from './sincronizar'

/**
 * Preview + aplicar de la sincronización del cronograma. Al abrir llama al dry-run y muestra
 * cuántas visitas se crearían / cambiarían de fecha / borrarían (solo no atendidas). "Aplicar" ejecuta
 * la RPC en una transacción y avisa al padre para refrescar las vistas. Las atendidas nunca
 * se tocan; si alguna difiere del cronograma se reporta sin modificarla.
 *
 * Desde la 0163 el sync CONSERVA las fechas que se dieron a mano (Reprogramar, el encabezado, la llegada
 * adelantada…) y las de las visitas con algo marcado, y el preview lo dice. Desde la 0164 además LISTA cuáles:
 * paciente, IVRS, visita y «20 oct → 27 oct» o «23 oct · se la dieron a mano», agrupadas por lo que les pasa
 * (`gruposDelDetalle`, pura y con test). Los nombres los pone la app con la RLS de quien mira
 * (`useNombresDeInscripciones`): el sync no los manda.
 *
 * Sin la 0164 (la respuesta no trae `detalle`) queda lo de la 0163: las líneas de `lineasDelPlan` y el aviso
 * ámbar de las que quedan fuera de su ventana, nombradas por `v_track_visits`.
 */
export function ScheduleSyncModal({
  protocolId,
  accentSolid,
  onClose,
  onApplied,
}: {
  protocolId: string
  accentSolid: string
  onClose: () => void
  onApplied: () => void
}) {
  const [plan, setPlan] = useState<SchedulePlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detalle = plan?.detalle ?? null
  const nombres = useNombresDeInscripciones(detalle ? detalle.map((d) => d.inscripcion_id) : [])
  const fuera = useVisitasFueraDeVentana(!detalle ? plan?.fuera_de_ventana ?? [] : [])

  useEffect(() => {
    let active = true
    void previewScheduleSync(protocolId).then((res) => {
      if (!active) return
      if (res.error) setError(res.error)
      else setPlan(res.plan)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [protocolId])

  const apply = async () => {
    setBusy(true)
    setError(null)
    const res = await applyScheduleSync(protocolId)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onApplied()
    onClose()
  }

  const nothing = plan != null && planSinCambios(plan)
  const lineas = plan && !detalle ? lineasDelPlan(plan) : []
  const aviso = plan && !detalle ? avisoFueraDeVentana(plan) : null
  const nombradas = fuera.data ?? []
  const grupos = detalle ? gruposDelDetalle(detalle) : []

  return (
    <Modal title="Generar / actualizar cronograma" onClose={onClose} maxWidth={detalle ? 600 : 460}>
      {loading ? (
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Calculando cambios…</div>
      ) : error ? (
        <div style={{ fontSize: 13.5, color: 'var(--spira-acc-deep-danger)' }}>{error}</div>
      ) : !plan ? (
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>No pudimos leer el plan del cronograma.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* La segunda frase, por un caso real (17/10): el Director le sacó un procedimiento a la V1 y vino a
              «aplicarlo» acá. Lo que lleva cada visita se calcula en vivo del cronograma (v_visit_procedures,
              0144): no hay nada que sincronizar, y sin decirlo «al día» parecía que el cambio no había entrado. */}
          {nothing && (
            <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', lineHeight: 1.5 }}>
              El cronograma ya está al día. No hay cambios para aplicar.
              <br />
              Los cambios en los procedimientos ya rigen solos: este botón sólo crea visitas y ajusta fechas.
            </div>
          )}
          {/* Con la 0164: la lista, por grupo. Una lista larga se recorre adentro del modal. */}
          {grupos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '52vh', overflowY: 'auto', paddingRight: 4 }}>
              {grupos.map((g) => (
                <section key={g.grupo} data-grupo={g.grupo}>
                  <div style={{ fontSize: 13.5 }}>
                    <b>{g.filas.length}</b> {g.titulo}
                  </div>
                  <ul style={{ fontSize: 13, lineHeight: 1.6, margin: '4px 0 0', paddingLeft: 18 }}>
                    {g.filas.map((d, i) => (
                      <Renglon key={`${d.visita_id ?? d.inscripcion_id}-${d.visita ?? ''}-${i}`} d={d} nombre={nombres.data?.get(d.inscripcion_id) ?? null} cargando={nombres.loading} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {/* Sin la 0164: las líneas de la 0163. */}
          {lineas.length > 0 && (
            <ul style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
              {lineas.map((l) => (
                <li key={l.clave}>
                  <b>{l.n}</b> {l.texto}
                </li>
              ))}
            </ul>
          )}
          {detalle && plan.deletes > 0 && (
            <div style={{ fontSize: 13.5 }}>
              <b>{plan.deletes}</b> {plan.deletes === 1 ? 'visita a borrar (no atendida)' : 'visitas a borrar (no atendidas)'}
            </div>
          )}
          {/* Sin la 0164: una conservada que el cambio de definición deja fuera de su ventana. */}
          {aviso && (
            <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-warn)', lineHeight: 1.5 }}>
              {aviso}
              {nombradas.length > 0 ? ':' : '.'}
              {nombradas.length > 0 && (
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {nombradas.map((v) => (
                    <li key={v.id}>
                      {[v.patient_name, v.visit_code, v.estimated_date ? formatDayMonth(v.estimated_date) : null].filter(Boolean).join(' · ')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {/* Las atendidas nunca se tocan; si difieren del cronograma se avisa, haya o no cambios. */}
          {plan.attended_divergent > 0 && (
            <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-warn)', lineHeight: 1.5 }}>
              {plan.attended_divergent} {plan.attended_divergent === 1 ? 'visita atendida difiere' : 'visitas atendidas difieren'} del cronograma. Se dejan intactas.
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" style={btnOutline} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              style={{ ...btnPrimary(accentSolid), opacity: busy || nothing ? 0.6 : 1, cursor: busy || nothing ? 'default' : 'pointer' }}
              disabled={busy || nothing}
              onClick={() => void apply()}
            >
              {busy ? 'Aplicando…' : 'Aplicar'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/**
 * Un renglón del detalle: nombre en tinta, IVRS en mono, la visita y lo que le pasa. Si quien mira no ve al
 * paciente (la RLS no devolvió la inscripción), el renglón queda con la visita y las fechas, sin nombre.
 */
function Renglon({ d, nombre, cargando }: { d: DetalleDelSync; nombre: NombreDeInscripcion | null; cargando: boolean }) {
  const { texto, fueraDeVentana } = textoDelRenglon(d)
  return (
    <li>
      {nombre ? (
        <>
          {nombre.nombre}
          {nombre.ivrs && (
            <>
              {' · '}
              <span className="spira-mono" style={{ color: 'var(--spira-muted)' }}>{nombre.ivrs}</span>
            </>
          )}
        </>
      ) : (
        <span style={{ color: 'var(--spira-muted)' }}>{cargando ? '…' : 'Sin acceso al paciente'}</span>
      )}
      {d.visita && (
        <>
          {' · '}
          <span style={{ fontWeight: 600 }}>{d.visita}</span>
        </>
      )}
      {' · '}
      {texto}
      {fueraDeVentana && <span style={{ color: 'var(--spira-acc-deep-warn)' }}> · {fueraDeVentana}</span>}
    </li>
  )
}
