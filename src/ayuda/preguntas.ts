import type { Pregunta } from './reglas'

/* ============================================================================
   Preguntas frecuentes. Texto del repo, con el patrón de `lib/glosario.ts`: se versiona con la pantalla que
   describe y se revisa en la PR.

   CADA RESPUESTA TIENE QUE SER CIERTA HOY. Es una app auditable: una respuesta que describe un botón que no
   existe, o un permiso al revés, es peor que no tener la pregunta. Si cambia el flujo, cambia la respuesta en
   la misma PR. Los rótulos de botones van como se ven en pantalla, entre comillas latinas.

   Y se dice «pulsá el botón «X»», no «tocá «X»»: la app la usa gente poco amiga de la tecnología, y nombrar qué
   es (un botón, un ícono, una opción del menú) le dice qué buscar en la pantalla. Es lo mismo que dice la voz de
   los tutoriales (Director, 2026-10-14). Sólo «el botón» cuando lo es: una opción de un menú se «elige».

   La primera tanda (2026-10-13) se relevó contra el código, con cita a archivo y línea de cada dato, antes de
   escribirla. Cosas que ese relevamiento corrigió y conviene no volver a escribir mal:
     · al dispensar NO se escanea el lote: el escaneo valida el producto y el lote lo asigna Spira (el que
       vence primero) al «Marcar lista para retirar» — `data/pharma/dispensations.ts`;
     · la campana no tiene número: tiene un punto; el número es la píldora «N pendientes» de adentro;
     · Farmacia ve todos los estudios sólo POR DEFECTO: desde la 0139 se la puede acotar;
     · las visitas no se buscan desde el buscador global (están sacadas a propósito en `searchIndex.ts`).
   Y una que queda abierta: quién puede registrar una recepción. La pantalla muestra los botones a Líder o más
   (`RecepcionView.tsx`, `hasMinRole('pharma', 'leader')`), pero `lib/permisos.ts` dice que el Operador «puede
   recibir medicación». Hasta que el Director decida, la respuesta no afirma un rol.

   El `id` no se cambia una vez publicado (lo usa el buscador global). El orden del archivo es el orden en que
   se muestran dentro de cada módulo. `modulo` usa la clave interna (track = Coordinación, pharma = Farmacia).
   Párrafos separados por una línea en blanco.
   ============================================================================ */

export const PREGUNTAS: readonly Pregunta[] = [
  /* —— Generales —— */
  {
    id: 'buscar',
    modulo: 'general',
    pregunta: '¿Cómo busco un paciente, un protocolo o un medicamento?',
    respuesta:
      'Pulsá el botón «Buscar…», arriba a la derecha, o apretá Ctrl K (⌘ K en Mac), y escribí el nombre o el número del paciente, o el código, el nombre o el patrocinador del protocolo. Con los chips filtrás por tipo, y con «En» y el nombre del módulo te quedás con lo del módulo donde estás. Un paciente abre su ficha; un medicamento te lleva a Stock.\n\nLas visitas todavía no se pueden buscar desde ahí.',
    palabras: ['buscador', 'ctrl k', 'encontrar', 'estudio'],
  },
  {
    id: 'dar-feedback',
    modulo: 'general',
    pregunta: '¿Cómo aviso un problema o sugiero una mejora?',
    respuesta:
      'Pulsá el botón «i» al pie de la barra de la izquierda y elegí «Dar feedback», o apretá Ctrl+Shift+F (⌘⇧F en Mac). Elegí Sugerencia, Problema o Idea, escribí el mensaje sin datos de pacientes y pulsá el botón «Enviar feedback».\n\nSe adjunta solo el lugar donde estabas, la versión de Spira y tu nombre, y lo ves antes de enviar.',
    palabras: ['error', 'reportar', 'falla', 'sugerencia', 'idea'],
  },
  {
    id: 'por-que-no-veo',
    modulo: 'general',
    pregunta: '¿Por qué no veo un módulo, un estudio o un paciente?',
    respuesta:
      'En la barra de la izquierda aparecen solo los módulos que tenés habilitados. En Coordinación ves los pacientes de los estudios que tenés asignados. En Farmacia, por defecto, ves todos los estudios, aunque se te puede acotar a algunos. Algunas pantallas, como Estadísticas de Coordinación, son solo para Líderes o más y para gerencia.\n\nSi te falta algo, pedíselo a quien coordina tu módulo.',
    palabras: ['permisos', 'acceso', 'no aparece', 'falta'],
  },
  {
    id: 'campana',
    modulo: 'general',
    pregunta: '¿Qué significa el punto de la campana?',
    respuesta:
      'El punto avisa que hay notificaciones que todavía no viste, y toma el color del aviso más importante. Adentro del panel, la píldora «pendientes» cuenta los pendientes clínicos, los mismos de la pantalla Pendientes.\n\nLo que ves con el panel abierto se marca como leído, y también podés pulsar el botón «Marcar como leídas». Lo leído se recuerda en esa computadora.',
    palabras: ['notificaciones', 'avisos', 'alertas', 'leídas'],
  },
  {
    id: 'tema',
    modulo: 'general',
    pregunta: '¿Cómo cambio entre tema claro y oscuro?',
    respuesta:
      'Pulsá el ícono de la luna (o del sol, si estás en oscuro) en la barra de arriba, al lado de «Buscar…». También podés pulsar tu nombre, arriba a la derecha, entrar en «Preferencias» y elegir Claro, Oscuro o Sistema. La elección se guarda en tu cuenta.',
    palabras: ['oscuro', 'modo noche', 'apariencia', 'colores'],
  },

  /* —— Coordinación —— */
  {
    id: 'marcar-llegada',
    modulo: 'track',
    pregunta: '¿Cómo marco que llegó un paciente?',
    respuesta:
      'En Coordinación › Visitas, buscá al paciente y pulsá el botón «Marcar llegada» en su fila; también está en el detalle de la visita. La visita pasa a «Concurrió al centro», al lado del nombre aparece la hora en que llegó y el botón cambia a «Iniciar atención».\n\nSi la visita no es de hoy, Spira te pide confirmar antes.',
    palabras: ['llegada', 'concurrió', 'vino', 'ingreso'],
    tutorial: 'atender-visita',
  },
  {
    id: 'pendientes',
    modulo: 'track',
    pregunta: '¿Qué aparece en Pendientes y cómo se resuelve?',
    respuesta:
      'Pendientes junta lo que hay que resolver en tus estudios: ventanas vencidas, visitas por reprogramar o por retomar, procedimientos sin marcar, IP sin entregar y reportes pendientes, entre otros. Pulsá un pendiente para abrir la visita y hacer lo que falta, o usá su botón: «Agendar» para reprogramar o retomar, o «Documentar desviación» en una ventana vencida.\n\nSi una alerta no corresponde, la «X» la descarta con un motivo. No se borra nada: vuelve sola si la situación cambia, y las descartadas se ven y se restauran desde «Ver descartados». Descartar lo puede hacer quien coordina ese estudio, o gerencia.',
    palabras: ['alertas', 'vencida', 'desviación', 'descartar'],
  },
  {
    id: 'agendar-reprogramar',
    modulo: 'track',
    pregunta: '¿Cómo agendo o reprogramo una visita?',
    respuesta:
      'Para agendar, en la ficha del paciente pulsá el botón «Agendar visita», o en Visitas, vista Día, el botón «Agregar visita», y elegí qué vas a hacer: una visita del estudio, un Retest, una VNP o continuar pendientes. Para reprogramar, pulsá el botón «Reprogramar» en la ficha, o elegí «Reprogramar» en el menú de la fila en Visitas; después elegí la nueva fecha y pulsá el botón «Guardar fecha». Si la fecha cae fuera de la ventana, Spira te avisa y tenés que pulsar el botón «Confirmar igual».\n\nSolo se reprograma una visita que todavía no tiene fecha real.',
    palabras: ['agenda', 'turno', 'fecha', 'ventana', 'retest'],
  },
  {
    id: 'para-ver-medico',
    modulo: 'track',
    pregunta: '¿Qué es «Para ver médico»?',
    respuesta:
      'Es la cola de pacientes que están en el centro y necesitan ver al médico, ordenada por quién espera hace más. Se suma a alguien desde Visitas con «Atención médica» y un motivo, y solo cuando ya llegó. Cuando el médico lo atiende, pulsá el botón «Marcar visto»: pasa a Atendidos, y con «Deshacer» vuelve a la cola.',
    palabras: ['médico', 'cola', 'atención médica', 'espera'],
  },

  /* —— Farmacia —— */
  {
    id: 'dispensar',
    modulo: 'pharma',
    pregunta: '¿Cómo dispenso una medicación?',
    respuesta:
      'El pedido llega desde la visita, cuando Coordinación pulsa el botón «Solicitar dispensación», o lo cargás vos con el botón «Nueva dispensación», y aparece en Dispensaciones, en Solicitadas. Pulsá el botón «Preparar», escaneá cada unidad con el lector y, con todo escaneado, pulsá el botón «Marcar lista para retirar»: ahí se genera el comprobante, Spira asigna el lote que vence primero y descuenta el stock.\n\nCuando se retira la medicación, pulsá el botón «Marcar como entregado».',
    palabras: ['dispensación', 'entregar', 'escanear', 'código de barras', 'retirar'],
    tutorial: 'dispensar',
  },
  {
    id: 'dispensar-sin-pedido',
    modulo: 'pharma',
    pregunta: '¿Puedo dispensar sin un pedido de Coordinación?',
    respuesta:
      'Sí. En Dispensaciones, pulsá el botón «Nueva dispensación» y, en «De protocolo», elegí al paciente y la visita en la que se entrega; si vino sin turno, pulsá el botón «Registrar una visita no programada de hoy». Agregá la medicación (sólo aparece la que el paciente tiene habilitada) y pulsá el botón «Crear y preparar»: la dispensación pasa directo a Preparando y se sigue como cualquier pedido.\n\nSi quien se la lleva no es paciente de un estudio, elegí «Ambulatoria»: se entrega en el momento y queda asentada en el libro de stock.',
    palabras: ['nueva dispensación', 'sin pedido', 'alta manual', 'ambulatoria', 'visita no programada'],
    tutorial: 'nueva-dispensacion',
  },
  {
    id: 'escaneo-no-corresponde',
    modulo: 'pharma',
    pregunta: '¿Qué pasa si el código escaneado no corresponde?',
    respuesta:
      'El escaneo no se cuenta y Spira te dice por qué: el código no está en el catálogo, el medicamento no está en el pedido, ya tiene todas sus unidades escaneadas o fue sustituido. Si escaneaste algo por error, pulsá el botón «Cancelar» en ese renglón; si hay que cambiar el medicamento, usá el botón «Sustituir».\n\nAl dispensar no se escanea el lote: lo asigna Spira, el que vence primero.',
    palabras: ['escanear', 'código', 'lote', 'lector', 'error'],
  },
  {
    id: 'corregir-entrega',
    modulo: 'pharma',
    pregunta: '¿Puedo corregir una entrega ya confirmada?',
    respuesta:
      'Sí, si sos Líder o más de Farmacia: abrí la entrega en Entregadas, entrá en su menú y elegí «Corregir entrega», ajustá lo que haga falta, elegí un motivo y pulsá el botón «Guardar corrección». El stock se compensa solo.\n\nDesde Coordinación la medicación no se corrige directamente: en la visita, en «Corregir esta entrega» › «La medicación», se pulsa el botón «Pedir corrección a Farmacia».',
    palabras: ['corrección', 'error', 'entrega', 'devolver', 'motivo'],
  },
  {
    id: 'recepcion',
    modulo: 'pharma',
    pregunta: '¿Cómo registro una recepción de medicación?',
    respuesta:
      'En Farmacia › Recepción, pulsá el botón «Nueva recepción» (o «Recibir un pedido», si llega por un pedido de reposición), elegí el tipo y seguí los pasos. La medicación común queda «Pendiente de verificar» hasta que se pulsa el botón «Verificar e ingresar a stock»; el producto en investigación pasa por un doble chequeo y queda cerrado al confirmar.\n\nSi no ves «Nueva recepción», pedíselo a quien lidera Farmacia.',
    palabras: ['recepción', 'ingreso', 'sponsor', 'llegó', 'stock'],
  },
  {
    id: 'reposicion',
    modulo: 'pharma',
    pregunta: '¿Cómo se arma un pedido de reposición?',
    respuesta:
      'En Farmacia › Reposición, entrá al estudio y pulsá el botón «Armar pedido». Para cada medicamento ves la cantidad que calculó Spira y la podés corregir en «Pedir»; lo que queda en 0 no va. Pulsá el botón «Emitir e imprimir»: el pedido queda guardado con su número y se abre la hoja para imprimir.\n\nLa primera vez hay que cargar el día de corte del período. Cuando llega la medicación, se registra en Recepción con «Recibir un pedido».',
    palabras: ['pedido', 'reposición', 'sponsor', 'faltante', 'imprimir'],
  },
]
