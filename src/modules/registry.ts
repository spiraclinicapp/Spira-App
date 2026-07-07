import type { IconName } from '../components/Icon'

export interface SubModule {
  key: string
  name: string
  icon: IconName
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

/* Orden: los módulos operativos primero (Track, Pharma), los que vienen al final.
   El acceso real por rol lo decide auth (user_module_roles); acentos = hex fijos. */
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
    key: 'track', name: 'Track', full: 'Spira Track', icon: 'activity',
    accent: '#2E7D74', accentSolid: '#2E7D74',
    submodules: [
      { key: 'resumen', name: 'Resumen', icon: 'dashboard' },
      { key: 'protocolos', name: 'Pacientes', icon: 'file' },
      { key: 'visitas', name: 'Visitas', icon: 'activity' },
      { key: 'para-ver-medico', name: 'Para ver médico', icon: 'users' },
      // TEMPORAL: Agenda fuera del menú por pedido del Director. Para reponerla, descomentar
      // esta línea + el botón "Ver agenda del protocolo" (ProtocolDetailView) y las entradas
      // de "Visita" del buscador (searchIndex.ts). La vista y su ruta siguen intactas.
      // { key: 'agenda', name: 'Agenda', icon: 'calendar' },
      { key: 'alertas', name: 'Alertas', icon: 'bell' },
    ],
  },
  {
    key: 'pharma', name: 'Pharma', full: 'Spira Pharma', icon: 'pill',
    accent: '#C9A24A', accentSolid: '#A8842F',
    submodules: [
      { key: 'resumen', name: 'Resumen', icon: 'dashboard' },
      // key 'protocolos' (ruta/vista compartida con Track); rótulo "Pacientes" por pedido
      // del Director, igual que en Track. La grilla sigue siendo la misma ProtocolsView.
      { key: 'protocolos', name: 'Pacientes', icon: 'file' },
      { key: 'medicamentos', name: 'Medicamentos', icon: 'pill' },
      { key: 'recepcion', name: 'Recepción', icon: 'clipboardCheck' },
      { key: 'dispensaciones', name: 'Dispensaciones', icon: 'box' },
      { key: 'reportes', name: 'Reportes', icon: 'barChart' },
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
