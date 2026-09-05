/**
 * ┌─ Cuántos pendientes tiene cada protocolo, y de qué clase ──────────────────────────────────┐
 *
 * Alimenta las tarjetas de protocolo de la pantalla **Pendientes** — el atajo que enfoca la lista
 * de abajo, calcado del que Stock tiene sobre su tabla (`ProtocoloCards`, `MedicamentosView`).
 *
 * POR QUÉ ES UNA FUNCIÓN PURA CON TEST y no un par de `filter` en el JSX: es aritmética que se lee
 * como verdad. Una tarjeta que dice "3" cuando hay 5 no rompe nada y nadie la va a contar a mano —
 * y lo que esconde es trabajo clínico. El modo de falla clásico acá es **olvidarse de una de las
 * dos listas**: la pantalla cruza alertas de visita con reportes pendientes, que vienen de consultas
 * distintas, y un conteo que sólo mire una se ve perfectamente normal.
 *
 * PIDE LO MÍNIMO DE CADA FILA, igual que las reglas de `ambito.ts` y `alertFilters.ts`: así las dos
 * listas —que NO comparten tipo— entran por la misma puerta sin escribir la función dos veces, y la
 * segunda copia sería la que se olvide de un caso.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { VisitStatus } from '../data/visits'
import { GRAVEDAD } from './alertSeverity'

/** Lo que se necesita de una alerta de VISITA. */
export interface VisitaConProtocolo {
  protocol_id: string
  protocol_code: string
  computed_status: VisitStatus
}

/** Lo que se necesita de un REPORTE pendiente. No tiene `computed_status`: es su propia clase. */
export interface ReporteConProtocolo {
  protocol_id: string
  protocol_code: string
}

/**
 * El desglose de un protocolo. `porEstado` sólo lleva los estados que REALMENTE aparecen — no se
 * inicializa en cero para los cuatro: una tarjeta que dijera "0 ventanas vencidas" ocuparía un
 * renglón para decir que no hay nada, y en un tablero de trabajo el cero es ruido.
 */
export interface PendientesDeProtocolo {
  protocolId: string
  code: string
  /** Visitas + reportes. Es el número grande de la tarjeta. */
  total: number
  /** Cuántas visitas de cada estado de alerta, en el orden de `GRAVEDAD`. Sin ceros. */
  porEstado: { estado: VisitStatus; n: number }[]
  /** Cuántos reportes pendientes. 0 = no se muestra. */
  reportes: number
  /** El estado más grave presente, o `null` si el protocolo sólo tiene reportes. Ordena y tiñe. */
  peor: VisitStatus | null
}

/**
 * Agrupa las DOS listas de la pantalla por protocolo.
 *
 * EL ORDEN NO ES ALFABÉTICO, y es una decisión: primero el protocolo con la alerta **más grave**
 * (por `GRAVEDAD`), y a igual gravedad el que tiene **más** pendientes; el código desempata al
 * final para que el orden sea estable cuando todo lo demás empata. Stock ordena sus tarjetas por
 * código porque ahí se navega un catálogo; acá se decide qué atender primero, y un tablero que
 * ponga arriba al protocolo que empieza con "A" está ordenando por un dato que no significa nada.
 *
 * Los protocolos SIN pendientes no aparecen: la tarjeta es un atajo para enfocar, y una que lleva a
 * una lista vacía es un clic que no hace nada.
 */
export function pendientesPorProtocolo(
  visitas: readonly VisitaConProtocolo[],
  reportes: readonly ReporteConProtocolo[],
): PendientesDeProtocolo[] {
  const acc = new Map<string, { code: string; estados: Map<VisitStatus, number>; reportes: number }>()
  const entrada = (id: string, code: string) => {
    const previo = acc.get(id)
    if (previo) return previo
    const nuevo = { code, estados: new Map<VisitStatus, number>(), reportes: 0 }
    acc.set(id, nuevo)
    return nuevo
  }

  for (const v of visitas) {
    const e = entrada(v.protocol_id, v.protocol_code)
    e.estados.set(v.computed_status, (e.estados.get(v.computed_status) ?? 0) + 1)
  }
  for (const r of reportes) entrada(r.protocol_id, r.protocol_code).reportes += 1

  const filas: PendientesDeProtocolo[] = [...acc.entries()].map(([protocolId, e]) => {
    /* El desglose sale EN EL ORDEN DE `GRAVEDAD` y no en el de aparición: si la tarjeta listara los
       estados según cuál llegó primero en la consulta, dos protocolos con los mismos estados los
       mostrarían en orden distinto y las tarjetas dejarían de compararse de un vistazo. */
    const porEstado = GRAVEDAD.map((estado) => ({ estado: estado as VisitStatus, n: e.estados.get(estado) ?? 0 }))
      .filter((x) => x.n > 0)
    const visitas = [...e.estados.values()].reduce((n, x) => n + x, 0)
    return {
      protocolId,
      code: e.code,
      total: visitas + e.reportes,
      porEstado,
      reportes: e.reportes,
      peor: porEstado[0]?.estado ?? null,
    }
  })

  const rango = (p: PendientesDeProtocolo) => {
    if (p.peor === null) return GRAVEDAD.length // sólo reportes: después de cualquier alerta de visita
    const i = GRAVEDAD.indexOf(p.peor as (typeof GRAVEDAD)[number])
    return i === -1 ? GRAVEDAD.length : i
  }

  return filas.sort(
    (a, b) => rango(a) - rango(b) || b.total - a.total || a.code.localeCompare(b.code),
  )
}
