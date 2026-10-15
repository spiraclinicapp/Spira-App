import { expect } from '@playwright/test'
import type { Locator } from '@playwright/test'
import { guion } from '../lib/guion'
import type { Escena } from '../lib/guion'

/* Farmacia › una dispensación que Coordinación NO pidió: la carga la farmacéutica con «Nueva dispensación»
   (pedido del Director, 2026-10-14; T8 de docs/plan-tutoriales.md).

   Se graba contra el demo recién reseteado. Graciela Funes (P3 de `scripts/demo/semilla.mjs`) tiene su V3 en dos
   días y el Bufomix habilitado: vino sin turno, así que se le registra una visita no programada de hoy. Es el
   caso más claro de «sin pedido», y no choca con el de Héctor Quiroga, que ya tiene el suyo abierto.

   Lo que dice la voz tiene que ser cierto hoy (relevado contra `PanelNuevaDispensacion.tsx` y
   `DispensacionesView.tsx`): al «Crear y preparar» la dispensación nace con origen Farmacia y pasa directo a
   Preparando, sin esperar en Solicitadas; sólo se puede elegir la medicación que el paciente tiene habilitada; y
   «Ambulatoria» es otro formulario, para quien no es paciente de un estudio. El resto del recorrido (escanear,
   lista, entregar) es el mismo cajón que el de un pedido, y lo cuenta el tutorial «Dispensar una medicación». */

/** El cajón de la nueva dispensación (y después, el de preparación): el único diálogo de la pantalla. */
const cajon = (e: Escena) => e.page.getByRole('dialog')

/** Abre un desplegable y elige la opción que coincide. Con pocas opciones (las del demo) el desplegable no trae
 *  buscador —aparece desde `SEARCH_THRESHOLD`, `SearchableSelect.tsx`—: se elige de la lista. */
async function elegir(e: Escena, disparador: Locator, texto: string) {
  await e.clic(disparador)
  await e.clic(e.page.getByRole('option', { name: new RegExp(texto) }).first())
}

export default guion('nueva-dispensacion', {
  cuenta: 'farma',
  pasos: [
    {
      dice: 'Si un paciente necesita medicación y Coordinación no la pidió, la dispensación la podés cargar vos.',
      hace: async (e) => { await e.irA('/farmacia/dispensaciones') },
      capitulo: 'Nueva dispensación',
    },
    {
      dice: 'En Dispensaciones, pulsá el botón «Nueva dispensación», arriba a la derecha.',
      hace: async (e) => {
        await e.clic(e.page.getByRole('button', { name: 'Nueva dispensación' }))
        await cajon(e).getByRole('button', { name: 'Paciente', exact: true }).waitFor({ timeout: 15_000 })
      },
      poster: true,
    },
    {
      dice: 'Arriba elegís el tipo: «De protocolo», para un paciente de un estudio, o «Ambulatoria», para alguien que no lo es.',
      hace: async (e) => { await e.moverA(cajon(e).getByText('Ambulatoria', { exact: true })) },
    },
    {
      dice: 'Elegí al paciente de la lista.',
      hace: async (e) => { await elegir(e, cajon(e).getByRole('button', { name: 'Paciente', exact: true }), 'Graciela') },
      capitulo: 'Paciente y visita',
    },
    {
      dice: 'Después, la visita en la que se entrega. Si vino sin turno, pulsá el botón «Registrar una visita no programada de hoy»: queda elegida.',
      hace: async (e) => {
        await e.clic(cajon(e).getByRole('button', { name: 'Registrar una visita no programada de hoy' }))
        await expect(cajon(e).getByRole('button', { name: 'Visita que entrega la medicación' })).not.toHaveText(/Elegí la visita|Cargando/, { timeout: 15_000 })
        await e.moverA(cajon(e).getByRole('button', { name: 'Visita que entrega la medicación' }))
      },
    },
    {
      dice: 'Elegí el medicamento: sólo aparece el que el paciente tiene habilitado. Poné la cantidad y pulsá el botón «Agregar».',
      hace: async (e) => {
        await e.clic(cajon(e).getByRole('button', { name: /Medicamento…/ }))
        await e.clic(e.page.getByRole('option', { name: /Bufomix/ }).first())
        await e.moverA(cajon(e).getByLabel('Cantidad'))
        await e.clic(cajon(e).getByRole('button', { name: 'Agregar', exact: true }))
      },
      capitulo: 'Medicación',
    },
    {
      dice: 'Pulsá el botón «Crear y preparar». La dispensación pasa directo a Preparando, sin esperar en Solicitadas.',
      hace: async (e) => {
        await e.clic(cajon(e).getByRole('button', { name: 'Crear y preparar' }))
        await e.page.getByLabel('Código de barras').waitFor({ timeout: 15_000 })
      },
      capitulo: 'Crear y preparar',
    },
    {
      dice: 'Desde acá se sigue igual que un pedido de Coordinación: escaneás cada unidad, la marcás lista para retirar y la entregás.',
      hace: async (e) => { await e.moverA(e.page.getByLabel('Código de barras')) },
    },
  ],
})
