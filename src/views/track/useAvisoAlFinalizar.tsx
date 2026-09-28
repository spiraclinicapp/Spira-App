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
 *
 * Screening y randomización no cierran acá: `avanzarAhora` (VisitDetail) y `avanzar` (Visitas)
 * abren `ReadyOutcomeModal` para capturar el desenlace clínico DESPUÉS de este aviso. Los tildes y
 * las marcas ya quedaron guardados en ese momento —«Finalizar» de este modal ya escribió—, así que
 * cancelar el desenlace clínico NO los deshace. Es lo que corresponde: la pregunta de acá es «¿qué
 * se hizo hoy?», no «¿cómo terminó la visita?», y lo que se hizo queda dicho aunque el desenlace se
 * postergue. Además es visible y reversible desde el propio panel de procedimientos.
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
  /**
   * Si ya hay un `pedir` en curso —el modal abierto, o la lectura inicial todavía en vuelo—, uno
   * nuevo se ignora en vez de pisarlo: un doble clic en la fila, o la fila y el detalle mandando a
   * la vez, dejarían el primer `aviso` reemplazado y su promesa colgada para siempre (nadie vuelve a
   * llamar a `terminar` de ESE). Se limpia en el `finally`, así que cubre las tres salidas: sin
   * pendientes, con el aviso resuelto, y si la lectura inicial revienta (falla abierta).
   */
  const enCurso = useRef(false)

  const pedir = async (visit: { id: string; protocol_id: string }, seguir: () => Promise<void> | void) => {
    if (enCurso.current) return
    enCurso.current = true
    try {
      const r = await fetchVisitProcedureStatus(visit.id, visit.protocol_id)
      const pendientes = r.data ? pendientesAlFinalizar(r.data) : []
      if (pendientes.length === 0) { await seguir(); return }
      yaTildados.current = new Set()
      await new Promise<void>((resolve) => setAviso({ visitId: visit.id, pendientes, seguir, terminar: resolve }))
    } finally {
      enCurso.current = false
    }
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
        /* `terminar()` SIEMPRE tiene que correr, sea que `seguir()` termine bien o tire: si
           `seguir()` revienta (por ejemplo el `avanzar` de Visitas al fallar el paso siguiente) y
           `terminar()` se queda sin llamar, la promesa de `pedir` no se resuelve nunca y `enCurso`
           queda trabado en `true` para siempre — un segundo intento de finalizar esa (u otra) visita
           se ignoraría en silencio. */
        try {
          await aviso.seguir()
        } finally {
          aviso.terminar()
        }
        return null
      }}
      onClose={() => { setAviso(null); aviso.terminar() }}
    />
  )

  return { pedir, modal }
}
