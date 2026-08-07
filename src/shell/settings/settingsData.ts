import type { IconName } from '../../components/Icon'

/* ============================================================================
   Datos DE EJEMPLO para las secciones demo de Ajustes (Roles y Ayuda).

   No son datos reales del centro: son placeholders visuales mientras estas
   secciones sean "vista previa". Cuando se conecten a sus fuentes reales
   (gestión de usuarios, ayuda), este archivo se borra. Se mantienen aparte del
   componente para dejar en claro qué es maqueta y qué no.
   ========================================================================== */

export interface TeamMember {
  name: string
  email: string
  rol: string
  estado: 'activo' | 'pendiente'
  visto: string
  /** true = el usuario en sesión (avatar en acento + "· vos"). Demo: siempre el primero. */
  tu?: boolean
}

export interface RoleDef {
  rol: string
  desc: string
  mods: string[]
}

export interface NotifCat {
  key: string
  label: string
  app: boolean
  email: boolean
}

export interface HelpTopic {
  icon: IconName
  title: string
  n: number
}

export interface Shortcut {
  keys: string
  desc: string
}

/** Equipo del centro (demo — Roles y permisos). */
export const DEMO_TEAM: TeamMember[] = [
  { name: 'Dra. Lucía Méndez', email: 'lucia.mendez@ccba.org', rol: 'Administradora', estado: 'activo', visto: 'ahora', tu: true },
  { name: 'Dr. Martín Sosa', email: 'martin.sosa@ccba.org', rol: 'Investigador principal', estado: 'activo', visto: 'hace 2 h' },
  { name: 'Lic. Paula Rivas', email: 'paula.rivas@ccba.org', rol: 'Data manager', estado: 'activo', visto: 'ayer' },
  { name: 'Farm. Nicolás Ferro', email: 'nicolas.ferro@ccba.org', rol: 'Farmacéutico', estado: 'activo', visto: 'hace 3 d' },
  { name: 'Enf. Carla Díaz', email: 'carla.diaz@ccba.org', rol: 'Enfermería', estado: 'pendiente', visto: 'invitación enviada' },
]

/** Roles disponibles + módulos que ven (demo). */
export const DEMO_ROLES: RoleDef[] = [
  { rol: 'Administradora', desc: 'Acceso total y gestión de usuarios', mods: ['Inicio', 'Coordinación', 'Lab', 'Farmacia', 'Contable'] },
  { rol: 'Investigador principal', desc: 'Todos los módulos clínicos', mods: ['Inicio', 'Coordinación', 'Lab', 'Farmacia'] },
  { rol: 'Data manager', desc: 'Seguimiento y datos', mods: ['Inicio', 'Coordinación'] },
  { rol: 'Farmacéutico', desc: 'Farmacia clínica', mods: ['Inicio', 'Farmacia'] },
  { rol: 'Enfermería', desc: 'Agenda y visitas', mods: ['Inicio', 'Coordinación'] },
]

/** Matriz de notificaciones por categoría (demo — estado local). */
export const DEMO_NOTIF_CATS: NotifCat[] = [
  { key: 'queries', label: 'Queries de data management', app: true, email: true },
  { key: 'criticos', label: 'Resultados críticos de laboratorio', app: true, email: true },
  { key: 'visitas', label: 'Visitas y ventanas', app: true, email: false },
  { key: 'stock', label: 'Stock y lotes por vencer', app: true, email: false },
  { key: 'sistema', label: 'Novedades y sistema', app: false, email: false },
]

/** Temas de ayuda (demo). */
export const DEMO_HELP_TOPICS: HelpTopic[] = [
  { icon: 'activity', title: 'Primeros pasos en Spira', n: 8 },
  { icon: 'users', title: 'Gestión de pacientes y visitas', n: 12 },
  { icon: 'pill', title: 'Dispensación y farmacia', n: 6 },
  { icon: 'file', title: 'Protocolos y plantillas', n: 9 },
]

/** Atajos de teclado (reales de la plataforma). */
export const SHORTCUTS: Shortcut[] = [
  { keys: '⌘ K', desc: 'Buscar en toda la plataforma' },
  { keys: 'Esc', desc: 'Cerrar diálogos y menús' },
]
