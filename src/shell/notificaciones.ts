import type { IconName } from '../components/Icon'
import type { ProcedureReportAlertRow } from '../data/reports'
import type { TrackVisitRow, VisitStatus } from '../data/visits'
import { formatAR, formatDateAR } from '../lib/dates'
import { visitTitle } from '../lib/visits'
import type { AlertSeverity } from '../views/alertSeverity'
import {
  esSeveridad, GRAVEDAD, ICONO_REPORTE, SEVERIDAD_ICONO, SEVERIDAD_TINTA, severidadMaxima,
} from '../views/alertSeverity'
import { VISIT_STATES } from '../views/visitStates'

/**
 * Las reglas del desplegable de la campana, sin JSX.
 *
 * Existe porque el panel tenía las suyas escritas inline y una estaba MAL EN PRODUCCIÓN: el rótulo
 * resolvía con un ternario —`ventana_vencida` o, si no, "Reporte de procedimiento fuera de plazo"—
 * y `useVisitAlerts` trae TRES estados. O sea que a una visita a la que el paciente no vino, y a un
 * pendiente vencido, la campana los anunciaba como reportes de procedimiento. Nada fallaba: el
 * panel se veía impecable y mandaba al coordinador a buscar la cosa equivocada.
 *
 * Ese es el criterio de lo que vive acá: lo que puede quedar al revés SIN VERSE. La geometría de la
 * caja, la cascada de entrada y el volteo del popover se verifican mirando; el rótulo de una alerta
 * clínica, el color que le pone gravedad y la fecha que dice cuándo venció, no.
 *
 * Sin base y sin navegador: todo lo que se importa acá es tipo o dato puro.
 *
 * Ver `docs/plan-campana-notificaciones.md` (D2, D5, D10, D11).
 */

/**
 * Las CUATRO clases que la campana muestra: las tres severidades de visita más los reportes de
 * procedimiento pendientes, que vienen de otra consulta y no tienen `computed_status`.
 *
 * El handoff modelaba dos ("reporte pendiente" y "ventana vencida"). Son cuatro, y por eso el
 * ternario que se reemplaza acá agrupaba mal: no había dónde poner las otras dos.
 */
export type ClaseDeAlerta = 'reporte' | AlertSeverity

export interface EstiloDeClase {
  icono: IconName
  /**
   * Token para el GLIFO del ícono y para el punto de la campana. Sale de la familia
   * `--spira-acc-deep-*`, que es la única que se aclara en tema oscuro — un hex crudo como texto
   * o glifo se pierde ahí, y ese es el problema que `SEVERIDAD_TINTA` ya documenta.
   */
  tinta: string
  /**
   * Color BASE del cuadrado teñido que hay detrás del glifo. Puede ser un hex o un `var()`, y por
   * eso SIEMPRE se consume con `tinte()` y nunca concatenando: ver el comentario de esa función.
   */
  base: string
  /** Lo que dice la segunda línea de la caja antes de la fecha. */
  rotulo: string
}

/* Las tres de visita se derivan de `GRAVEDAD` en vez de escribirse a mano: así, el día que aparezca
   un cuarto grado —ya pasó una vez, con `por_reprogramar` en la 0107— la campana lo cubre sola, en
   lugar de dejarlo caer en un `undefined` que recién se ve al desmontarse el topbar. */
const DE_VISITA = Object.fromEntries(
  GRAVEDAD.map((s) => [
    s,
    {
      icono: SEVERIDAD_ICONO[s],
      tinta: SEVERIDAD_TINTA[s],
      base: VISIT_STATES[s].color,
      /* "No vino" usa el rótulo CORTO de su estado y no el largo ("Por reprogramar") porque acá se
         lee seguido de una fecha: "No vino el 02/07/2026" cuenta un hecho, "Por reprogramar el
         02/07/2026" nombra una tarea pendiente en una fecha que ya pasó, que es otra cosa. Los
         otros dos leen bien con el largo. Los dos textos salen de `VISIT_STATES`, así que ninguno
         es copy suelto. */
      rotulo: s === 'por_reprogramar' ? VISIT_STATES[s].short : VISIT_STATES[s].label,
    },
  ]),
) as Record<AlertSeverity, EstiloDeClase>

export const CLASES: Record<ClaseDeAlerta, EstiloDeClase> = {
  ...DE_VISITA,
  reporte: {
    icono: ICONO_REPORTE,
    tinta: 'var(--spira-acc-deep-track)',
    base: 'var(--spira-primary)',
    rotulo: 'Reporte pendiente',
  },
}

/**
 * Un color de fondo teñido, al porcentaje pedido.
 *
 * **Nunca concatenes un sufijo de alpha sobre un color de esta casa.** El panel hacía
 * `const c = 'var(--spira-primary)'` y después `background: c + '18'`, que produce
 * `"var(--spira-primary)18"` — CSS inválido. No hay error ni warning: la declaración se descarta y
 * el cuadrado queda transparente. Estuvo así en producción hasta este cambio. Con un hex crudo el
 * truco sí funciona (`'#A6483B' + '18'` es un hex de 8 dígitos), y por eso las filas de visita se
 * veían bien y las de reporte no: **la mitad que funciona es la que esconde el bug**.
 *
 * `color-mix` acepta las dos formas, así que `CLASES[...].base` puede ser hex o token sin que quien
 * lo consume tenga que saber cuál le tocó.
 */
export function tinte(color: string, porcentaje: number): string {
  return `color-mix(in srgb, ${color} ${porcentaje}%, transparent)`
}

/* `esSeveridad` y `claseDeAlerta` VIVEN EN `alertSeverity`, junto a `GRAVEDAD` y a las dos tablas
   que indexan. Se reexportan desde acá porque la campana las usa —y porque nacieron acá— pero el
   dueño es aquel archivo: la vista de Pendientes también las necesita, y `views/` importando de
   `shell/` sería una dependencia al revés. */
export { claseDeAlerta, esSeveridad } from '../views/alertSeverity'

/**
 * La fecha que la caja muestra para una alerta de visita.
 *
 * ESPEJA A `anclaDeLaVisita` (`alertDismissalModel`), y no por casualidad: para "no vino" la ventana
 * está en el FUTURO —esa condición existe justamente porque todavía no venció— así que mostrarla
 * diría lo contrario de lo que pasó. Lo que define ese caso es a qué cita no vino el paciente:
 * `estimated_date`. Para las demás la fecha del hecho es el fin de la ventana.
 *
 * `null` cuando no hay ninguna: la caja dibuja un guion, para que el chip de protocolo no se corra
 * hacia abajo y las cajas mantengan el mismo alto.
 */
export function fechaDeVisita(a: TrackVisitRow): string | null {
  const iso =
    a.computed_status === 'por_reprogramar' ? a.estimated_date : a.window_end ?? a.estimated_date
  return iso ? formatAR(iso) : null
}

/**
 * La fecha de una alerta de reporte: cuándo venció el plazo.
 *
 * **No pasa por `formatAR`.** `report_due_at` es un `timestamptz` y `formatAR` espera una fecha pura
 * `YYYY-MM-DD` que parte por guiones: darle un timestamp devuelve basura del tipo
 * `18T21:16:38.446+00:00/07/2026` (ya pasó en el comprobante de dispensación). Va por `formatDateAR`,
 * que resuelve la zona.
 *
 * De paso: el handoff afirma que "las alertas de reporte pendiente no tienen vencimiento" y que por
 * eso llevan guion. Sí lo tienen —es `report_due_at`, la misma columna que ancla su descarte—, así
 * que esta celda casi nunca está vacía.
 */
export function fechaDeReporte(r: ProcedureReportAlertRow): string | null {
  return r.report_due_at ? formatDateAR(r.report_due_at) : null
}

/** La segunda línea de la caja para una alerta de visita: qué visita es y qué le pasa. */
export function motivoDeAlerta(a: TrackVisitRow): string {
  /* Un estado fuera de las tres NO toma prestado el rótulo del grado al que cayó: dice el suyo, que
     `VISIT_STATES` tiene para los ocho. Bajarlo de grado es para que la caja se pueda pintar;
     mentir sobre qué pasó, no. */
  const que = esSeveridad(a.computed_status)
    ? CLASES[a.computed_status].rotulo
    : VISIT_STATES[a.computed_status].label
  const cuando = fechaDeVisita(a)
  return cuando ? `${visitTitle(a)} — ${que} el ${cuando}` : `${visitTitle(a)} — ${que}`
}

/** La segunda línea de la caja para un reporte pendiente: qué reporte y de qué procedimiento. */
export function motivoDeReporte(r: ProcedureReportAlertRow): string {
  return `${CLASES.reporte.rotulo} — ${r.report_name} · ${r.procedure_name}`
}

/**
 * El color del punto de la campana, sobre el conjunto ENTERO de alertas vigentes. `null` = no se
 * dibuja.
 *
 * El handoff lo pide fijo en `--danger`. Eso afirma una gravedad que puede no existir: con tres
 * pendientes vencidos y ninguna ventana, la campana gritaría rojo todos los días y el día que se
 * venza una ventana de verdad no diría nada distinto. Es la misma decisión que `alertSeverity` ya
 * documenta para la cabecera de la tarjeta de alertas, y acá vale igual.
 *
 * `severidadMaxima` sólo sabe de alertas de VISITA. El cuarto grado —sólo reportes pendientes— lo
 * agrega esta función: es el más bajo de la escala, y va en el mismo verde con el que el ícono de
 * la caja ya identifica un reporte, para que el topbar y la lista digan lo mismo.
 */
export function tonoDelPunto(
  visitas: readonly { computed_status: VisitStatus }[],
  /* Sólo importa CUÁNTOS hay: los reportes no tienen grados entre sí. Tipar la fila entera acá
     ataría esta regla a una vista de la base que no necesita leer. */
  reportes: readonly unknown[],
): string | null {
  const severidad = severidadMaxima(visitas)
  if (severidad) return SEVERIDAD_TINTA[severidad]
  return reportes.length > 0 ? CLASES.reporte.tinta : null
}

/**
 * El texto de la píldora de la cabecera: `1 pendiente` / `5 pendientes`.
 *
 * En cero devuelve cadena vacía y no `0 pendientes`: la píldora no se dibuja sin alertas, y si
 * alguien se olvidara de ocultarla, "0 pendientes" es peor que nada — anuncia una sección vacía en
 * el lugar donde se anuncia trabajo.
 */
export function textoDePildora(n: number): string {
  if (n <= 0) return ''
  return n === 1 ? '1 pendiente' : `${n} pendientes`
}
