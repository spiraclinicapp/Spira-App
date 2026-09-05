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
    { version: '0.54', text: 'El panel de novedades abre corto y se recorre adentro, sin salirse de la pantalla.' },
    { version: '0.53', text: 'Elegís en qué módulo abre Spira y, por separado, a dónde te lleva el logo.' },
    { version: '0.52', text: 'El Resumen de Coordinación abre mostrando lo tuyo, con un alternador para ver todo.' },
    { version: '0.51', text: 'En Stock, los lotes de un mismo medicamento se agrupan por total y primer vencimiento.' },
    { version: '0.50', text: 'El Resumen se reorganiza en cuatro tarjetas parejas, y Alertas suma los filtros del día.' },
    { version: '0.49', text: 'Los encabezados de Farmacia entran en un renglón y el texto se lee mejor en toda la app.' },
    { version: '0.48', text: 'El login explica por qué se cerró tu sesión, que ahora caduca a los 30 minutos sin uso.' },
    { version: '0.47', text: 'El encabezado de la visita distingue la fecha del protocolo, la citada y el día que vino.' },
    { version: '0.46', text: 'Una recepción se puede repetir: se abre igual y solo cargás los lotes nuevos.' },
    { version: '0.45', text: 'Las cuentas del centro se crean, se restablecen y se dan de baja desde Ajustes.' },
    { version: '0.44', text: 'Ajustes guarda de verdad: tu cuenta, tus preferencias y quién entra a qué en el centro.' },
    { version: '0.43', text: 'En Pacientes, la tarjeta lleva a la ficha y el recorrido se despliega sin salir de la lista.' },
    { version: '0.42', text: 'La navegación vive en la URL: F5 te deja donde estabas y cada pantalla se comparte por link.' },
    { version: '0.41', text: 'Un procedimiento puede generar varios reportes, cada uno con su plazo.' },
    { version: '0.40', text: 'Los filtros de Farmacia hablan el mismo idioma, y la visita se edita desde donde se abra.' },
    { version: '0.39', text: 'El inicio se rediseña: el saludo, los números de la clínica y las novedades en una pantalla.' },
    { version: '0.38', text: 'Una recepción cargada mal se puede anular: el stock vuelve atrás, con su motivo.' },
    { version: '0.37', text: 'Recepción se lee como un documento: su número, quién la ingresó y el detalle.' },
    { version: '0.36', text: 'Farmacia suma Reportes: el cierre de período, con sus hojas imprimibles.' },
    { version: '0.35', text: 'El historial de una dispensación se lee como una crónica en castellano.' },
    { version: '0.34', text: 'La fila de Visitas del día muestra cuánto lleva avanzada cada visita.' },
    { version: '0.33', text: 'El encabezado de la visita se rediseña: fechas editables en línea y médico por visita.' },
    { version: '0.32', text: 'El escaneo de dispensación cuenta unidades, y el cajón enumera lo que falta.' },
    { version: '0.31', text: 'La visita puede entregar producto en investigación, con la constancia del IRT adjunta.' },
    { version: '0.30', text: 'Track pasa a llamarse Coordinación, y Pharma, Farmacia.' },
    { version: '0.29', text: 'El resumen lleva a cada visita y a cada alerta, y las alertas se pueden descartar.' },
    { version: '0.28', text: 'La visita muestra sus procedimientos con claridad, y lo realizado se marca sin tachar.' },
    { version: '0.27', text: 'Los estados de la visita hablan el vocabulario del centro: cuatro etapas del recorrido.' },
    { version: '0.26', text: 'El nombre del paciente se muestra en toda la app, y encabeza el modal de la visita.' },
    { version: '0.25', text: 'Los desplegables se cierran al tocar fuera, y los bordes vuelven a su color al salir.' },
    { version: '0.24', text: 'El coordinador de la visita se asigna desde el encabezado del modal.' },
    { version: '0.23', text: 'En Visitas del día, el modal encabeza con el nombre del paciente.' },
    { version: '0.22', text: 'Rediseño de Visitas del día: fila y modal nuevos, filtros múltiples y buscador.' },
    { version: '0.21', text: 'Al escribir en los campos de texto se sugiere lo ya cargado, para evitar duplicados.' },
    { version: '0.20', text: 'Medicamentos se editan y se eliminan desde el catálogo.' },
    { version: '0.19', text: 'Dispensaciones es un tablero por estados: preparar, escanear, dejar lista y entregar.' },
    { version: '0.17', text: 'Recepción: detalle por renglón con monodroga, código de barras y vencimiento.' },
    { version: '0.16', text: 'Visitas: detalle del paciente, ruta del día y derivación al médico.' },
    { version: '0.15', text: 'Ajustes: pantalla propia desde tu cuenta, con perfil editable y control de tema.' },
    { version: '0.14', text: 'Buscador global (Ctrl/⌘ K), menú de usuario y notificaciones en la barra.' },
    { version: '0.13', text: 'Medicamentos por lote, stock y anti-duplicado en Pharma.' },
    { version: '0.12', text: 'Recepción con código de barras y catálogo global de medicamentos.' },
  ] as ChangelogEntry[],
}
