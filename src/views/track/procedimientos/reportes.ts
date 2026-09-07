// Reglas puras del circuito de reportes de un procedimiento (0089). Acá vive lo que puede quedar
// al revés SIN verse mal en pantalla: qué plataforma es cuál, cuándo el link es el default y cuándo
// lo tocó el usuario, y qué reportes ya se usaron en el protocolo para ofrecerlos en el combobox.
// Lo visual (colores, chips) se verifica mirando; esto se verifica con `reportes.test.ts`.

/**
 * Clave de plataforma.
 *
 * Era una union de cinco literales, espejo del check de la 0089. Desde la **0111** el catálogo vive
 * en la base (`report_platforms`) y se pueden agregar desde Ajustes, así que la clave es texto: una
 * union mentiría en cuanto alguien cargue una CRO nueva. Lo desconocido sigue cayendo a `otro`.
 */
export type Platform = string

export interface PlatformMeta {
  label: string
  /** Color de marca de la plataforma. NO es un token del sistema: identifica al proveedor, no a un
   *  estado clínico. Por eso vive acá y no en tokens.css. */
  color: string
  /** URL del portal. `null` = todavía no cargada (distinto de "no tiene"). */
  url: string | null
}

/** Una plataforma del catálogo, con su clave. */
export interface PlatformEntry extends PlatformMeta {
  key: Platform
  /** Retirada: no se ofrece para elegir, pero sigue resolviendo los reportes que ya la usan. */
  activa: boolean
}

/**
 * El catálogo de respaldo: las cinco de la 0089, sin URL.
 *
 * ⚠️ NO es la fuente de verdad — desde la 0111 lo es `report_platforms`. Vive acá por dos razones
 * concretas: es lo que se ve mientras la consulta viaja (sin esto, los chips de color parpadearían
 * en gris y el desplegable saldría vacío en el primer render), y es lo que queda si la consulta
 * falla. Las URLs van en null a propósito: en un sistema donde un click manda a la coordinadora a
 * cargar un resultado, un link inventado es peor que ninguno.
 */
export const PLATFORMS_SEED: PlatformEntry[] = [
  { key: 'iqvia',   label: 'IQVIA',           color: '#3A6B8C', url: null, activa: true },
  { key: 'labcorp', label: 'LabCorp',         color: '#5C8A5A', url: null, activa: true },
  { key: 'clario',  label: 'Clario',          color: '#B0823F', url: null, activa: true },
  { key: 'roche4g', label: 'Roche 4G',        color: '#A6483B', url: null, activa: true },
  // 'otro' último: es la salida, no una opción más. Y es el default de la columna en la base, así
  // que es el ÚNICO que no puede faltar — `platformMeta` cae acá cuando no reconoce una clave.
  { key: 'otro',    label: 'Otra plataforma', color: '#7C8C87', url: null, activa: true },
]

/* ─────────────────────────────────────────────────────────────────────────────
   El catálogo vivo.

   Variable de módulo y no un contexto de React, con el mismo criterio que el formato de fecha de
   `lib/dates.ts`: `platformMeta` la llaman cinco lugares desde adentro de funciones puras y de
   `.map()`s, y volverla un hook obligaría a cablear el contexto por todos ellos —incluido
   `resumenDeReportes`, que se testea desde node y no puede montar un provider—.

   Lo que hace que esto NO sea un dato congelado es quién la escribe: `PlatformsProvider`
   (`lib/platforms.tsx`) llama a `setPlatformCatalog` y ADEMÁS guarda las filas en su propio estado,
   así que el subárbol entero re-renderiza y todos los `platformMeta(...)` se recalculan. Es el
   mismo par que usa `prefs.tsx` con `setDateFormat`.

   ⚠️ La trampa conocida de este patrón —un elemento YA CONSTRUIDO guardado en estado, como los
   encabezados que se registran con `setHeader({ content: <X/> })`— no aplica: ninguno de los cinco
   consumidores de `platformMeta` vive en un header registrado. Verificado antes de elegir el patrón.
   Si algún día uno lo hace, va a necesitar el catálogo entre sus deps.
   ───────────────────────────────────────────────────────────────────────────── */

let catalogo: PlatformEntry[] = PLATFORMS_SEED
let porClave: Record<string, PlatformEntry> = Object.fromEntries(PLATFORMS_SEED.map((p) => [p.key, p]))

/**
 * Reemplaza el catálogo con lo que trajo la base. Lo llama SÓLO `PlatformsProvider`.
 *
 * Una lista vacía se ignora: si la consulta devolviera cero filas —RLS que filtró en silencio, o
 * una base a la que todavía no se le aplicó la 0111— quedarse sin catálogo dejaría todos los chips
 * en gris y el desplegable sin opciones, que se ve como una app rota. El respaldo es peor que la
 * verdad pero mucho mejor que nada.
 */
export function setPlatformCatalog(filas: readonly PlatformEntry[]): void {
  if (filas.length === 0) return
  catalogo = [...filas]
  porClave = Object.fromEntries(catalogo.map((p) => [p.key, p]))
}

/** Las plataformas que se pueden ELEGIR hoy, en orden. Las retiradas quedan afuera. */
export function platformList(): PlatformEntry[] {
  return catalogo.filter((p) => p.activa)
}

/** ¿La clave existe en el catálogo vivo? */
export function isPlatform(value: string | null | undefined): value is Platform {
  return value != null && value in porClave
}

/**
 * Metadata de una plataforma, tolerante a valores desconocidos.
 *
 * Resuelve TAMBIÉN las retiradas (`activa: false`), y ese es el punto fino: un reporte histórico
 * cargado con una plataforma que después se dio de baja tiene que seguir mostrando su nombre. Si
 * cayera a "Otra plataforma", el registro perdería el dato en silencio.
 */
export function platformMeta(value: string | null | undefined): PlatformMeta {
  if (value != null && porClave[value]) return porClave[value]
  return porClave.otro ?? PLATFORMS_SEED[PLATFORMS_SEED.length - 1]
}

/**
 * La clave con la que se guarda una plataforma nueva, derivada de su nombre.
 *
 * La clave es la PK de `report_platforms` y lo que queda escrito en `report_definitions.platform`
 * de todos los reportes que la usen: se elige UNA vez y no se toca más. Por eso la deriva el
 * sistema y no se le pide al usuario — nadie tiene por qué saber que "Roche 4G" se guarda como
 * `roche_4g`.
 *
 * Se testea porque falla en silencio de dos maneras. Si produjera una clave inválida, el insert
 * rebota con el check `^[a-z0-9_]+$` y el error de Postgres no explica nada; y si no desempatara
 * las colisiones, cargar "Medidata" cuando ya existe "medidata" tiraría un 23505 sobre la PK — un
 * error de "clave duplicada" para dos nombres que el usuario ve distintos.
 */
export function claveDePlataforma(nombre: string, existentes: readonly string[] = []): string {
  const base =
    nombre
      .normalize('NFD')
      // Saca los diacríticos (Á → A, ñ → n): el check de la base sólo acepta a-z, 0-9 y guión bajo.
      // Escapado y no con los caracteres literales: son marcas combinantes, invisibles en el editor.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'plataforma'
  if (!existentes.includes(base)) return base
  // Desempate por sufijo. Arranca en 2 porque el primero es el que ya está ("clario", "clario_2").
  let n = 2
  while (existentes.includes(`${base}_${n}`)) n++
  return `${base}_${n}`
}

/** URL por defecto de una plataforma, o null si no tiene una cargada. */
export function platformDefaultUrl(value: string | null | undefined): string | null {
  return platformMeta(value).url
}

/**
 * ¿El link que hay en el campo es el default de su plataforma (o está vacío)?
 *
 * Es la pregunta que decide DOS cosas: si aparece el botón de restablecer, y si al cambiar de
 * plataforma el link se pisa solo. Un campo vacío cuenta como "sin tocar": todavía no hay nada
 * que respetar.
 */
export function isDefaultLink(platform: string | null | undefined, link: string | null | undefined): boolean {
  const actual = (link ?? '').trim()
  if (actual === '') return true
  return actual === (platformDefaultUrl(platform) ?? '')
}

/**
 * Qué link corresponde cuando el usuario cambia de plataforma.
 *
 * Si lo que había era el default de la plataforma vieja (o estaba vacío), se pisa con el default
 * de la nueva. Si el usuario lo había editado a mano, se respeta — ese es el "deja de autocompletarse
 * solo mientras el usuario no toque restablecer" del handoff.
 */
export function linkOnPlatformChange(
  prevPlatform: string | null | undefined,
  nextPlatform: string | null | undefined,
  currentLink: string | null | undefined,
): string {
  if (!isDefaultLink(prevPlatform, currentLink)) return (currentLink ?? '').trim()
  return platformDefaultUrl(nextPlatform) ?? ''
}

/**
 * Categorías del catálogo de procedimientos, con su color de identificación.
 *
 * `procedures.category` es texto libre en la base (0061) y se queda así: el seed de la 0061 usa
 * exactamente estos siete nombres, pero un protocolo puede traer el suyo y no hay motivo para
 * bloquearlo. Esta lista es la del desplegable; una categoría que llegue desde la base sin estar
 * acá se muestra igual, sin punto de color.
 *
 * El color va SIEMPRE en un punto, nunca tiñendo el texto: `color: tono` sobre `tono + alpha`
 * queda por debajo del 4.5:1 que pide WCAG (medido en el repo sobre 16 combinaciones).
 */
export const CATEGORIAS: { name: string; color: string }[] = [
  { name: 'Elegibilidad',        color: '#2E7D74' },
  { name: 'Evaluación clínica',  color: '#14302E' },
  { name: 'Cardio-respiratorio', color: '#3A6B8C' },
  { name: 'Laboratorio',         color: '#5C8A5A' },
  { name: 'Cuestionarios',       color: '#B0823F' },
  { name: 'Medicación',          color: '#A8842F' },
  { name: 'Seguridad',           color: '#A6483B' },
]

/** Color de una categoría, o null si no es una de las conocidas (se dibuja sin punto). */
export function categoriaColor(name: string | null | undefined): string | null {
  if (!name) return null
  const n = name.trim().toLowerCase()
  return CATEGORIAS.find((c) => c.name.toLowerCase() === n)?.color ?? null
}

/** Presets del plazo, en horas. El valor libre se carga en el input de al lado (la base acepta 1..8760). */
export const ETA_PRESETS: { value: number; label: string }[] = [
  { value: 1, label: '1 hora' },
  { value: 24, label: '24 horas' },
  { value: 48, label: '48 horas' },
  { value: 72, label: '72 horas' },
  { value: 168, label: '7 días' },
]

/** Unidad del campo de plazo libre. La base SIEMPRE guarda horas; los días son de la UI. */
export type UnidadPlazo = 'h' | 'd'

/** Tope del plazo en cada unidad (espejo de `report_definitions_eta_chk`: 1..8760 horas). */
export const PLAZO_MAX: Record<UnidadPlazo, number> = { h: 8760, d: 365 }

/**
 * Horas que representa un número escrito en la unidad elegida.
 *
 * El mismo "12" son 12 horas o 12 días según el interruptor — pedido explícito del Director: el
 * número no se convierte al cambiar de unidad, cambia lo que significa. Devuelve null solo cuando
 * no hay nada escrito; un valor fuera de rango vuelve como número para que `etaValida` lo rechace
 * con un mensaje, en vez de desaparecer en silencio.
 */
export function horasDesde(texto: string, unidad: UnidadPlazo): number | null {
  const t = texto.trim()
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return unidad === 'd' ? n * 24 : n
}

/**
 * Con qué número y en qué unidad arranca el campo de plazo libre.
 *
 * Vacío cuando el plazo guardado es uno de los chips: eso ya lo dice el chip encendido y repetirlo
 * en el campo sería decir dos veces lo mismo. Si no, se muestra en DÍAS cuando el plazo es múltiplo
 * exacto de 24 —quien cargó "6 días" quiere volver a leer 6, no 144— y en horas en cualquier otro caso.
 *
 * Existe como función y no inline porque de acá salió un bug: el campo tomaba su texto de una
 * expresión que lo VACIABA apenas el número tipeado coincidía con un preset, así que escribir "12"
 * era imposible — al teclear el "1" se limpiaba solo y encendía el chip de 1 hora. El campo ahora
 * tiene su propio texto y esta función solo decide el arranque.
 */
export function plazoLibreInicial(hours: number | null | undefined): { texto: string; unidad: UnidadPlazo } {
  if (hours == null) return { texto: '', unidad: 'h' }
  if (ETA_PRESETS.some((p) => p.value === hours)) return { texto: '', unidad: 'h' }
  if (hours % 24 === 0) return { texto: String(hours / 24), unidad: 'd' }
  return { texto: String(hours), unidad: 'h' }
}

/** Presets de duración del procedimiento, en minutos (`procedures.min_estimated`). */
export const DURACION_PRESETS: number[] = [5, 10, 15, 20, 30, 45, 60, 90]

/** ¿El plazo entra en lo que la base acepta (`report_definitions_eta_chk`)? Null = no vence. */
export function etaValida(hours: number | null): boolean {
  if (hours === null) return true
  return Number.isInteger(hours) && hours > 0 && hours <= 8760
}

/** Etiqueta corta del plazo para píldoras y tarjetas ("~48 h", "~2 días"). */
export function etaLabel(hours: number | null): string {
  if (hours === null) return 'Sin plazo'
  if (hours % 24 === 0) {
    const d = hours / 24
    return d === 1 ? '~1 día' : `~${d} días`
  }
  return hours === 1 ? '~1 h' : `~${hours} h`
}

/**
 * Resumen de una línea de los reportes de un procedimiento: cuántos, a dónde van y en cuánto.
 *
 * Reemplaza al viejo "Genera reporte · ETA ~2 días", que decía menos y en un idioma que no es el
 * de nadie ("ETA" es jerga, y el número solo no dice de qué). Lo que la coordinadora necesita ver
 * de un vistazo en la lista es cuánto trabajo genera ese procedimiento y en qué portales cae.
 *
 * El plazo se resume al MÁS LARGO cuando los reportes difieren, porque ése es el que manda: la
 * visita no se cierra hasta que llega el último. Con todos iguales se dice el valor a secas.
 *
 * Devuelve null si no hay reportes, para que quien lo llama decida qué poner en su lugar.
 */
export function resumenDeReportes(
  reports: readonly { platform: string; eta_hours: number | null }[],
): string | null {
  if (reports.length === 0) return null
  const cuenta = `${reports.length} ${reports.length === 1 ? 'reporte' : 'reportes'}`

  const plataformas = [...new Set(reports.map((r) => (isPlatform(r.platform) ? r.platform : 'otro')))]
  const nombres = plataformas.map((p) => platformMeta(p).label)
  const donde =
    nombres.length === 1 ? nombres[0]
    : nombres.length === 2 ? `${nombres[0]} y ${nombres[1]}`
    : `${nombres.length} plataformas`

  const plazos = reports.map((r) => r.eta_hours).filter((h): h is number => h != null)
  const plazo =
    plazos.length === 0 ? 'sin plazo'
    // "hasta" cuando difieren entre sí, o cuando alguno no tiene plazo y otros sí: en los dos
    // casos el número exacto sería una media verdad.
    : plazos.length < reports.length || new Set(plazos).size > 1 ? `hasta ${etaLabel(Math.max(...plazos))}`
    : etaLabel(plazos[0])

  return `${cuenta} · ${donde} · ${plazo}`
}

/** Un reporte ya usado en el protocolo, para ofrecerlo en el combobox de "Nombre del reporte". */
export interface KnownReport {
  name: string
  platform: Platform
  eta_hours: number | null
}

/**
 * Reportes ya cargados en el protocolo, para el combobox del form.
 *
 * Deduplica por (nombre, plataforma) en minúsculas: "Hematología completa" en LabCorp es la MISMA
 * opción aunque esté definida en tres procedimientos distintos, pero "Hematología completa" en
 * IQVIA es otra cosa (otro portal, otro plazo) y tiene que poder elegirse aparte.
 *
 * `excluirId` saca del listado la definición que se está editando: ofrecerse a sí misma como
 * sugerencia no aporta y confunde.
 */
export function knownReports(
  defs: readonly { id: string; name: string; platform: string; eta_hours: number | null }[],
  excluirId?: string,
): KnownReport[] {
  const seen = new Set<string>()
  const out: KnownReport[] = []
  for (const d of defs) {
    if (excluirId && d.id === excluirId) continue
    const name = d.name.trim()
    if (name === '') continue
    const platform: Platform = isPlatform(d.platform) ? d.platform : 'otro'
    const key = `${name.toLowerCase()}|${platform}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, platform, eta_hours: d.eta_hours })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/**
 * Agrupa procedimientos por categoría, en el orden en que las categorías aparecen por primera vez,
 * y con los sin categoría al final. Mismo agrupador visual que el modal de procedimientos de la
 * visita (pedido del handoff).
 */
export function agruparPorCategoria<T extends { category: string | null }>(
  items: readonly T[],
): { categoria: string; items: T[] }[] {
  const SIN = 'Sin categoría'
  const grupos = new Map<string, T[]>()
  for (const it of items) {
    const key = it.category?.trim() || SIN
    const lista = grupos.get(key) ?? []
    lista.push(it)
    grupos.set(key, lista)
  }
  // Los sin categoría van últimos, pase lo que pase con el orden de aparición.
  const claves = [...grupos.keys()].filter((k) => k !== SIN)
  if (grupos.has(SIN)) claves.push(SIN)
  return claves.map((categoria) => ({ categoria, items: grupos.get(categoria) as T[] }))
}
