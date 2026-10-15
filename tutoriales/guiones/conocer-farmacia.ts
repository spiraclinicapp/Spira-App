import { guion } from '../lib/guion'
import type { Escena } from '../lib/guion'

/* Farmacia › el recorrido por el módulo: qué es y para qué sirve cada pantalla (pedido del Director,
   2026-10-14; T8 de docs/plan-tutoriales.md). Se ofrece en «Estudios y pacientes», que es la pantalla en la que
   se cae al entrar a Farmacia (`AppShell.tsx`, el primer submódulo).

   No cambia nada: sólo navega y señala. Se graba contra el demo recién reseteado y con la cuenta `farma`
   (Operador, como la mayoría del equipo). Por eso la voz no nombra botones que un Operador no ve —«Nueva
   recepción» es de Líder o más, `RecepcionView.tsx`—: el video tiene que coincidir con lo que tiene enfrente
   quien lo mira.

   El orden de la barra es el recorrido real de la medicación: lo que entra, lo que hay, lo que sale y lo que hay
   que pedir (comentario de `modules/registry.ts`). La voz lo cuenta en ese orden. */

/** El botón de la barra de la izquierda. Su nombre accesible es el rótulo más el descriptor, en dos `span`. */
const pantalla = (e: Escena, rotulo: string) =>
  e.page.getByRole('navigation').getByRole('button', { name: new RegExp(`^${rotulo}`) })

/** Va a la pantalla por la barra, como lo haría una persona, y espera su título. */
async function ir(e: Escena, rotulo: string) {
  await e.clic(pantalla(e, rotulo))
  await e.page.getByRole('heading', { level: 1, name: rotulo }).waitFor({ timeout: 15_000 })
}

export default guion('conocer-farmacia', {
  cuenta: 'farma',
  pasos: [
    {
      dice: 'Este es el módulo de Farmacia. A la izquierda están sus pantallas, en el orden en que la medicación recorre la farmacia.',
      hace: async (e) => {
        await e.irA('/farmacia/pacientes')
        await e.moverA(pantalla(e, 'Recepción'))
      },
      capitulo: 'El módulo',
      poster: true,
    },
    {
      dice: 'En Estudios y pacientes ves los estudios y quiénes participan en cada uno. Con el buscador encontrás a cualquiera por su nombre.',
      hace: async (e) => { await e.moverA(e.page.getByRole('textbox', { name: 'Buscar protocolos o pacientes' })) },
      capitulo: 'Estudios y pacientes',
    },
    {
      dice: 'Recepción es lo que entra: acá se registra cada envío de medicación que llega al centro.',
      hace: async (e) => {
        await ir(e, 'Recepción')
        /* El título aparece antes que la lista («Cargando…»): se espera a la recepción de la semilla. */
        await e.moverA(e.page.getByRole('main').getByText(/Bufomix/).first())
      },
      capitulo: 'Recepción',
    },
    {
      dice: 'Stock es lo que hay. Tiene tres partes: la medicación de los estudios, la farmacia ambulatoria y el catálogo de todos los medicamentos.',
      hace: async (e) => {
        await ir(e, 'Stock')
        await e.moverA(e.page.getByRole('button', { name: /Farmacia Protocolo/ }))
      },
      capitulo: 'Stock',
    },
    {
      dice: 'Adentro ves cada medicamento con su lote, cuándo vence y cuántas unidades quedan.',
      hace: async (e) => {
        await e.clic(e.page.getByRole('button', { name: /Farmacia Protocolo/ }))
        await e.page.getByText('Vencimiento', { exact: true }).first().waitFor({ timeout: 15_000 })
        await e.moverA(e.page.getByText('Vencimiento', { exact: true }).first())
      },
    },
    {
      dice: 'Dispensaciones es lo que sale. Cada pedido avanza por cuatro columnas: Solicitadas, Preparando, Listas y Entregadas.',
      hace: async (e) => {
        await ir(e, 'Dispensaciones')
        await e.moverA(e.page.getByText('Solicitadas', { exact: true }).first())
      },
      capitulo: 'Dispensaciones',
    },
    {
      dice: 'Cómo se prepara y se entrega un pedido lo explica el tutorial «Dispensar una medicación».',
      hace: async (e) => { await e.moverA(e.page.getByText('Entregadas', { exact: true }).first()) },
    },
    {
      dice: 'En Reposición armás el pedido de medicación de cada estudio: Spira calcula cuánto hace falta pedir.',
      hace: async (e) => {
        await ir(e, 'Reposición')
        await e.moverA(e.page.getByRole('button', { name: /abrir la reposición del estudio/ }).first())
      },
      capitulo: 'Reposición',
    },
    {
      dice: 'Y en Estadísticas están los números del período, por estudio y por medicamento. Desde cada parte se imprime su reporte.',
      hace: async (e) => {
        await ir(e, 'Estadísticas')
        await e.moverA(e.page.getByRole('heading', { level: 2, name: 'Resumen del período' }))
      },
      capitulo: 'Estadísticas',
    },
    {
      dice: 'Si una pantalla tiene un tutorial, al lado del título vas a ver el botón «Cómo se hace».',
      hace: async (e) => { await e.moverA(e.page.getByRole('heading', { level: 1, name: 'Estadísticas' })) },
    },
  ],
})
