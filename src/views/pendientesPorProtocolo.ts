/**
 * ┌─ Cuántos pendientes tiene cada protocolo, y de qué clase ──────────────────────────────────┐
 *
 * Alimenta las tarjetas de protocolo de la pantalla **Pendientes** — el atajo que enfoca la lista
 * de abajo, calcado del que Stock tiene sobre su tabla (`ProtocoloCards`, `MedicamentosView`).
 *
 * POR QUÉ ES UNA FUNCIÓN PURA CON TEST y no un par de `filter` en el JSX: es aritmética que se lee
 * como verdad. Una tarjeta que dice "3" cuando hay 5 no rompe nada y nadie la va a contar a mano —
 * y lo que esconde es trabajo clínico. El modo de falla clásico acá es **olvidarse de una de las
 * cuatro listas**: la pantalla cruza alertas de visita, reportes pendientes, IP sin entregar y
 * procedimientos por retomar, que vienen de consultas distintas, y un conteo que sólo mire una se
 * ve perfectamente normal.
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
  /** Visitas + reportes + IP sin entregar + por retomar + fechas pasadas + sin marcar. Es el número grande de la tarjeta. */
  total: number
  /** Cuántas visitas de cada estado de alerta, en el orden de `GRAVEDAD`. Sin ceros. */
  porEstado: { estado: VisitStatus; n: number }[]
  /** Cuántos reportes pendientes. 0 = no se muestra. */
  reportes: number
  /** Cuántos IP sin entregar (0119). 0 = no se muestra. */
  ips: number
  /** Cuántas visitas con procedimientos para otro día (v0145). 0 = no se muestra. */
  retomar: number
  /** Cuántas visitas con la fecha pasada y la ventana abierta (2026-09-28). 0 = no se muestra. */
  fechaPasada: number
  /** Cuántas visitas finalizadas con procedimientos sin marcar (2026-09-28). 0 = no se muestra. */
  sinMarcar: number
  /** El estado más grave presente, o `null` si el protocolo no tiene alertas de VISITA (sólo
   *  reportes, IP sin entregar o procedimientos por retomar). Ordena y tiñe. */
  peor: VisitStatus | null
}

/**
 * Agrupa las CUATRO listas de la pantalla por protocolo.
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
  /* La tercera lista (0119). Misma forma mínima que un reporte: tampoco tiene `computed_status`.
     Con default para que un llamador que no la pase siga contando igual, pero la pantalla la PASA:
     olvidarla es exactamente el modo de falla que describe el encabezado. */
  ips: readonly ReporteConProtocolo[] = [],
  /* La cuarta lista (v0145): una fila por VISITA que dejó procedimientos para otro día. Misma forma
     mínima. Con default, pero la pantalla la PASA: olvidarla es el modo de falla del encabezado. */
  retomar: readonly ReporteConProtocolo[] = [],
  /* La quinta (2026-09-28): visitas con la fecha pasada y la ventana abierta. Para la base son
     `proxima`, así que NO pueden ir por `visitas` (contarían un estado que no es alerta): van
     aparte, con la forma mínima. Con default, pero la pantalla la PASA. */
  fechaPasada: readonly ReporteConProtocolo[] = [],
  /* La sexta (2026-09-28): una fila por visita FINALIZADA con procedimientos sin marcar. Para la base
     son `realizada`, que no es un estado de alerta: van aparte, como la quinta. Con default, pero la
     pantalla la PASA. */
  sinMarcar: readonly ReporteConProtocolo[] = [],
): PendientesDeProtocolo[] {
  const acc = new Map<string, { code: string; estados: Map<VisitStatus, number>; reportes: number; ips: number; retomar: number; fechaPasada: number; sinMarcar: number }>()
  const entrada = (id: string, code: string) => {
    const previo = acc.get(id)
    if (previo) return previo
    const nuevo = { code, estados: new Map<VisitStatus, number>(), reportes: 0, ips: 0, retomar: 0, fechaPasada: 0, sinMarcar: 0 }
    acc.set(id, nuevo)
    return nuevo
  }

  for (const v of visitas) {
    const e = entrada(v.protocol_id, v.protocol_code)
    e.estados.set(v.computed_status, (e.estados.get(v.computed_status) ?? 0) + 1)
  }
  for (const r of reportes) entrada(r.protocol_id, r.protocol_code).reportes += 1
  for (const r of ips) entrada(r.protocol_id, r.protocol_code).ips += 1
  for (const r of retomar) entrada(r.protocol_id, r.protocol_code).retomar += 1
  for (const r of fechaPasada) entrada(r.protocol_id, r.protocol_code).fechaPasada += 1
  for (const r of sinMarcar) entrada(r.protocol_id, r.protocol_code).sinMarcar += 1

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
      total: visitas + e.reportes + e.ips + e.retomar + e.fechaPasada + e.sinMarcar,
      porEstado,
      reportes: e.reportes,
      ips: e.ips,
      retomar: e.retomar,
      fechaPasada: e.fechaPasada,
      sinMarcar: e.sinMarcar,
      peor: porEstado[0]?.estado ?? null,
    }
  })

  const rango = (p: PendientesDeProtocolo) => {
    if (p.peor === null) return GRAVEDAD.length // sólo reportes, IP o retomar: después de cualquier alerta de visita
    const i = GRAVEDAD.indexOf(p.peor as (typeof GRAVEDAD)[number])
    return i === -1 ? GRAVEDAD.length : i
  }

  return filas.sort(
    (a, b) => rango(a) - rango(b) || b.total - a.total || a.code.localeCompare(b.code),
  )
}
