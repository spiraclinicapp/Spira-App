import type { IconName } from '../components/Icon'

export interface SubModule {
  key: string
  name: string
  icon: IconName
  /** Descriptor de una línea: QUÉ se hace en esa pantalla. Va como segunda línea del panel
   *  de submódulos y como `title` del botón. Nació de un pedido del Director: "a primera
   *  vista no se entiende qué es cada submódulo". El rótulo solo no alcanzaba y tampoco
   *  podía crecer — "Recepción de medicamentos" mide 195px. De ahí la división del trabajo:
   *  el rótulo nombra, el descriptor explica.
   *
   *  ⚠️ EL DESCRIPTOR TIENE QUE ENTRAR EN UNA LÍNEA: el ancho útil son **145px** con Inter a
   *  11.5px, que salen de 220 (panel) − 24 (padding del panel) − 24 (padding del botón) − 17
   *  (ícono) − 10 (gap). NO cuentes caracteres: "Pendientes y vencimientos" son 25 y mide
   *  145,53px — se pasa por medio píxel y envuelve. Medilo, con la fuente ya cargada:
   *
   *    const s = document.createElement('span')
   *    s.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;' +
   *      'font-family:var(--spira-font-text);font-size:11.5px;font-weight:400'
   *    document.body.appendChild(s); s.textContent = 'tu texto'
   *    s.getBoundingClientRect().width   // ≤ 145
   *
   *  (Este comentario decía 133px y el panel de 208 del que salía ese número ya no existe:
   *  se ensanchó a 220 justamente porque "Información de pacientes" —137,9px— envolvía.)
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
  /** Módulo aún no construido: NO le aparece a nadie en el riel, sin importar el rol, no se puede
   *  entrar y tampoco se puede elegir como pantalla de inicio (la regla única está en
   *  `moduloHabilitado`, en `lib/home.ts`). Hasta el 2026-09-04 se dibujaba con candado; el porqué
   *  de sacarlo está en el riel de `AppShell`. Se saca el flag cuando el módulo exista de verdad. */
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
      { key: 'alertas', name: 'Pendientes', icon: 'bell' },
    ],
  },
  {
    key: 'track', name: 'Coordinación', full: 'Spira Coordinación', icon: 'activity',
    /* #2B766D y no #2E7D74: la tinta papel sobre el teal viejo daba 4,33:1 y el botón primario
       —que usa `accentSolid` de fondo en 50 lugares— va a 14px/600, donde AA pide 4,5. Un punto
       más oscuro cierra el número (4,76:1) sin salirse del teal. */
    accent: '#2B766D', accentSolid: '#2B766D',
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
      /* "Pendientes" y no "Alertas" desde el 2026-09-05: la pantalla ya junta clases distintas
         —ventanas vencidas y reportes fuera de plazo— y va a sumar visitas por reprogramar y
         tareas. "Alertas" nombraba la más grave y dejaba afuera al resto. LA CLAVE NO CAMBIA: es
         la de la URL y la del registro de vistas; sólo cambia el rótulo (mismo criterio que
         Coordinación/Farmacia sobre track/pharma). */
      { key: 'alertas', name: 'Pendientes', icon: 'bell', hint: 'Lo que hay que resolver' },
    ],
  },
  {
    key: 'pharma', name: 'Farmacia', full: 'Spira Farmacia', icon: 'pill',
    // Petróleo, no ámbar: --spira-warn (#B0823F) y el ámbar de identidad (#A8842F) estaban a
    // cuatro dígitos hex, así que "es de Farmacia" y "algo está por vencer" se veían igual.
    // El ámbar queda reservado para advertencia. OJO: este petróleo es el MISMO del módulo Inicio
    // (línea 47), así que en la navegación los dos comparten tono — se distinguen por nombre e
    // ícono, no por color. Si hace falta separarlos, acá va un petróleo propio.
    accent: '#0F5F57', accentSolid: '#0F5F57',
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
      // Rótulo "Estadísticas" (era "Reportes"), decisión del Director del 2026-08-20: lo que se
      // mira ahí son los números del período; los reportes son lo que se IMPRIME desde adentro.
      // La `key` NO cambia — la usan views/registry.tsx, el buscador y las rutas guardadas.
      { key: 'reportes', name: 'Estadísticas', icon: 'barChart', hint: 'Los números del período' },
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
