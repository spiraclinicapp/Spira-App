/* ============================================================================
   Datos DE EJEMPLO para la sección "Roles y permisos" de Ajustes.

   No son datos reales del centro: son placeholders visuales mientras la sección
   sea "vista previa" (el banner de arriba de la sección lo dice). Cuando se
   conecte a su fuente real —`public.users` + `user_module_roles`, que la RLS ya
   habilita para gerencia— **este archivo se borra entero**. Está aparte del
   componente justamente para que se vea de un vistazo qué es maqueta y qué no.

   Los datos de Notificaciones y Ayuda vivían acá y se fueron con sus secciones
   (2026-08-25). Lo que queda es lo último que falta reemplazar.
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
