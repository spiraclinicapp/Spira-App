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
  /** Si el rol del usuario tiene acceso. Más adelante viene de user_module_roles. */
  allowed: boolean
  submodules: SubModule[]
}

/* Orden: permitidos primero, bloqueados al final. Acentos = hex (no cambian con el tema).
   `allowed` hoy es estático; en el próximo paso se conecta a los roles reales. */
export const MODULES: ModuleDef[] = [
  {
    key: 'inicio', name: 'Inicio', full: 'Inicio', icon: 'dashboard',
    accent: '#0F5F57', accentSolid: '#0F5F57', allowed: true,
    submodules: [
      { key: 'resumen', name: 'Resumen', icon: 'home' },
      { key: 'tareas', name: 'Tareas', icon: 'clipboardCheck' },
      { key: 'alertas', name: 'Alertas', icon: 'bell' },
    ],
  },
  {
    key: 'track', name: 'Track', full: 'Spira Track', icon: 'activity',
    accent: '#2E7D74', accentSolid: '#2E7D74', allowed: true,
    submodules: [
      { key: 'resumen', name: 'Resumen', icon: 'dashboard' },
      { key: 'protocolos', name: 'Protocolos', icon: 'file' },
      { key: 'agenda', name: 'Agenda', icon: 'calendar' },
      { key: 'plantillas', name: 'Plantillas', icon: 'clipboardCheck' },
    ],
  },
  {
    key: 'lab', name: 'Lab', full: 'Spira Lab', icon: 'flask',
    accent: '#5C8A5A', accentSolid: '#5C8A5A', allowed: true,
    submodules: [
      { key: 'muestras', name: 'Muestras', icon: 'flask' },
      { key: 'analisis', name: 'Análisis', icon: 'droplet' },
      { key: 'resultados', name: 'Resultados', icon: 'barChart' },
      { key: 'cadena', name: 'Cadena de frío', icon: 'thermometer' },
    ],
  },
  {
    key: 'pharma', name: 'Pharma', full: 'Spira Pharma', icon: 'pill',
    accent: '#C9A24A', accentSolid: '#A8842F', allowed: true,
    submodules: [
      { key: 'resumen', name: 'Resumen', icon: 'dashboard' },
      { key: 'protocolos', name: 'Protocolos', icon: 'file' },
      { key: 'medicamentos', name: 'Medicamentos', icon: 'pill' },
      { key: 'dispensaciones', name: 'Dispensaciones', icon: 'box' },
      { key: 'reportes', name: 'Reportes', icon: 'barChart' },
    ],
  },
  {
    key: 'contable', name: 'Contable', full: 'Spira Contable', icon: 'receipt',
    accent: '#3A6B8C', accentSolid: '#3A6B8C', allowed: false,
    submodules: [
      { key: 'facturacion', name: 'Facturación', icon: 'receipt' },
      { key: 'pagos', name: 'Pagos a pacientes', icon: 'creditCard' },
      { key: 'presupuesto', name: 'Presupuesto', icon: 'barChart' },
      { key: 'honorarios', name: 'Honorarios', icon: 'dollar' },
    ],
  },
]
