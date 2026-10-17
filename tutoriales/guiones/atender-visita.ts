import { guion } from '../lib/guion'
import type { Escena } from '../lib/guion'

/* Coordinación › Visitas: atender una visita de punta a punta desde su fila — llegada, inicio y fin de la
   atención (T8 de docs/plan-tutoriales.md, segunda tanda: «dale con más tutoriales de Coordinación», 2026-10-15).

   Se graba contra el demo recién reseteado, con la cuenta `coord` (Líder, coordinadora de ACME-301). Rosa Medina
   (P1 de `scripts/demo/semilla.mjs`) tiene su V3 HOY y todavía no llegó; es una visita común, así que al finalizar
   no se pregunta «¿Randomizó?». La toma la gasta (termina realizada): cada grabación arranca de un reset.

   Lo que dice la voz, relevado contra el código:
     · desde la fila ninguno de los tres pasos confirma nada: la fecha es la de hoy (`accionesDeVisita.ts`);
     · después de la llegada, la fila dice «llegó HH:MM» al lado del nombre (`DayVisitRowItem.tsx`,
       `calendario.ts`);
     · al finalizar, si quedaron procedimientos con reporte sin marcar, Spira avisa antes (`useAvisoAlFinalizar`).
       Los de la semilla no tienen reporte, así que el aviso no sale en el video: la voz lo dice, no lo muestra. */

/** La fila de Rosa Medina. Los botones se buscan ADENTRO: hay uno igual por paciente. */
const fila = (e: Escena) => e.page.locator('.vcal-row').filter({ hasText: 'Rosa Medina' })

/** El botón de etapa de la fila, por su texto exacto («Fin de atención» no tiene que confundirse con otro). */
const etapa = (e: Escena, rotulo: string) => fila(e).getByRole('button', { name: rotulo, exact: true })

export default guion('atender-visita', {
  cuenta: 'coord',
  pasos: [
    {
      dice: 'En Visitas ves a los pacientes citados para hoy. Cada fila muestra el paciente, su estudio y en qué etapa está la visita.',
      hace: async (e) => {
        await e.irA('/coordinacion/visitas')
        await e.moverA(fila(e).getByText('Rosa Medina').first())
      },
      capitulo: 'Visitas de hoy',
      resumen: 'En Visitas ves a los citados del día, con su estudio y la etapa de cada visita.',
    },
    {
      dice: 'Cuando el paciente llega, pulsá el botón «Marcar llegada». Queda registrada la hora.',
      hace: async (e) => {
        await e.clic(etapa(e, 'Marcar llegada'))
        await etapa(e, 'Iniciar atención').waitFor({ timeout: 15_000 })
      },
      capitulo: 'La llegada',
      resumen: 'Cuando el paciente llega, pulsá el botón «Marcar llegada»: queda registrada la hora.',
    },
    {
      dice: 'Al lado del nombre aparece la hora de llegada. Cuando empieza la atención, pulsá el botón «Iniciar atención».',
      hace: async (e) => {
        await e.clic(etapa(e, 'Iniciar atención'))
        await etapa(e, 'Fin de atención').waitFor({ timeout: 15_000 })
      },
      capitulo: 'La atención',
      resumen: 'Cuando empieza la atención, pulsá el botón «Iniciar atención».',
    },
    {
      dice: 'Al terminar, pulsá el botón «Fin de atención». Si quedaron procedimientos sin marcar, Spira te avisa antes de cerrarla.',
      hace: async (e) => {
        await e.clic(etapa(e, 'Fin de atención'))
        await fila(e).getByText('Realizada', { exact: true }).first().waitFor({ timeout: 15_000 })
      },
      capitulo: 'El fin',
      resumen: 'Al terminar, pulsá el botón «Fin de atención». Si quedaron procedimientos sin marcar, Spira te avisa.',
    },
    {
      dice: 'Listo: la visita queda en Finalizadas. Si pulsás la fila, se abre el detalle de la visita.',
      /* El estado y no el nombre: el nombre es un link con pista («Abrir la ficha de…»), y quedaba en el póster. */
      hace: async (e) => { await e.moverA(fila(e).getByText('Realizada', { exact: true }).first()) },
      /* El póster va acá, con la visita finalizada. En el primer paso (navega) a 0,8 s la página está en blanco, y en
         los otros el clic llega antes de los 0,8 s: el póster salía con «Guardando…» (toma del 2026-10-15). */
      poster: true,
    },
  ],
})
