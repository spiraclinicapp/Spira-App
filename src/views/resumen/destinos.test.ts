import { describe, expect, it } from 'vitest'
import { MODULES } from '../../modules/registry'
import { isViewRegistered } from '../registryKeys'
import { KPI_DESTINOS, nombreDeDestino } from './destinos'
import type { KpiKey } from './destinos'

/**
 * Los destinos de los KPI del Resumen de Coordinación.
 *
 * POR QUÉ ESTO TIENE TEST Y EL HOVER NO: el criterio de la casa es cubrir lo que falla EN SILENCIO.
 * Un `subKey` mal escrito —o un submódulo renombrado dentro de seis meses— no tira ningún error:
 * `resolveView` cae al `Placeholder` y el usuario aterriza en una pantalla vacía después de haber
 * leído un chip que le prometía otra cosa. No hay excepción en consola, no hay 404, no hay nada.
 * El deslizamiento del chip, en cambio, falla de manera visible y se verifica mirando.
 *
 * Los dos "olvidos" que estas pruebas hacen imposibles son distintos y los dos son reales:
 * escribir mal una clave HOY, y romperla MAÑANA renombrando un submódulo en `modules/registry.ts`
 * sin acordarse de que el Resumen lo apuntaba.
 *
 * Sin base y sin navegador: `registryKeys.ts` es sólo strings, justamente para poder importarlo acá
 * (el registry de verdad arrastra todas las vistas y `lib/supabase.ts`, que no carga fuera del
 * navegador).
 */

const CLAVES: KpiKey[] = ['protocolos', 'pacientes', 'pendientes', 'reprogramar']

describe('destinos de los KPI del Resumen', () => {
  it('cubre los cuatro KPI de la pantalla, sin sobrantes', () => {
    // Si mañana se agrega un quinto KPI y se olvida su destino, el chip no aparece y nadie se entera.
    expect(Object.keys(KPI_DESTINOS).sort()).toEqual([...CLAVES].sort())
  })

  it('cada destino existe en el menú, con un nombre para mostrar', () => {
    for (const clave of CLAVES) {
      const nombre = nombreDeDestino(KPI_DESTINOS[clave])
      expect(nombre, `el KPI "${clave}" apunta a un submódulo que no está en MODULES`).not.toBeNull()
      expect(nombre).not.toBe('')
    }
  })

  it('cada destino tiene una vista real detrás, no el Placeholder', () => {
    for (const clave of CLAVES) {
      const { moduleKey, subKey } = KPI_DESTINOS[clave]
      expect(
        isViewRegistered(moduleKey, subKey),
        `el KPI "${clave}" lleva a ${moduleKey}/${subKey}, que cae al Placeholder`,
      ).toBe(true)
    }
  })

  it('todos los destinos viven en Coordinación', () => {
    /* Es el Resumen de Coordinación: un KPI que saltara a otro módulo se comería un `navigate`
       descartado en silencio por `isAllowed` para quien no tenga ese módulo — el mismo modo de
       falla que documenta `useAbrirFicha`. */
    for (const clave of CLAVES) {
      expect(KPI_DESTINOS[clave].moduleKey).toBe('track')
    }
  })

  it('el nombre sale del registry y no de una copia escrita a mano', () => {
    /* La prueba de que no hay diccionario paralelo: el nombre que devuelve la función tiene que ser
       IDÉNTICO al que el menú lateral muestra. Si alguien reintroduce un `DEST_LABEL` como el del
       mock, este test lo caza en cuanto los dos textos se separen. */
    const track = MODULES.find((m) => m.key === 'track')
    expect(track).toBeDefined()
    for (const clave of CLAVES) {
      const { subKey } = KPI_DESTINOS[clave]
      const delMenu = track?.submodules.find((s) => s.key === subKey)?.name
      expect(nombreDeDestino(KPI_DESTINOS[clave])).toBe(delMenu)
    }
  })

  it('devuelve null para un destino inventado, en vez de un texto de relleno', () => {
    expect(nombreDeDestino({ moduleKey: 'track', subKey: 'reportes' })).toBeNull()
    expect(nombreDeDestino({ moduleKey: 'inexistente', subKey: 'resumen' })).toBeNull()
  })
})
