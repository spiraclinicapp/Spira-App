// Tipos de lo que la fábrica de tutoriales (TypeScript, `tutoriales/`) usa de `config.mjs`. Sólo eso: el resto
// del módulo lo consumen scripts en JS, que no los necesitan.
export interface ConfigDemo {
  ref: string
  url: string
  publishableKey: string
  secretKey: string
  dbUrl: string | null
  ttsKey: string | null
}
export function leerConfigDemo(opciones?: { requeridas?: string[] }): ConfigDemo
