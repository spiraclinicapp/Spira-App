/* Versión de plataforma para el popover "Acerca de".
   `app` viene de package.json vía vite define (__APP_VERSION__ — única fuente de la
   versión). `channel` y `changelog` se curan a mano acá con cada release (misma
   disciplina que bumpear package.json + escribir la bitácora). No hay datos
   hardcodeados en la UI: el AboutPanel lee solo de este objeto. */

export interface ChangelogEntry {
  /** Versión en la que entró (badge del changelog). */
  version: string
  /** Qué cambió, en una línea. */
  text: string
}

export const SPIRA_VERSION = {
  /** Versión de la app (de package.json). */
  app: __APP_VERSION__,
  /** Canal de release (chip del popover). */
  channel: 'estable',
  /** Novedades, de la más nueva a la más vieja. */
  changelog: [
    { version: '0.13', text: 'Buscador global (Ctrl/⌘ K), menú de usuario y notificaciones en la barra.' },
    { version: '0.13', text: 'Medicamentos por lote, stock y anti-duplicado en Pharma.' },
    { version: '0.12', text: 'Recepción con código de barras y catálogo global de medicamentos.' },
  ] as ChangelogEntry[],
}
