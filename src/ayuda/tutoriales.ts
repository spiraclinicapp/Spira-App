import type { ModuloAyuda } from './reglas'

/* ============================================================================
   El catálogo de tutoriales en video. Plan: docs/plan-tutoriales.md, «Las dos mitades y la frontera».

   Es la mitad que se escribe a mano: qué tutoriales hay, de qué módulo, en qué pantalla se ofrecen y cómo se
   describen. La otra mitad, `tutoriales.meta.json`, la escribe la fábrica al grabar (versión, duración,
   capítulos, transcripción). La fábrica importa este archivo para no repetir títulos; la app no importa nada
   de la fábrica.

   UN TUTORIAL SIN VERSIÓN EN EL META NO SE VE EN NINGÚN LADO: ni la píldora, ni la pestaña, ni el buscador.
   Así un catálogo que se adelanta a la grabación no promete un video que no existe (honestidad de datos).

   La descripción tiene que ser cierta hoy, como las Preguntas frecuentes: describe lo que el video muestra.
   El `id` no se cambia una vez publicado: es la carpeta del video en Storage y la clave de «visto».
   ============================================================================ */

export interface Tutorial {
  /** Minúsculas con guiones. Es el nombre del guion (`tutoriales/guiones/<id>.ts`) y la carpeta en Storage. */
  id: string
  modulo: ModuloAyuda
  /** La pantalla donde se ofrece, como `"<modulo>/<sub>"` (la clave de `views/registry.tsx`). Una por pantalla. */
  vista?: string
  titulo: string
  /** Una línea: qué enseña. Va en la fila del panel de Ayuda. */
  resumen: string
  /** Dos renglones para el globo de la píldora: qué vas a ver antes de darle play. */
  descripcion: string
}

/** En el orden en que se listan dentro de cada módulo (el de un curso). */
export const TUTORIALES: readonly Tutorial[] = [
  /* —— Coordinación —— */
  {
    /* El primero del curso: qué es cada pantalla. Se ofrece en Resumen, la que se abre al entrar a Coordinación. */
    id: 'conocer-coordinacion',
    modulo: 'track',
    vista: 'track/resumen',
    titulo: 'Conocé Coordinación',
    resumen: 'Para qué sirve cada pantalla del módulo',
    descripcion:
      'Un recorrido por las pantallas de Coordinación: cómo viene el día, los estudios, las visitas, lo pendiente y los números del período.',
  },
  {
    id: 'atender-visita',
    modulo: 'track',
    vista: 'track/visitas',
    titulo: 'Atender una visita',
    resumen: 'De la llegada al fin de la atención',
    descripcion:
      'Desde la fila del paciente: marcás la llegada, iniciás la atención y la finalizás. Spira registra la hora de cada paso.',
  },

  /* —— Farmacia —— */
  {
    /* El primero del curso: qué es cada pantalla. Se ofrece en la que se abre al entrar a Farmacia. */
    id: 'conocer-farmacia',
    modulo: 'pharma',
    vista: 'pharma/protocolos',
    titulo: 'Conocé Farmacia',
    resumen: 'Para qué sirve cada pantalla del módulo',
    descripcion:
      'Un recorrido por las pantallas de Farmacia: lo que entra, lo que hay, lo que sale, lo que hay que pedir y los números del período.',
  },
  {
    id: 'dispensar',
    modulo: 'pharma',
    vista: 'pharma/dispensaciones',
    titulo: 'Dispensar una medicación',
    resumen: 'Preparar el pedido y entregarlo',
    descripcion:
      'Tomás el pedido de Solicitadas, escaneás cada unidad y lo marcás listo para retirar: Spira asigna el lote y descuenta el stock.',
  },
  {
    /* Sin `vista`: Dispensaciones ya ofrece «Dispensar una medicación» y la píldora es una por pantalla. Se llega
       desde el panel de Ayuda y desde la pregunta «¿Puedo dispensar sin un pedido de Coordinación?». */
    id: 'nueva-dispensacion',
    modulo: 'pharma',
    titulo: 'Dispensar sin un pedido',
    resumen: 'Cargar la dispensación desde Farmacia',
    descripcion:
      'Cuando Coordinación no la pidió: elegís al paciente, la visita y la medicación, y la dispensación pasa directo a Preparando.',
  },
]
