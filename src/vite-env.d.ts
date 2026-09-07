/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Versión de la app, inyectada en build desde package.json (ver vite.config.ts). */
declare const __APP_VERSION__: string

/* `node:fs`, sólo para los tests que necesitan leer un archivo del repo como texto (hoy uno:
   `styles/capas.test.ts`, que compara el orden de las capas tal como está escrito en
   `tokens.css`). No alcanza con el `?raw` de Vite: vitest reemplaza los CSS por stubs vacíos
   antes de que el import llegue, así que devuelve "".

   El repo NO tiene `@types/node` y no vale sumar la dependencia por UNA firma — mismo criterio
   que el `declare const process` de `vite.config.ts`. Se declara sólo lo que se usa. */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
}
