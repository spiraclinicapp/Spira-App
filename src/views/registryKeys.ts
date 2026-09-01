/**
 * Las claves `"<moduleKey>/<subKey>"` que tienen una vista real detrás.
 *
 * Vive separada de `registry.tsx` por una razón muy concreta: ese archivo importa las veintipico de
 * vistas, que importan la capa de datos, que importa `lib/supabase.ts` — y ese módulo TIRA UN ERROR
 * al cargarse si faltan las variables de entorno, y toca `window.sessionStorage`. En un test de
 * vitest (node, sin navegador y sin `.env`) importar el registry revienta antes de la primera
 * aserción. Acá no hay más que strings, así que se puede importar desde cualquier lado.
 *
 * NO ES UNA COPIA DEL MAPA: es su contrato. `registry.tsx` declara su objeto como
 * `Record<RegisteredView, ViewComponent>`, así que TypeScript rompe la compilación si al mapa le
 * falta una de estas claves o si tiene una de más. Las dos listas no pueden divergir en silencio.
 */
export const REGISTERED_VIEWS = [
  'inicio/resumen',
  'track/resumen',
  'track/protocolos',
  'track/visitas',
  'track/para-ver-medico',
  'track/agenda',
  'track/alertas',
  'pharma/protocolos',
  'pharma/medicamentos',
  'pharma/recepcion',
  'pharma/dispensaciones',
  'pharma/reportes',
] as const

export type RegisteredView = (typeof REGISTERED_VIEWS)[number]

/**
 * ¿El submódulo tiene una vista real (no cae al Placeholder)? Lo usan el buscador global —para no
 * indexar "páginas" que llevarían a una pantalla vacía— y el test de los destinos del Resumen.
 */
export function isViewRegistered(moduleKey: string, subKey: string): boolean {
  return (REGISTERED_VIEWS as readonly string[]).includes(`${moduleKey}/${subKey}`)
}
