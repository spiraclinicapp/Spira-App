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
    { version: '0.44', text: 'Ajustes deja de ser una maqueta: Mi cuenta guarda de verdad y avisa qué quedó pendiente, tus preferencias viajan con tu cuenta en vez de quedarse en la computadora, y Equipo y accesos muestra quién entra a qué en el centro, con el registro de cada cambio.' },
    { version: '0.43', text: 'En Pacientes, la tarjeta lleva de una vez a la ficha; el recorrido de visitas se despliega desde el botón "Resumen", sin salir de la lista.' },
    { version: '0.42', text: 'La navegación vive en la URL: F5 te deja donde estabas, el botón atrás funciona y cualquier pantalla se comparte por link.' },
    { version: '0.41', text: 'Un procedimiento puede generar varios reportes, cada uno con su plataforma y su plazo: tablero de Reportes pendientes, desglose dentro de la visita y procedimientos del estudio en el cronograma.' },
    { version: '0.40', text: 'Los filtros de Farmacia hablan el mismo idioma en las cinco pantallas, y la visita se edita desde donde se abra: la ficha del paciente, la cola del médico o las alertas, no solo desde Visitas del día.' },
    { version: '0.39', text: 'El inicio se rediseña: el saludo del día, los números de la clínica y las novedades del producto en una sola pantalla. Y los chips de estado ganan contraste en toda la app.' },
    { version: '0.38', text: 'Una recepción cargada mal ahora se puede anular: el stock vuelve atrás y queda registrado el motivo.' },
    { version: '0.37', text: 'Recepción se lee como un documento: cada recepción con su número, quién la ingresó a stock y el detalle por renglón; verificar ahora confirma lo que va a entrar antes de tocar el stock.' },
    { version: '0.36', text: 'Farmacia suma Reportes: el cierre de período, con sus hojas imprimibles.' },
    { version: '0.35', text: 'El historial de una dispensación se lee como una crónica en castellano, y el lector avisa con precisión cuando la caja no pertenece al pedido.' },
    { version: '0.34', text: 'La fila de Visitas del día suma el riel del recorrido: ahora se ve de un vistazo cuánto lleva avanzada cada visita.' },
    { version: '0.33', text: 'El encabezado de la visita se rediseña: fechas editables en línea, médico por visita y el nombre del paciente lleva a su ficha.' },
    { version: '0.32', text: 'El escaneo de dispensación pasa a contar unidades —una pasada del lector por cada envase— y el cajón gana un riel que enumera lo que falta, sustitución por otra presentación del mismo fármaco, reasignación e historial del pedido.' },
    { version: '0.31', text: 'La visita puede entregar producto en investigación: constancia del IRT adjunta, kits declarados al entregar y dispensación fuera de cronograma con motivo, todo en un solo pedido y un solo comprobante.' },
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
