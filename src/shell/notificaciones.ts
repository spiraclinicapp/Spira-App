import type { IconName } from '../components/Icon'
import type { ProcedureReportAlertRow } from '../data/reports'
import type { IpDeliveryAlertRow } from '../data/visitIp'
import type { TrackVisitRow, VisitStatus } from '../data/visits'
import { motivoAlertaIp } from '../views/track/ipEstado'
import { daysDiffISO, formatAR, formatDateAR } from '../lib/dates'
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
 * Las CINCO clases que la campana muestra: las tres severidades de visita, los reportes de
 * procedimiento pendientes y el producto en investigación sin entregar (0119). Las dos últimas
 * vienen de consultas propias y no tienen `computed_status`.
 *
 * El handoff modelaba dos ("reporte pendiente" y "ventana vencida"). Eran cuatro, y por eso el
 * ternario que se reemplazó acá agrupaba mal: no había dónde poner las otras dos.
 */
export type ClaseDeAlerta = 'reporte' | 'ip' | AlertSeverity

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
  /* Ámbar de "hay que hacer algo", de la familia `acc-deep` para que se lea en oscuro. No es el rojo
     de ventana vencida: un IP a las 48 h todavía se resuelve con un llamado a Farmacia. */
  ip: {
    icono: 'pill',
    tinta: 'var(--spira-acc-deep-warn)',
    base: 'var(--spira-warn)',
    rotulo: 'IP sin entregar',
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
  const m = momentoDeVisita(a)
  return m ? formatAR(m.iso) : null
}

/**
 * El momento de una alerta de visita: la misma fecha que dice su motivo («venció el 03/10»), y por
 * eso es SÓLO FECHA. La base no sabe a qué hora venció una ventana —`window_end` es un `date`—, así
 * que la tarjeta no inventa una: ver `horaExacta`.
 */
export function momentoDeVisita(a: TrackVisitRow): Momento | null {
  const iso =
    a.computed_status === 'por_reprogramar' ? a.estimated_date : a.window_end ?? a.estimated_date
  return iso ? { iso, soloFecha: true } : null
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

/** La segunda línea de la caja para un IP sin entregar: qué visita y en qué quedó el pedido. */
export function motivoDeIp(r: IpDeliveryAlertRow): string {
  const visita = r.visit_code ?? r.visit_name ?? 'Visita'
  return `${visita} — ${motivoAlertaIp(r.estado)}`
}

/**
 * La fecha de una alerta de IP: cuándo se cumplieron las 48 h. `vence_at` es `timestamptz`, así que
 * va por `formatDateAR` y nunca por `formatAR` (ver `fechaDeReporte`).
 */
export function fechaDeIp(r: IpDeliveryAlertRow): string | null {
  return r.vence_at ? formatDateAR(r.vence_at) : null
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
 * `severidadMaxima` sólo sabe de alertas de VISITA. Los dos grados de abajo los agrega esta
 * función: primero el IP sin entregar (0119) —un kit que no llegó pesa más que un informe por bajar—
 * y al final los reportes pendientes, el más bajo de la escala, en el mismo verde con el que el ícono
 * de la caja ya identifica un reporte, para que el topbar y la lista digan lo mismo.
 */
export function tonoDelPunto(
  visitas: readonly { computed_status: VisitStatus }[],
  /* Sólo importa CUÁNTOS hay: los reportes no tienen grados entre sí. Tipar la fila entera acá
     ataría esta regla a una vista de la base que no necesita leer. */
  reportes: readonly unknown[],
  ips: readonly unknown[] = [],
): string | null {
  const severidad = severidadMaxima(visitas)
  if (severidad) return SEVERIDAD_TINTA[severidad]
  if (ips.length > 0) return CLASES.ip.tinta
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   HANDOFF v2 (`docs/design_handoff_notificaciones_v2/`, plan en `docs/plan-notificaciones-v2.md`)
   El panel pasó de una lista de pendientes a un listado cronológico agrupado por día, con la
   misma tarjeta para todo lo que aparece en la campana. Lo que sigue son sus reglas.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Todo lo que puede ser una tarjeta: las cinco clases clínicas más las tres de Farmacia.
 *
 * El handoff modela cuatro tipos («reporte», «ventana», «vencido», «disp»). Acá hay ocho, porque la
 * campana ya mostraba ocho cosas distintas antes de este rediseño y ninguna dejó de existir. Las
 * tres clínicas del handoff calzan con las nuestras; las demás llevan su propio ícono para no
 * hacerse pasar por otra.
 */
export type TipoDeTarjeta = ClaseDeAlerta | 'dispensacion' | 'correccion' | 'constancia'

export const TIPOS: Record<TipoDeTarjeta, Pick<EstiloDeClase, 'icono' | 'tinta' | 'base'>> = {
  ...CLASES,
  /* El «Dispensación» del handoff: píldora en el verde de «bien» (`#4A7248` en el mock, que es
     `--spira-good`). El glifo va en la familia `acc-deep`, la que se aclara en tema oscuro. */
  dispensacion: { icono: 'pill', tinta: 'var(--spira-acc-deep-good)', base: 'var(--spira-good)' },
  correccion: { icono: 'pencil', tinta: 'var(--spira-acc-deep-teal)', base: 'var(--spira-acc-deep-teal)' },
  constancia: { icono: 'printer', tinta: 'var(--spira-acc-deep-warn)', base: 'var(--spira-warn)' },
}

/**
 * El color del punto de la campana sobre lo NO LEÍDO.
 *
 * Desde el v2 el punto dice «hay algo que no viste» y ya no «hay pendientes»: lo pide el handoff,
 * y la cantidad de pendientes sigue en la píldora de la cabecera. El COLOR, en cambio, sigue el
 * criterio de `tonoDelPunto` y no el rojo fijo del mock: el peor tipo entre lo no leído. Un punto
 * siempre rojo grita igual por un pedido entregado que por una ventana vencida, y el día que importa
 * no dice nada distinto.
 */
const ORDEN_DEL_PUNTO: readonly TipoDeTarjeta[] = [...GRAVEDAD, 'ip', 'reporte', 'correccion', 'constancia', 'dispensacion']

export function tonoDeNoLeidas(tipos: readonly TipoDeTarjeta[]): string | null {
  for (const t of ORDEN_DEL_PUNTO) if (tipos.includes(t)) return TIPOS[t].tinta
  return null
}

/**
 * Cuándo pasó lo que cuenta una tarjeta.
 *
 * `soloFecha` no es un detalle de formato: las alertas de visita se anclan en un `date` de Postgres
 * —la base no sabe a qué hora venció una ventana— y el resto en un `timestamptz`. Con una fecha
 * pura no se puede decir «hace 5 h» ni «16:40 h» sin inventarlo.
 */
export interface Momento {
  iso: string
  soloFecha: boolean
}

/** Un `timestamptz` (o nada) como momento. */
export function momentoDe(ts: string | null | undefined): Momento | null {
  return ts ? { iso: ts, soloFecha: false } : null
}

/* EL HUSO VA FIJO, como en `isoDayAR`, y no sale del navegador. No es sólo coherencia: CI corre en
   UTC, y un test de «la hora exacta» con `getHours()` pasaría en esta máquina y fallaría en la PR
   (ya pasó con otras fechas). Argentina no tiene horario de verano. */
const AR_OFFSET_MS = 3 * 3_600_000
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function enAR(ts: string): Date | null {
  const t = Date.parse(ts)
  return Number.isNaN(t) ? null : new Date(t - AR_OFFSET_MS)
}

/** El día argentino (`YYYY-MM-DD`) del momento. */
export function diaDe(m: Momento): string {
  if (m.soloFecha) return m.iso.slice(0, 10)
  const d = enAR(m.iso)
  if (!d) return m.iso.slice(0, 10)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export type GrupoDeDia = 'hoy' | 'ayer' | 'semana' | 'anteriores'

export const ROTULO_DE_GRUPO: Record<GrupoDeDia, string> = {
  hoy: 'Hoy',
  ayer: 'Ayer',
  semana: 'Esta semana',
  anteriores: 'Anteriores',
}

const ORDEN_DE_GRUPOS: readonly GrupoDeDia[] = ['hoy', 'ayer', 'semana', 'anteriores']

/**
 * El grupo de una tarjeta, por día CALENDARIO (no por 24 h): Hoy (0), Ayer (1), Esta semana (2 a 6),
 * Anteriores (7 o más). Sin momento → Anteriores, al fondo: no hay de qué afirmar que es reciente.
 * Una fecha en el futuro —no debería pasar— cae en Hoy y no en un grupo que no existe.
 */
export function grupoDe(m: Momento | null, hoy: string): GrupoDeDia {
  if (!m) return 'anteriores'
  const d = daysDiffISO(diaDe(m), hoy)
  if (d <= 0) return 'hoy'
  if (d === 1) return 'ayer'
  if (d <= 6) return 'semana'
  return 'anteriores'
}

/**
 * El tiempo relativo de la fila 2: `ahora` (< 1 min), `hace N min` (< 60), `hace N h` (< 24 h) y
 * `hace N d` (días calendario, como el grupo: «Ayer» siempre dice «hace 1 d», aunque hayan pasado
 * 30 h). Una fecha pura no tiene minutos: dice `hoy` o `hace N d`. '' sin momento.
 */
export function tiempoRelativo(m: Momento | null, ahoraMs: number, hoy: string): string {
  if (!m) return ''
  const dias = daysDiffISO(diaDe(m), hoy)
  if (m.soloFecha) return dias <= 0 ? 'hoy' : `hace ${dias} d`
  const t = Date.parse(m.iso)
  if (Number.isNaN(t)) return ''
  const min = Math.floor((ahoraMs - t) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 24 * 60) return `hace ${Math.floor(min / 60)} h`
  return `hace ${Math.max(1, dias)} d`
}

/**
 * La hora exacta del encabezado: `HH:mm h` para Hoy y Ayer (el día ya lo dice el grupo) y
 * `D mmm, HH:mm h` para el resto —«3 oct, 08:00 h»—, con el año si no es el corriente.
 *
 * Una fecha pura dice sólo `D mmm`: la alternativa era «00:00 h», una hora que nadie registró.
 */
export function horaExacta(m: Momento | null, hoy: string): string {
  if (!m) return ''
  const dia = diaDe(m)
  const [y, mes, d] = dia.split('-').map(Number)
  const fecha = `${d} ${MESES[mes - 1]}${String(y) === hoy.slice(0, 4) ? '' : ` ${y}`}`
  if (m.soloFecha) return fecha
  const ar = enAR(m.iso)
  if (!ar) return fecha
  const hora = `${String(ar.getUTCHours()).padStart(2, '0')}:${String(ar.getUTCMinutes()).padStart(2, '0')} h`
  const g = grupoDe(m, hoy)
  return g === 'hoy' || g === 'ayer' ? hora : `${fecha}, ${hora}`
}

/**
 * Para ORDENAR: un número creciente con el tiempo. Una fecha pura cuenta como el FINAL de su día
 * argentino —la ventana vence al terminar `window_end`—, así que dentro de un mismo día queda
 * arriba de los timestamps de ese día. Es el orden que menos miente: no se sabe la hora, pero sí que
 * para el final del día ya había vencido.
 */
function ordenDe(m: Momento | null): number {
  if (!m) return Number.NEGATIVE_INFINITY
  if (m.soloFecha) {
    const t = Date.parse(`${m.iso.slice(0, 10)}T23:59:59.999-03:00`)
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
  }
  const t = Date.parse(m.iso)
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
}

/**
 * El listado: los grupos en orden (sin los vacíos) y, adentro, de la más reciente a la más antigua.
 * El orden es ESTABLE: a igual momento, se respeta el orden de entrada.
 */
export function agruparPorDia<T>(
  items: readonly T[],
  momento: (t: T) => Momento | null,
  hoy: string,
): { grupo: GrupoDeDia; rotulo: string; items: T[] }[] {
  const ordenados = items
    .map((t, i) => ({ t, i, o: ordenDe(momento(t)) }))
    .sort((a, b) => (b.o - a.o) || (a.i - b.i))
    .map((x) => x.t)
  return ORDEN_DE_GRUPOS
    .map((grupo) => ({
      grupo,
      rotulo: ROTULO_DE_GRUPO[grupo],
      items: ordenados.filter((t) => grupoDe(momento(t), hoy) === grupo),
    }))
    .filter((g) => g.items.length > 0)
}
