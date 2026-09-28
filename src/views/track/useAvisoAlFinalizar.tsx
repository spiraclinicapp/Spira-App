import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchVisitProcedureStatus, toggleVisitProcedure } from '../../data/procedures'
import { dejarPendientes } from '../../data/pendientes'
import { pendientesAlFinalizar } from './retomar'
import type { ProcedimientoElegible } from './retomar'
import { AvisoPendientesModal } from './AvisoPendientesModal'

interface Aviso {
  visitId: string
  pendientes: ProcedimientoElegible[]
  seguir: () => Promise<void> | void
  /** Resuelve la promesa de `pedir`: el flujo terminó, se haya finalizado o no. */
  terminar: () => void
}

/**
 * El aviso al finalizar (v0145), para los DOS lugares desde donde se finaliza: la fila de Visitas y
 * el detalle de la visita. La regla de «hay pendientes» es una sola (`pendientesAlFinalizar`); acá
 * sólo se decide cuándo preguntar y qué hacer con la respuesta.
 *
 * `pedir` resuelve cuando el flujo TERMINA, no cuando se abre el modal: quien lo llama (el detalle
 * de la visita) refresca al volver, y si volviera antes de que la persona elija, refrescaría una
 * visita que todavía no se finalizó.
 *
 * El orden al finalizar es tildes → marcas → avance, y cada paso corta si falla: no se finaliza con
 * algo a medio guardar. Reintentar no vuelve a tildar lo ya tildado (`yaTildados`), que el servidor
 * rechazaría como duplicado.
 *
 * Si la lectura inicial falla, FINALIZA igual (falla abierta). El aviso es una ayuda, no una guarda:
 * frenar el cierre de la atención porque no se pudo leer la lista cortaría el recorrido del día.
 */
export function useAvisoAlFinalizar(accent: string): {
  pedir: (visit: { id: string; protocol_id: string }, seguir: () => Promise<void> | void) => Promise<void>
  modal: ReactNode
} {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  /**
   * Lo tildado desde este aviso, por si un paso posterior falla y se reintenta.
   *
   * Caso raro: si se reintenta después de que `dejarPendientes` falló, y en el medio la persona
   * destildó en el paso 1 algo que ya se había tildado acá, ese tilde queda puesto (este ref no
   * destilda). Aceptable: se ve en la visita y se destilda ahí.
   */
  const yaTildados = useRef<Set<string>>(new Set())

  const pedir = async (visit: { id: string; protocol_id: string }, seguir: () => Promise<void> | void) => {
    const r = await fetchVisitProcedureStatus(visit.id, visit.protocol_id)
    const pendientes = r.data ? pendientesAlFinalizar(r.data) : []
    if (pendientes.length === 0) { await seguir(); return }
    yaTildados.current = new Set()
    await new Promise<void>((resolve) => setAviso({ visitId: visit.id, pendientes, seguir, terminar: resolve }))
  }

  const modal = aviso && (
    <AvisoPendientesModal
      pendientes={aviso.pendientes}
      accent={accent}
      onFinalizar={async (hechos) => {
        for (const id of hechos) {
          if (yaTildados.current.has(id)) continue
          const t = await toggleVisitProcedure(aviso.visitId, id, true)
          if (t.error) return t.error
          yaTildados.current.add(id)
        }
        const quedan = aviso.pendientes.map((p) => p.procedure_id).filter((id) => !hechos.includes(id))
        if (quedan.length > 0) {
          const res = await dejarPendientes(aviso.visitId, quedan)
          if (res.error) return res.error
        }
        setAviso(null)
        await aviso.seguir()
        aviso.terminar()
        return null
      }}
      onClose={() => { setAviso(null); aviso.terminar() }}
    />
  )

  return { pedir, modal }
}
