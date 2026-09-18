/* Cómo se escriben los atajos EN PANTALLA. Vivía adentro de `AppShell` cuando el buscador era el
   único atajo de la app; con el segundo, copiar la detección de plataforma era garantizar que un día
   digan cosas distintas. Acá no se registra ningún atajo: esto es sólo el texto de la tecla. */
const ES_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '')

/** Buscador global (Ctrl/⌘ + K). */
export const KBD_BUSCADOR = ES_MAC ? '⌘ K' : 'Ctrl K'

/** Dar feedback (Ctrl/⌘ + Shift + F). */
export const KBD_FEEDBACK = ES_MAC ? '⌘ ⇧ F' : 'Ctrl ⇧ F'
