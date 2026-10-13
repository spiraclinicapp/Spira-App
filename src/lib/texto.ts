/**
 * Minúsculas y sin diacríticos, para que "Muñoz" encuentre "munoz" y "Benítez" encuentre "benitez".
 *
 * Vivía privada en `views/alertFilters.ts`; se mudó acá cuando la necesitaron también la Ayuda y el buscador
 * global (2026-10-13), para no sumar una cuarta copia. Quedan dos copias viejas con la misma idea en
 * `views/track/estadisticas/agregadosEquipo.ts` y `views/track/procedimientos/reportes.ts`.
 */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}
