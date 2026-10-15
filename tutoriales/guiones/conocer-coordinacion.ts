import { expect } from '@playwright/test'
import { guion } from '../lib/guion'
import type { Escena } from '../lib/guion'

/* Coordinación › el recorrido por el módulo: qué es y para qué sirve cada pantalla (T8, segunda tanda,
   2026-10-15). Hermano de `conocer-farmacia`. Se ofrece en Resumen, la pantalla en la que se cae al entrar a
   Coordinación (el primer submódulo; `/coordinacion` sin más cae ahí, `lib/router.ts`).

   No cambia nada: sólo navega y señala. Cuenta `coord`: Líder, que es jefatura (`esJefatura`, `lib/roles.ts`), así
   que ve las ocho pantallas, Estadísticas incluida. Lo que un Líder sin gerencia NO ve —«Cronograma y
   procedimientos» adentro del estudio, la zona «Equipo» de Estadísticas— la voz no lo nombra.

   Relevado contra el código, pantalla por pantalla (los comentarios de `modules/registry.ts` explican los
   nombres): Resumen = cómo viene el día, con tarjetas que llevan a su pantalla; Visitas = el día de trabajo, en Día
   por defecto y también Semana y Mes; Pendientes junta ventanas vencidas, reportes y más; Reportes = los reportes
   pendientes de cada paciente; Tareas = las propias; Estadísticas = sólo jefatura. */

/** El botón de la barra de la izquierda. Su nombre accesible es el rótulo más el descriptor, en dos `span`. */
const pantalla = (e: Escena, rotulo: string) =>
  e.page.getByRole('navigation').getByRole('button', { name: new RegExp(`^${rotulo}`) })

/** Va a la pantalla por la barra, como lo haría una persona, y espera su título y su contenido. */
async function ir(e: Escena, rotulo: string) {
  const caja = await e.moverA(pantalla(e, rotulo))
  await e.clic(pantalla(e, rotulo))
  /* Sale de la barra en horizontal, hacia el contenido. En diagonal rozaba otro botón de la barra («Visitas»),
     su pista se abría cuando el mouse ya se había ido y, con el mouse quieto, nadie la cerraba: quedaba un cartel
     suelto en medio del video (primera toma, 2026-10-15). */
  await e.page.mouse.move(caja.x + caja.width + 260, caja.y + caja.height / 2, { steps: 12 })
  await e.page.getByRole('heading', { level: 1, name: rotulo }).waitFor({ timeout: 15_000 })
  /* El título sale antes que la lista: «Cargando cola…», «Cargando reportes…». */
  await expect(e.page.getByRole('main').getByText(/^Cargando/)).toHaveCount(0, { timeout: 15_000 })
}

export default guion('conocer-coordinacion', {
  cuenta: 'coord',
  pasos: [
    {
      dice: 'Este es el módulo de Coordinación. A la izquierda están sus pantallas.',
      hace: async (e) => {
        await e.irA('/coordinacion/resumen')
        /* El título de la barra y no un botón: el botón abre su pista, y quedaba pegada en el póster del paso
           siguiente (toma del 2026-10-15). */
        await e.moverA(e.page.getByText('Submódulos', { exact: true }))
      },
      capitulo: 'El módulo',
    },
    {
      dice: 'El Resumen muestra cómo viene el día: las visitas de hoy, los atrasados y las próximas visitas. Cada tarjeta te lleva a su pantalla.',
      hace: async (e) => { await e.moverA(e.page.getByRole('button', { name: /^Visitas de hoy:/ })) },
      capitulo: 'Resumen',
      /* El póster va acá: la pantalla ya cargó. En el primer paso, a 0,8 s, todavía está en blanco. */
      poster: true,
    },
    {
      dice: 'En Estudios y pacientes están los estudios del centro. Entrando a uno ves sus pacientes.',
      hace: async (e) => {
        await ir(e, 'Estudios y pacientes')
        await e.moverA(e.page.getByRole('button', { name: /ACME-301/ }).first())
      },
      capitulo: 'Estudios y pacientes',
    },
    {
      dice: 'Visitas es el día de trabajo: los pacientes citados, cada uno con su etapa. Arriba lo cambiás a Semana o a Mes.',
      hace: async (e) => {
        await ir(e, 'Visitas')
        await e.moverA(e.page.getByRole('tab', { name: 'Semana' }))
      },
      capitulo: 'Visitas',
    },
    {
      dice: 'Para ver médico es la cola de los pacientes que están en el centro y esperan al médico.',
      hace: async (e) => {
        await ir(e, 'Para ver médico')
        await e.moverA(e.page.getByText('En la cola', { exact: true }).first())
      },
      capitulo: 'Para ver médico',
    },
    {
      dice: 'En Pendientes está lo que hay que resolver: ventanas vencidas, visitas por reprogramar, reportes sin hacer, entre otras cosas.',
      hace: async (e) => {
        await ir(e, 'Pendientes')
        await e.moverA(e.page.getByRole('button', { name: /^Documentar la desviación de/ }).first())
      },
      capitulo: 'Pendientes',
    },
    {
      dice: 'Reportes junta los reportes pendientes de cada paciente, visita por visita.',
      hace: async (e) => {
        await ir(e, 'Reportes')
        await e.moverA(e.page.getByRole('heading', { level: 1, name: 'Reportes' }))
      },
      capitulo: 'Reportes',
    },
    {
      dice: 'Tareas es tu lista personal: lo que anotaste para no olvidarte.',
      hace: async (e) => {
        await ir(e, 'Tareas')
        await e.moverA(e.page.getByRole('button', { name: 'Nueva tarea' }).first())
      },
      capitulo: 'Tareas',
    },
    {
      dice: 'Y Estadísticas, que ven los Líderes y gerencia, muestra los números del período por estudio.',
      hace: async (e) => {
        await ir(e, 'Estadísticas')
        await e.moverA(e.page.getByRole('heading', { name: 'Proyección del próximo mes' }))
      },
      capitulo: 'Estadísticas',
    },
    {
      dice: 'Si una pantalla tiene un tutorial, al lado del título vas a ver el botón «Cómo se hace».',
      hace: async (e) => { await e.moverA(e.page.getByRole('heading', { level: 1, name: 'Estadísticas' })) },
    },
  ],
})
