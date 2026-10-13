import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { guion } from '../lib/guion'

/* La prueba de la fábrica (no es un tutorial: `prueba: true`, no escribe meta ni capturas). Maneja el panel
   interactivo del mock de diseño (docs/mock-tutoriales.html, recuadro 4), que es una página real con texto y
   controles de verdad, así se puede probar voz + clics + mezcla + subtítulos antes de que exista el demo (T2).
   Los guiones de verdad apuntan a la app levantada contra el proyecto demo. */
const MOCK = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'mock-tutoriales.html')).href

export default guion('prueba-mock', {
  prueba: true,
  pasos: [
    {
      dice: 'Esta es una prueba de la fábrica de tutoriales de Spira.',
      hace: async (e) => { await e.irA(MOCK) },
      capitulo: 'Inicio',
    },
    {
      dice: 'El panel de Ayuda arranca con las preguntas frecuentes.',
      hace: async (e) => { await e.moverA(e.page.getByRole('dialog', { name: 'Ayuda' })) },
      poster: true,
    },
    {
      dice: 'Escribí en el buscador, sin preocuparte por las tildes.',
      hace: async (e) => { await e.escribir(e.page.getByLabel('Buscar en la Ayuda'), 'recepcion') },
      capitulo: 'Buscar',
    },
    {
      dice: 'Y pasá a la pestaña de tutoriales.',
      hace: async (e) => { await e.clic(e.page.getByRole('tab', { name: /Tutoriales/ })) },
    },
  ],
})
