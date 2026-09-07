/**
 * Qué secciones tiene Ajustes y cómo se leen desde la URL (`?ajustes=<sección>`).
 *
 * Vive aparte de `SettingsModal.tsx` para poder testearlo: importar el modal arrastra las tres
 * secciones y con ellas el cliente de Supabase, que exige variables de entorno y no puede montarse
 * en un test de node. Misma división que el resto del repo entre las reglas puras y su cáscara.
 */

/* Cuatro secciones. Notificaciones y Ayuda se sacaron (decisión del Director, 2026-08-25): las dos
   eran maqueta entera y ninguna perdía función al irse — los avisos in-app siguen en la campana de
   la top bar (`NotificationsMenu`), y la versión y las novedades ya viven en el popover Acerca de
   (`AboutMenu`), que es de donde salían. Lo único que se fue de verdad son dos atajos de teclado.

   `plataformas` es de la 0111 y va ÚLTIMA a propósito: no corre a ninguna de las que ya estaban, y
   es la única de configuración del centro que no habla de la persona que la abre. Se le muestra a
   todos —saber a qué portal ir a buscar un reporte le sirve a cualquier coordinadora—, pero sólo
   la editan track-leader y gerencia, que es lo que dice la RLS de la 0111. */
export type SettingsSection = 'cuenta' | 'prefs' | 'roles' | 'plataformas'

export const SECCIONES: SettingsSection[] = ['cuenta', 'prefs', 'roles', 'plataformas']

/**
 * El valor crudo de `?ajustes=` → la sección a mostrar, o `null` si Ajustes está cerrado.
 *
 * Un valor presente pero DESCONOCIDO abre en "Mi cuenta" en vez de cerrar: `?ajustes=notif` es un
 * link guardado de cuando esa sección existía, y quien lo abre pidió entrar a Ajustes. Mandarlo a
 * la primera sección respeta esa intención; devolver `null` lo dejaría mirando la pantalla de atrás,
 * convencido de que el link está roto.
 *
 * Ojo con el otro extremo: la cadena vacía SÍ es "cerrado". Es el default del parámetro cuando no
 * está en la URL, así que confundirlo con un valor desconocido abriría Ajustes en cada pantalla.
 */
export function parseSettingsSection(crudo: string): SettingsSection | null {
  if (!crudo) return null
  return (SECCIONES as string[]).includes(crudo) ? (crudo as SettingsSection) : 'cuenta'
}
