// Reglas puras del circuito de reportes de un procedimiento (0089). Acá vive lo que puede quedar
// al revés SIN verse mal en pantalla: qué plataforma es cuál, cuándo el link es el default y cuándo
// lo tocó el usuario, y qué reportes ya se usaron en el protocolo para ofrecerlos en el combobox.
// Lo visual (colores, chips) se verifica mirando; esto se verifica con `reportes.test.ts`.

/** Plataformas donde aparece un reporte. Espejo del check de `report_definitions.platform` (0089). */
export type Platform = 'iqvia' | 'labcorp' | 'clario' | 'roche4g' | 'otro'

export interface PlatformMeta {
  label: string
  /** Color de marca de la plataforma. NO es un token del sistema: identifica al proveedor, no a un
   *  estado clínico. Por eso vive acá y no en tokens.css. */
  color: string
  /** URL por defecto del portal. Ver la nota de DEFAULT_URLS abajo: hoy todas van vacías. */
  url: string | null
}

/**
 * ⚠️ URLs por defecto: VACÍAS a propósito.
 *
 * El handoff pide que el link se autocomplete con la URL de la plataforma elegida, y el mecanismo
 * está entero (autocompletado + botón de restablecer + link pegajoso). Lo que falta es el dato:
 * las direcciones reales de los portales varían por estudio y por sponsor, y en un sistema donde
 * un click manda a la coordinadora a cargar un resultado, un link inventado es peor que ninguno
 * (regla de honestidad de datos del repo).
 *
 * Para activarlo: poner la URL real de cada portal en `url`. El resto ya funciona — apenas una
 * plataforma tenga URL, su campo se autocompleta y aparece el botón de restablecer.
 */
export const PLATFORMS: Record<Platform, PlatformMeta> = {
  iqvia:   { label: 'IQVIA',            color: '#3A6B8C', url: null },
  labcorp: { label: 'LabCorp',          color: '#5C8A5A', url: null },
  clario:  { label: 'Clario',           color: '#B0823F', url: null },
  roche4g: { label: 'Roche 4G',         color: '#A6483B', url: null },
  otro:    { label: 'Otra plataforma',  color: '#7C8C87', url: null },
}

/** Orden de aparición en el desplegable. 'otro' último: es la salida, no una opción más. */
export const PLATFORM_ORDER: Platform[] = ['iqvia', 'labcorp', 'clario', 'roche4g', 'otro']

/** ¿El texto es una plataforma conocida? La base tiene un check, pero el front lee datos que
 *  pueden venir de una versión más nueva del schema: nunca asumir que sí. */
export function isPlatform(value: string | null | undefined): value is Platform {
  return value != null && value in PLATFORMS
}

/** Metadata de una plataforma, tolerante a valores desconocidos (cae a 'otro' en vez de romper). */
export function platformMeta(value: string | null | undefined): PlatformMeta {
  return isPlatform(value) ? PLATFORMS[value] : PLATFORMS.otro
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

/**
 * Con qué texto arranca el input de "otra (h)".
 *
 * Vacío cuando el plazo guardado es uno de los chips (ese lo dice el chip encendido, repetirlo en
 * el input sería decir dos veces lo mismo); con el número cuando es un valor libre.
 *
 * Existe como función y no inline porque de acá salió un bug: el input tomaba su texto de una
 * expresión que lo VACIABA apenas el número tipeado coincidía con un preset, así que escribir "12"
 * era imposible — al teclear el "1" el campo se limpiaba solo y encendía el chip de 1 hora. El
 * input ahora tiene su propio texto y esta función solo decide el arranque.
 */
export function etaLibreInicial(hours: number | null | undefined): string {
  if (hours == null) return ''
  return ETA_PRESETS.some((p) => p.value === hours) ? '' : String(hours)
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
