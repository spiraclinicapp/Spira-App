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
  const segmentos = pathname.split('/').filter(Boolean).map(decodeURIComponent)

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
