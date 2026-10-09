/**
 * Qué secciones tiene Ajustes y cómo se leen desde la URL (`?ajustes=<sección>`).
 *
 * Vive aparte de `SettingsModal.tsx` para poder testearlo: importar el modal arrastra las tres
 * secciones y con ellas el cliente de Supabase, que exige variables de entorno y no puede montarse
 * en un test de node. Misma división que el resto del repo entre las reglas puras y su cáscara.
 */

/* Cinco secciones, la última sólo para gerencia. Notificaciones y Ayuda se sacaron (decisión del Director, 2026-08-25): las dos
   eran maqueta entera y ninguna perdía función al irse — los avisos in-app siguen en la campana de
   la top bar (`NotificationsMenu`), y la versión y las novedades ya viven en el popover Acerca de
   (`AboutMenu`), que es de donde salían. Lo único que se fue de verdad son dos atajos de teclado.

   `plataformas` es de la 0111 y va ÚLTIMA a propósito: no corre a ninguna de las que ya estaban, y
   es la única de configuración del centro que no habla de la persona que la abre. Se le muestra a
   todos —saber a qué portal ir a buscar un reporte le sirve a cualquier coordinadora—, pero sólo
   la editan track-leader y gerencia, que es lo que dice la RLS de la 0111. */
/* `feedback` (entrega 2 del spec del 2026-09-17) va ÚLTIMA por el mismo criterio que `plataformas`:
   no corre a ninguna de las que ya estaban. Es la única que no ve todo el mundo — ver `seccionVisible`. */
/* `estudios` (2026-10-09) va justo después de «Equipo y accesos», que es donde se asigna a quién ve
   cada estudio: las dos hablan de los estudios del centro. Es la puerta a los protocolos ajenos desde
   que Coordinación › Estudios y pacientes dejó de tener «Todos» (ver `EstudiosSection`). */
export type SettingsSection = 'cuenta' | 'prefs' | 'roles' | 'estudios' | 'plataformas' | 'feedback'

export const SECCIONES: SettingsSection[] = ['cuenta', 'prefs', 'roles', 'estudios', 'plataformas', 'feedback']

/** Lo que decide qué secciones ve cada quien. */
export interface QuienMira {
  esGerencia: boolean
  /** Líder o más en Coordinación: a quien la RLS de protocolos (0028) le muestra todos. */
  esJefaturaCoordinacion: boolean
}

/**
 * ¿Esta sección va en el menú de esta persona? Dos son de un público acotado:
 *  · «Feedback recibido», de gerencia (la RLS de la 0044 no le devuelve una fila a nadie más).
 *  · «Estudios del centro», de jefatura de Coordinación. A una coordinadora la RLS le devolvería sólo
 *    sus estudios, que ya están en la grilla; y gerencia los tiene todos en la grilla, con pacientes.
 */
export function puedeVerSeccion(section: SettingsSection, quien: QuienMira): boolean {
  if (section === 'feedback') return quien.esGerencia
  if (section === 'estudios') return quien.esJefaturaCoordinacion
  return true
}

/**
 * Qué sección mostrar de verdad. Una sección que no está en tu menú (ver `puedeVerSeccion`) igual se
 * puede pedir: `?ajustes=feedback` es una URL que cualquiera puede escribir o recibir. Cae a
 * «Mi cuenta», igual que una sección desconocida — quien abrió el link pidió entrar a Ajustes.
 *
 * Esto NO es el control de acceso: el control es la RLS. Acá se evita mostrar una pantalla que sólo
 * puede fallar.
 */
export function seccionVisible(section: SettingsSection, quien: QuienMira): SettingsSection {
  return puedeVerSeccion(section, quien) ? section : 'cuenta'
}

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
