import { expect } from '@playwright/test'
import { guion } from '../lib/guion'
import type { Escena } from '../lib/guion'

/* Coordinación › agendar una visita y reprogramar la próxima, las dos desde la ficha del paciente (T8, tercera
   tanda: «dale con agendar y reprogramar una visita», 2026-10-15). Un tutorial con dos capítulos, como la pregunta
   frecuente que los junta (`agendar-reprogramar`). Sin `vista`: Visitas ya ofrece «Atender una visita» y la píldora
   es una por pantalla; se llega desde el panel de Ayuda y desde esa pregunta.

   Se graba contra el demo recién reseteado, con la cuenta `coord`. Graciela Funes (P3 de `scripts/demo/semilla.mjs`)
   está randomizada y su V3 W4 cae en dos días, con ventana ±3. La toma le agenda una VNP y le mueve la V3.

   Lo que dice la voz, relevado contra el código:
     · en la ficha de un paciente randomizado, «¿Qué vas a hacer?» ofrece Retest y VNP (y «Continuar pendientes» si
       hay algo esperando): las visitas del estudio ya están en el cronograma (`agendar/opciones.ts`);
     · «Reprogramar» toma la primera visita programada sin fecha real (`lib/visits.ts`), y el modal muestra la
       ventana permitida (`RescheduleModal.tsx`);
     · fuera de la ventana, el formulario se reemplaza por un aviso con «Volver» y «Confirmar igual».
   Desde la ficha no sale ningún aviso al guardar: lo que cambia es el cronograma, y eso es lo que se señala. */

/** El día de hoy en Argentina más `n` días, como lo tipea una persona: sólo dígitos (`ddmmaaaa`); las barras las
 *  pone el campo solo (`enmascararFecha`). */
function fechaEnDias(n: number): string {
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
  const d = new Date(`${hoy}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  const [a, m, dia] = d.toISOString().slice(0, 10).split('-')
  return `${dia}${m}${a}`
}

const dialogo = (e: Escena, nombre: string) => e.page.getByRole('dialog', { name: nombre })

/** Borra lo que tiene el campo de fecha y tipea la nueva, como lo haría una persona. */
async function escribirFecha(e: Escena, campo: ReturnType<Escena['page']['getByPlaceholder']>, n: number) {
  await e.clic(campo)
  await e.page.keyboard.press('Control+A')
  await e.page.keyboard.type(fechaEnDias(n), { delay: 70 })
  await e.page.keyboard.press('Enter')
}

export default guion('agendar-reprogramar', {
  cuenta: 'coord',
  pasos: [
    {
      dice: 'En la ficha del paciente está su cronograma de visitas. Desde acá se agenda una visita nueva y se reprograma la próxima.',
      hace: async (e) => {
        await e.irA('/coordinacion/pacientes/ACME-301/301-0003')
        await e.moverA(e.page.getByRole('button', { name: 'Agendar visita' }))
      },
      capitulo: 'La ficha',
    },
    {
      dice: 'Para agendar, pulsá el botón «Agendar visita».',
      hace: async (e) => {
        await e.clic(e.page.getByRole('button', { name: 'Agendar visita' }))
        await expect(dialogo(e, 'Agendar visita').getByText('Cargando visitas…')).toHaveCount(0, { timeout: 15_000 })
      },
      capitulo: 'Agendar',
    },
    {
      dice: 'Elegí qué vas a hacer. Por ejemplo, una VNP: una visita no programada.',
      hace: async (e) => {
        await e.clic(dialogo(e, 'Agendar visita').locator('label', { hasText: '¿Qué vas a hacer?' }).getByRole('button'))
        await e.clic(e.page.getByRole('option', { name: 'VNP', exact: true }))
        await expect(dialogo(e, 'Agendar visita').getByText('Cargando procedimientos del estudio…')).toHaveCount(0, { timeout: 15_000 })
      },
    },
    {
      dice: 'Poné la fecha y, si querés, marcá lo que lleva.',
      hace: async (e) => {
        await escribirFecha(e, dialogo(e, 'Agendar visita').getByPlaceholder('dd/mm/aaaa'), 7)
        await e.clic(dialogo(e, 'Agendar visita').getByRole('checkbox', { name: 'Espirometría', exact: true }))
      },
    },
    {
      dice: 'Pulsá el botón «Agendar»: la visita se suma al cronograma.',
      hace: async (e) => {
        await e.clic(dialogo(e, 'Agendar visita').getByRole('button', { name: 'Agendar', exact: true }))
        await dialogo(e, 'Agendar visita').waitFor({ state: 'hidden', timeout: 15_000 })
        await e.moverA(e.page.getByText(/^Cronograma de visitas/).first())
      },
    },
    {
      dice: 'Para cambiarle la fecha a la próxima visita, pulsá el botón «Reprogramar».',
      hace: async (e) => {
        await e.clic(e.page.getByRole('button', { name: 'Reprogramar', exact: true }))
        await dialogo(e, 'Reagendar visita').waitFor({ timeout: 15_000 })
        await e.moverA(dialogo(e, 'Reagendar visita').getByText(/^Ventana permitida/))
      },
      capitulo: 'Reprogramar',
    },
    {
      dice: 'Arriba ves la ventana permitida. Escribí la nueva fecha y pulsá el botón «Guardar fecha».',
      hace: async (e) => {
        await escribirFecha(e, dialogo(e, 'Reagendar visita').getByPlaceholder('dd/mm/aaaa'), 8)
        await e.clic(dialogo(e, 'Reagendar visita').getByRole('button', { name: 'Guardar fecha' }))
        await dialogo(e, 'Reagendar visita').getByRole('button', { name: 'Confirmar igual' }).waitFor({ timeout: 15_000 })
      },
    },
    {
      dice: 'Si la fecha cae fuera de la ventana, Spira te avisa: pulsá el botón «Volver» para elegir otra, o «Confirmar igual» para dejarla así.',
      hace: async (e) => {
        await e.moverA(dialogo(e, 'Reagendar visita').getByRole('button', { name: 'Confirmar igual' }))
        await e.clic(dialogo(e, 'Reagendar visita').getByRole('button', { name: 'Volver' }))
      },
      capitulo: 'Fuera de la ventana',
    },
    {
      dice: 'Con una fecha dentro de la ventana, se guarda directamente.',
      hace: async (e) => {
        await escribirFecha(e, dialogo(e, 'Reagendar visita').getByPlaceholder('dd/mm/aaaa'), 4)
        await e.clic(dialogo(e, 'Reagendar visita').getByRole('button', { name: 'Guardar fecha' }))
        await dialogo(e, 'Reagendar visita').waitFor({ state: 'hidden', timeout: 15_000 })
      },
    },
    {
      dice: 'Listo: el cronograma ya muestra la visita nueva y la nueva fecha.',
      hace: async (e) => { await e.moverA(e.page.getByText(/^Cronograma de visitas/).first()) },
      /* El póster va acá, con todo hecho: el cronograma con la VNP y la V3 movida. */
      poster: true,
    },
  ],
})
