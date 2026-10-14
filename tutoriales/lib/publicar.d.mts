// Tipos de `publicar.mjs` (lo usan su test y, si hiciera falta, la fábrica en TypeScript). El script que publica es
// JS para correr con `node` a secas, sin el cargador de Playwright.
export const BUCKET: 'tutoriales'
export const CUENTA: string
export const ARCHIVOS: Record<'video.mp4' | 'subtitulos.vtt' | 'poster.jpg', string>
export function claveDeObjeto(id: string, version: string, archivo: string): string
export function urlPublica(ref: string, clave: string): string
