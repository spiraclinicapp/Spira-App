import type { IconName } from '../components/Icon'

export interface SubModule {
  key: string
  name: string
  icon: IconName
  /** Descriptor de una línea: QUÉ se hace en esa pantalla. Va como segunda línea del panel
   *  de submódulos y como `title` del botón. Nació de un pedido del Director: "a primera
   *  vista no se entiende qué es cada submódulo". El rótulo solo no alcanzaba y tampoco
   *  podía crecer — el ancho útil para el rótulo en el panel de 208px es de 133px (medido
   *  con Inter cargada), y "Recepción de medicamentos" mide 195px. De ahí la división del
   *  trabajo: el rótulo nombra, el descriptor explica. Manténlos ≤ 133px (~22 caracteres).
   *  Los submódulos que todavía caen al Placeholder lo dicen ("En construcción") en vez de
   *  prometer una función que no existe. */
  hint?: string
}

export interface ModuleDef {
  key: string
  name: string
  full: string
  icon: IconName
  /** Acento del módulo (hex, constante en ambos temas). */
  accent: string
  /** Relleno sólido para texto papel sobre acento (botones/cards hero). */
  accentSolid: string
  /** Módulo aún no construido: se muestra con candado para TODOS (sin importar el
   *  rol) y no se puede entrar. Se saca el flag cuando el módulo exista de verdad. */
  proximamente?: boolean
  submodules: SubModule[]
}

/* Orden: los módulos operativos primero (Coordinación, Farmacia), los que vienen al final.
   El acceso real por rol lo decide auth (user_module_roles); acentos = hex fijos.

   ⚠️ NOMBRE VISIBLE ≠ CLAVE. Desde el 2026-08-06, por pedido del Director (mismo motivo que
   los descriptores de submódulo: "no se entiende qué es cada cosa"), los dos módulos
   operativos se llaman en pantalla **Coordinación** y **Farmacia** — antes Track y Pharma.
   Las `key` siguen siendo `track` y `pharma`, y NO se tocan: son valores de un enum de
   Postgres del que dependen `user_module_roles`, las policies de RLS y el `audit_log`
   histórico. Renombrarlas sería una migración con reescritura de auditoría, sin ningún
   beneficio para el usuario. Por eso el código, las carpetas (`views/pharma/`, `data/pharma/`)
   y los docs de arquitectura siguen diciendo track/pharma: son el nombre interno. */
export const MODULES: ModuleDef[] = [
  {
    key: 'inicio', name: 'Inicio', full: 'Inicio', icon: 'dashboard',
    accent: '#0F5F57', accentSolid: '#0F5F57',
    submodules: [
      { key: 'resumen', name: 'Resumen', icon: 'home' },
      { key: 'tareas', name: 'Tareas', icon: 'clipboardCheck' },
      { key: 'alertas', name: 'Alertas', icon: 'bell' },
    ],
  },
  {
    key: 'track', name: 'Coordinación', full: 'Spira Coordinación', icon: 'activity',
    accent: '#2E7D74', accentSolid: '#2E7D74',
    submodules: [
      { key: 'resumen', name: 'Resumen', icon: 'dashboard', hint: 'Cómo viene el día' },
      // El ícono pasó de `file` a `users`: el papel contradecía al rótulo y era parte de por
      // qué la fila no se entendía. El descriptor dice la verdad de la vista — se entra por
      // protocolo y los pacientes viven adentro (ProtocolsView).
      { key: 'protocolos', name: 'Pacientes', icon: 'users', hint: 'Información de pacientes' },
      { key: 'visitas', name: 'Visitas', icon: 'activity', hint: 'Las visitas de hoy' },
      // `users` se mudó a Pacientes; una cola de espera se lee mejor con el reloj.
      { key: 'para-ver-medico', name: 'Para ver médico', icon: 'clock', hint: 'Cola de atención' },
      // TEMPORAL: Agenda fuera del menú por pedido del Director. Para reponerla, descomentar
      // esta línea + el botón "Ver agenda del protocolo" (ProtocolDetailView) y las entradas
      // de "Visita" del buscador (searchIndex.ts). La vista y su ruta siguen intactas.
      // { key: 'agenda', name: 'Agenda', icon: 'calendar' },
      { key: 'alertas', name: 'Alertas', icon: 'bell', hint: 'Desvíos y vencimientos' },
    ],
  },
  {
    key: 'pharma', name: 'Farmacia', full: 'Spira Farmacia', icon: 'pill',
    accent: '#C9A24A', accentSolid: '#A8842F',
    /* Tres de estos submódulos son sobre medicación y ninguno se distinguía por su nombre.
       El descriptor los separa por el VERBO: Recepción = lo que entra, Stock = lo que hay,
       Dispensaciones = lo que sale — y ese es también el ORDEN en que se listan, porque es
       el recorrido real de la medicación por la farmacia (pedido del Director). "Recepción"
       además choca con el mostrador de entrada del centro: su descriptor lo desambigua. */
    submodules: [
      // TEMPORAL: Resumen fuera del menú por pedido del Director (2026-08-06). No tenía vista
      // propia —caía al Placeholder— así que no se perdió ninguna función. Para reponerlo,
      // descomentar esta línea; al ser el primero, volvería a ser el submódulo por defecto
      // de Pharma (AppShell usa submodules[0] al entrar al módulo).
      // { key: 'resumen', name: 'Resumen', icon: 'dashboard', hint: 'En construcción' },
      // key 'protocolos' (ruta/vista compartida con Track); rótulo "Pacientes" por pedido
      // del Director, igual que en Track. La grilla sigue siendo la misma ProtocolsView.
      { key: 'protocolos', name: 'Pacientes', icon: 'users', hint: 'Información de pacientes' },
      { key: 'recepcion', name: 'Recepción', icon: 'clipboardCheck', hint: 'Ingreso de medicación' },
      // Rótulo "Stock" (era "Medicamentos"): es la palabra de la farmacéutica y desambigua
      // contra Recepción y Dispensaciones, que también son de medicamentos. La `key` NO
      // cambia — la usan views/registry.tsx, el buscador y las rutas guardadas.
      { key: 'medicamentos', name: 'Stock', icon: 'pill', hint: 'Inventario de medicación' },
      { key: 'dispensaciones', name: 'Dispensaciones', icon: 'box', hint: 'Entrega de medicación' },
      { key: 'reportes', name: 'Reportes', icon: 'barChart', hint: 'En construcción' },
    ],
  },
  {
    key: 'lab', name: 'Lab', full: 'Spira Lab', icon: 'flask',
    accent: '#5C8A5A', accentSolid: '#5C8A5A', proximamente: true,
    submodules: [
      { key: 'muestras', name: 'Muestras', icon: 'flask' },
      { key: 'analisis', name: 'Análisis', icon: 'droplet' },
      { key: 'resultados', name: 'Resultados', icon: 'barChart' },
      { key: 'cadena', name: 'Cadena de frío', icon: 'thermometer' },
    ],
  },
  {
    key: 'contable', name: 'Contable', full: 'Spira Contable', icon: 'receipt',
    accent: '#3A6B8C', accentSolid: '#3A6B8C', proximamente: true,
    submodules: [
      { key: 'facturacion', name: 'Facturación', icon: 'receipt' },
      { key: 'pagos', name: 'Pagos a pacientes', icon: 'creditCard' },
      { key: 'presupuesto', name: 'Presupuesto', icon: 'barChart' },
      { key: 'honorarios', name: 'Honorarios', icon: 'dollar' },
    ],
  },
]
