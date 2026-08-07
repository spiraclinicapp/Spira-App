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
  /** Canal de release. Si NO es 'estable' (p. ej. 'beta'), el popover lo muestra
      como etiqueta junto al wordmark. */
  channel: 'estable',
  /** Novedades, de la más nueva a la más vieja. */
  changelog: [
    { version: '0.30', text: 'Track pasa a llamarse Coordinación y Pharma, Farmacia; el submenú explica cada submódulo.' },
    { version: '0.29', text: 'El resumen lleva a cada visita y a cada alerta, y las alertas se pueden descartar.' },
    { version: '0.28', text: 'La visita muestra sus procedimientos con claridad: el cuadro explica cuando no hay ninguno y lo realizado se marca sin tachar el nombre.' },
    { version: '0.27', text: 'Los estados de la visita hablan el vocabulario del centro: cuatro etapas del recorrido y dos estados nuevos.' },
    { version: '0.26', text: 'El nombre del paciente se muestra en toda la app; el modal de visita encabeza con el nombre e indica claramente qué visita se está viendo.' },
    { version: '0.25', text: 'Los desplegables se cierran al tocar fuera del panel, y los bordes de campos, casilleros y tarjetas vuelven a su color al salir de cada estado.' },
    { version: '0.24', text: 'El coordinador de la visita se asigna desde el encabezado del modal; el detalle de la visita queda más despejado.' },
    { version: '0.23', text: 'En Visitas del día, el modal de visita encabeza con el nombre del paciente; el protocolo pasa a segundo plano.' },
    { version: '0.22', text: 'Rediseño de Visitas del día: fila y modal nuevos, coordinador por visita, filtros múltiples, agrupación y buscador.' },
    { version: '0.21', text: 'Al escribir en varios campos —nombre comercial de medicación, patrocinante, investigador, especialidad y médico tratante— ahora se sugiere lo ya cargado para evitar duplicados.' },
    { version: '0.20', text: 'Medicamentos: editar y eliminar desde el catálogo. En Visitas, la derivación al médico suma motivo e hilo de comentarios.' },
    { version: '0.19', text: 'Dispensaciones ahora es un tablero por estados: preparar, escanear, dejar lista y entregar, con comprobante impreso y alta manual desde la farmacia.' },
    { version: '0.17', text: 'Recepción: detalle por renglón con monodroga, código de barras, laboratorio y vencimiento.' },
    { version: '0.16', text: 'Visitas: detalle completo del paciente, ruta del día y derivación al médico con motivo.' },
    { version: '0.15', text: 'Ajustes: pantalla propia desde tu cuenta, con perfil editable y control de tema.' },
    { version: '0.14', text: 'Buscador global (Ctrl/⌘ K), menú de usuario y notificaciones en la barra.' },
    { version: '0.13', text: 'Medicamentos por lote, stock y anti-duplicado en Pharma.' },
    { version: '0.12', text: 'Recepción con código de barras y catálogo global de medicamentos.' },
  ] as ChangelogEntry[],
}
