import { MODULES } from '../modules/registry'

/**
 * El mapeo entre la URL y el estado de navegación de Spira. TODO lo que interpreta o arma una URL
 * vive acá y es una función pura: es lo que permite testearlo sin DOM (vitest corre en entorno node)
 * y lo que hace que cambiar el vocabulario de las URLs sea tocar un archivo y no cazar strings por
 * todo el repo.
 *
 * SLUG ≠ KEY. En la URL van los nombres visibles en castellano (Coordinación, Farmacia, Pacientes,
 * Stock, Estadísticas); en el código y en la base siguen las keys de siempre (track, pharma,
 * protocolos, medicamentos, reportes), que cuelgan de un enum de Postgres, de la RLS y del audit_log
 * y por eso no se renombran. Este archivo es el único traductor entre los dos vocabularios.
 */

export interface UrlState {
  /** Key INTERNA del módulo ('track' | 'pharma' | 'inicio' | …), no el slug. */
  moduleKey: string
  /** Key INTERNA del submódulo ('protocolos' | 'medicamentos' | …). */
  subKey: string
  /** Segmentos que siguen al submódulo: ['EFC18244', '32000740001']. */
  path: string[]
  query: Record<string, string>
}

/* Módulo: key interna → slug visible. Lab y Contable todavía no existen como vista, pero tienen
   slug igual: la URL los reconoce y el guard de acceso los manda a la pantalla de §8 del spec. */
const MODULE_SLUG: Record<string, string> = {
  inicio: 'inicio',
  track: 'coordinacion',
  pharma: 'farmacia',
  lab: 'lab',
  contable: 'contable',
}

/* Submódulo: key interna → slug visible. Solo los tres que se renombraron en pantalla; el resto es
   identidad. No hay colisiones posibles porque el módulo ya desambigua (hay 'alertas' en Inicio y en
   Coordinación, y las dos son 'alertas'). */
const SUB_SLUG: Record<string, string> = {
  protocolos: 'pacientes',
  medicamentos: 'stock',
  reportes: 'estadisticas',
}

const MODULE_KEY: Record<string, string> = invertir(MODULE_SLUG)
const SUB_KEY: Record<string, string> = invertir(SUB_SLUG)

function invertir(mapa: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(mapa).map(([k, v]) => [v, k]))
}

export function moduleSlug(key: string): string {
  return MODULE_SLUG[key] ?? key
}

export function subSlug(_moduleKey: string, subKey: string): string {
  return SUB_SLUG[subKey] ?? subKey
}

/**
 * URL → estado de navegación. `null` = la ruta no existe; el shell muestra la pantalla de "esa
 * dirección no existe" en vez de un redirect mudo (si te mandaron un link roto, tenés que enterarte).
 */
export function parseUrl(pathname: string, search: string): UrlState | null {
  const query = Object.fromEntries(new URLSearchParams(search))

  /* `decodeURIComponent` LANZA `URIError` ante un porcentaje suelto ("/pacientes/100%"), y esta
     función tiene que devolver `null` ante una URL rota, no explotar — que es justo el caso para el
     que existe el `null`: un link truncado al compartirlo por WhatsApp entra por acá. */
  let segmentos: string[]
  try {
    segmentos = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return null
  }

  // La raíz es la home: Inicio › Resumen.
  if (segmentos.length === 0) return { moduleKey: 'inicio', subKey: 'resumen', path: [], query }

  const [slugModulo, slugSub, ...resto] = segmentos
  const moduleKey = MODULE_KEY[slugModulo]
  if (!moduleKey) return null

  const mod = MODULES.find((m) => m.key === moduleKey)
  if (!mod) return null

  // Módulo sin submódulo: cae al primero, igual que hace selectModule en el shell.
  if (!slugSub) return { moduleKey, subKey: mod.submodules[0].key, path: [], query }

  const subKey = SUB_KEY[slugSub] ?? slugSub
  if (!mod.submodules.some((s) => s.key === subKey)) return null

  return { moduleKey, subKey, path: resto, query }
}

/** Estado de navegación → URL. Es el ÚNICO lugar del repo que arma una URL de Spira. */
export function buildUrl(state: UrlState): string {
  const partes: string[] = []

  // Inicio › Resumen se escribe como la raíz, no como /inicio/resumen: es la home.
  const esHome = state.moduleKey === 'inicio' && state.subKey === 'resumen' && state.path.length === 0
  if (!esHome) {
    partes.push(moduleSlug(state.moduleKey))
    partes.push(subSlug(state.moduleKey, state.subKey))
    partes.push(...state.path)
  }

  const pathname = '/' + partes.map(encodeURIComponent).join('/')
  const query = new URLSearchParams(state.query).toString()
  return query ? `${pathname}?${query}` : pathname
}

/* ─────────────────────────────────────────────────────────────────────────────
   CODECS — cómo va y vuelve cada tipo de valor en el query string.
   Puros y chiquitos a propósito: son lo que permite que useUrlState no tenga
   lógica propia y por lo tanto no necesite jsdom para testearse.
   ───────────────────────────────────────────────────────────────────────────── */

export interface Codec<T> {
  /** `null` = el valor crudo es inválido → quien llama cae al default. */
  parse(raw: string): T | null
  format(value: T): string
}

export const codecs = {
  str: {
    parse: (raw: string) => raw,
    format: (v: string) => v,
  } as Codec<string>,

  /* Multi-valor separado por coma: ?estado=pendiente,en-curso */
  list: {
    parse: (raw: string) => raw.split(',').filter(Boolean),
    format: (v: string[]) => v.join(','),
  } as Codec<string[]>,

  num: {
    parse: (raw: string) => (raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null),
    format: (v: number) => String(v),
  } as Codec<number>,

  /* 1/0 y no true/false: más corto en la barra y sin ambigüedad de mayúsculas. */
  bool: {
    parse: (raw: string) => (raw === '1' ? true : raw === '0' ? false : null),
    format: (v: boolean) => (v ? '1' : '0'),
  } as Codec<boolean>,
}

/** Codec de enum: cualquier valor fuera de la lista es inválido y cae al default. */
export function oneOf<T extends string>(valores: readonly T[]): Codec<T> {
  return {
    parse: (raw: string) => (valores.includes(raw as T) ? (raw as T) : null),
    format: (v: T) => v,
  }
}

/**
 * Codec de LISTA de enum: valida cada elemento y descarta los que no pertenecen.
 *
 * Existe para que los filtros multi-selección (estados, tipos) no tengan que castear `codecs.list`
 * al tipo del enum — un cast así compila pero deja pasar `?estado=inventado` como si fuera un valor
 * legítimo, tipado y todo, sin caer al default. Acá el valor inválido simplemente no entra.
 */
export function listOf<T extends string>(valores: readonly T[]): Codec<T[]> {
  return {
    parse: (raw: string) => raw.split(',').filter((v): v is T => valores.includes(v as T)),
    format: (v: T[]) => v.join(','),
  }
}

/**
 * Lee un parámetro. Un valor ausente, desconocido o inválido cae al default EN SILENCIO: una URL
 * vieja, mal tipeada o recortada por WhatsApp tiene que abrir la pantalla, no un error.
 */
export function readParam<T>(query: Record<string, string>, key: string, def: T, codec: Codec<T>): T {
  const crudo = query[key]
  if (crudo === undefined) return def
  const valor = codec.parse(crudo)
  return valor === null ? def : valor
}

/**
 * Escribe un parámetro sobre una copia del query. **Lo que está en su default no se escribe** — y si
 * vuelve al default, se borra. Es lo que mantiene `/coordinacion/visitas` dictable en vez de una tira
 * de veinte parámetros redundantes.
 */
export function writeParam<T>(
  query: Record<string, string>,
  key: string,
  value: T,
  def: T,
  codec: Codec<T>,
): Record<string, string> {
  const salida = { ...query }
  const esDefault = codec.format(value) === codec.format(def)
  if (esDefault) delete salida[key]
  else salida[key] = codec.format(value)
  return salida
}

/* ─────────────────────────────────────────────────────────────────────────────
   IDENTIFICADORES CORTOS — para lo que no tiene código legible.
   Los usa el paciente sin IVRS (nullable desde la 0021: se asigna en randomización) y la visita
   abierta (su visit_code es "V3" y se repite entre pacientes, así que no identifica).
   ───────────────────────────────────────────────────────────────────────────── */

/** Los primeros 8 caracteres del uuid. 4.300 millones de combinaciones sobre miles de filas. */
export function shortId(uuid: string): string {
  return uuid.slice(0, 8)
}

/**
 * Resuelve un token (prefijo corto o uuid completo) contra las filas ya cargadas.
 *
 * Si DOS filas empatan devuelve `null` y quien llama muestra "no se encontró". Nunca elige una: en
 * una ficha clínica, abrir la del paciente equivocado es peor que no abrir ninguna.
 */
export function resolveShortId<T extends { id: string }>(filas: T[], token: string): T | null {
  const candidatas = filas.filter((f) => f.id.startsWith(token))
  return candidatas.length === 1 ? candidatas[0] : null
}
