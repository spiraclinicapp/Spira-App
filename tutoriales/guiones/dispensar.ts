import { guion } from '../lib/guion'
import type { Escena } from '../lib/guion'

/* El piloto (T6, docs/plan-tutoriales.md): Farmacia › dispensar una medicación, de Solicitadas a Entregadas.

   Se graba contra la app del DEMO, recién reseteado (`npm run demo:resetear`): la semilla deja a Héctor Quiroga
   con un pedido «solicitada» de 2 Bufomix (`scripts/demo/semilla.mjs`). La toma GASTA ese pedido (termina
   entregado), así que cada grabación arranca de un reset.

   Lo que dice la voz tiene que ser cierto hoy, como las Preguntas frecuentes (`src/ayuda/preguntas.ts`, la de
   «¿Cómo dispenso una medicación?»): al dispensar se escanea el PRODUCTO, y el lote lo asigna Spira —el que vence
   primero— al marcar lista para retirar. */

/** El GTIN del Bufomix de la semilla: lo que «lee» el lector, que escribe el código y confirma con Enter. */
const CODIGO = '2000000123455'

/** El cajón del pedido. Los botones se buscan ADENTRO: la tarjeta del tablero, detrás, tiene los mismos
 *  («Marcar lista para retirar»). Por rol y no por nombre: el cajón cambia de nombre al avanzar («Solicitud de
 *  dispensación · Preparando» → «D-1-… · Lista para retirar»), y en esta pantalla es el único diálogo. */
const cajon = (e: Escena) => e.page.getByRole('dialog')

export default guion('dispensar', {
  cuenta: 'farma',
  pasos: [
    {
      dice: 'En Farmacia, entrá a Dispensaciones. Los pedidos que llegan desde Coordinación esperan en Solicitadas.',
      hace: async (e) => { await e.irA('/farmacia/dispensaciones') },
      capitulo: 'Entrar a Dispensaciones',
    },
    {
      dice: 'Cada tarjeta muestra el paciente, el medicamento y cuántas unidades pidieron.',
      hace: async (e) => { await e.moverA(e.page.getByText('Héctor Quiroga').first()) },
      poster: true,
    },
    {
      dice: 'Tocá «Preparar»: el pedido pasa a Preparando y se abre el detalle.',
      hace: async (e) => {
        await e.clic(e.page.getByRole('button', { name: 'Preparar' }))
        await e.page.getByLabel('Código de barras').waitFor({ timeout: 15_000 })
      },
      capitulo: 'Preparar el pedido',
    },
    {
      dice: 'Escaneá cada unidad con el lector. Spira controla que sea el medicamento del pedido.',
      hace: async (e) => {
        await e.escribir(e.page.getByLabel('Código de barras'), CODIGO)
        await e.page.keyboard.press('Enter')
      },
      capitulo: 'Escanear',
    },
    {
      dice: 'Una pasada por unidad: el contador muestra cuántas llevás.',
      hace: async (e) => {
        await e.escribir(e.page.getByLabel('Código de barras'), CODIGO)
        await e.page.keyboard.press('Enter')
      },
    },
    {
      dice: 'Con todo escaneado, tocá «Marcar lista para retirar». Spira genera el comprobante, asigna el lote que vence primero y descuenta el stock.',
      hace: async (e) => {
        await e.clic(cajon(e).getByRole('button', { name: 'Marcar lista para retirar' }))
        await cajon(e).getByRole('button', { name: 'Marcar como entregado' }).waitFor({ timeout: 15_000 })
      },
      capitulo: 'Marcar lista',
    },
    {
      dice: 'Cuando el paciente la retira, tocá «Marcar como entregado».',
      hace: async (e) => { await e.clic(cajon(e).getByRole('button', { name: 'Marcar como entregado' })) },
      capitulo: 'Entregar',
    },
    {
      dice: 'Listo: la dispensación queda en Entregadas, con su comprobante.',
      hace: async (e) => { await e.esperar(600) },
    },
  ],
})
