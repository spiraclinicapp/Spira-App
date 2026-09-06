import { describe, expect, it } from 'vitest'
import { formatAR } from '../../lib/dates'
import {
  avanceDeTarea, cerreYoMiParte, estadoDeTarea, estaHecha, etiquetaDeVencimiento,
  puedeEditar, puedeEliminar,
} from './estados'
import type { AsignadoMinimo, TareaMinima } from './estados'

/**
 * Las reglas de una tarea (migración 0108).
 *
 * SON EXACTAMENTE LO QUE ESTE REPO TESTEA: las tres fallan sin romper nada. La peor es `estaHecha`,
 * porque el "hecha" vive en DOS COLUMNAS DISTINTAS según el modo de cierre — leer la que no va
 * muestra una tarea abierta como hecha, y ahí alguien deja de hacer algo que tenía que hacer.
 *
 * `puedeEditar` es la regla del Director y su modo de falla es de permisos: invertida, alguien
 * edita el encargo que le hicieron. No es EL permiso (ése lo hace cumplir `update_task` en el
 * servidor) pero decide qué botón se ofrece, y un botón que rebota es peor que ninguno.
 */

const YO = '11111111-1111-1111-1111-111111111111'
const OTRA = '22222222-2222-2222-2222-222222222222'
const TERCERA = '33333333-3333-3333-3333-333333333333'
const HOY = '2026-09-06'
const CUANDO = '2026-09-05T10:00:00+00:00'

const tarea = (over: Partial<TareaMinima & { due_date: string | null }> = {}) => ({
  completion_mode: 'cada_uno' as const, completed_at: null, created_by: YO, due_date: null, ...over,
})
const asig = (user_id: string, completed_at: string | null = null): AsignadoMinimo =>
  ({ user_id, completed_at })

describe('estaHecha', () => {
  /* El corazón del asunto: la MISMA tarea, con los MISMOS asignados, da distinto según el modo.
     Si la función leyera siempre la misma columna, uno de estos dos casos saldría al revés. */
  it('"cualquiera": mira el cierre de la TAREA, no el de las personas', () => {
    const t = tarea({ completion_mode: 'cualquiera', completed_at: CUANDO })
    expect(estaHecha(t, [asig(YO), asig(OTRA)])).toBe(true)
  })

  it('"cualquiera" sin cierre: abierta, aunque alguien tenga su parte marcada', () => {
    const t = tarea({ completion_mode: 'cualquiera', completed_at: null })
    expect(estaHecha(t, [asig(YO, CUANDO), asig(OTRA, CUANDO)])).toBe(false)
  })

  it('"cada_uno": hecha sólo cuando están TODOS', () => {
    const t = tarea()
    expect(estaHecha(t, [asig(YO, CUANDO), asig(OTRA, CUANDO)])).toBe(true)
    expect(estaHecha(t, [asig(YO, CUANDO), asig(OTRA)])).toBe(false)
  })

  it('"cada_uno" NO mira el completed_at de la tarea', () => {
    // La 0108 tiene un check que impide llenarlo en este modo. Si algún día se cuela, la regla
    // no puede darla por hecha: el hecho de este modo es de las personas.
    const t = tarea({ completed_at: CUANDO })
    expect(estaHecha(t, [asig(YO), asig(OTRA)])).toBe(false)
  })

  /* Sin asignados no debería existir una tarea (los RPC no la dejan crear). Pero `every` sobre un
     arreglo vacío devuelve TRUE, así que sin la guarda la daría por hecha — el clásico. */
  it('sin asignados NO está hecha, aunque `every` diga que sí', () => {
    expect(estaHecha(tarea(), [])).toBe(false)
  })
})

describe('cerreYoMiParte', () => {
  it('en "cada_uno" mira la parte de esa persona', () => {
    const a = [asig(YO, CUANDO), asig(OTRA)]
    expect(cerreYoMiParte(tarea(), a, YO)).toBe(true)
    expect(cerreYoMiParte(tarea(), a, OTRA)).toBe(false)
  })

  it('en "cualquiera" la tarea es una sola: si está cerrada, lo está para todos', () => {
    const t = tarea({ completion_mode: 'cualquiera', completed_at: CUANDO })
    expect(cerreYoMiParte(t, [asig(OTRA)], YO)).toBe(true)
  })

  it('sin sesión resuelta no reclama nada', () => {
    expect(cerreYoMiParte(tarea(), [asig(YO, CUANDO)], null)).toBe(false)
  })
})

describe('avanceDeTarea', () => {
  it('cuenta las partes cerradas', () => {
    expect(avanceDeTarea(tarea(), [asig(YO, CUANDO), asig(OTRA, CUANDO), asig(TERCERA)]))
      .toEqual({ hechas: 2, total: 3 })
  })

  it('en "cualquiera" no hay avance: la tarea es un hecho, no una suma de partes', () => {
    const t = tarea({ completion_mode: 'cualquiera' })
    expect(avanceDeTarea(t, [asig(YO), asig(OTRA)])).toBeNull()
  })

  it('con una sola persona no se muestra avance: "1 de 1" no informa nada', () => {
    expect(avanceDeTarea(tarea(), [asig(YO)])).toBeNull()
  })
})

describe('estadoDeTarea', () => {
  /* Una tarea que se hizo tarde ESTÁ HECHA. Seguir marcándola en rojo sería reprochar algo que ya
     se resolvió, y en una lista de pendientes eso es ruido que tapa lo que sí falta. */
  it('"hecha" gana sobre una fecha pasada', () => {
    const t = tarea({ due_date: '2026-08-01' })
    expect(estadoDeTarea(t, [asig(YO, CUANDO)], HOY)).toBe('hecha')
  })

  it('vencida, vence hoy y próxima', () => {
    expect(estadoDeTarea(tarea({ due_date: '2026-09-05' }), [asig(YO)], HOY)).toBe('vencida')
    expect(estadoDeTarea(tarea({ due_date: HOY }), [asig(YO)], HOY)).toBe('vence_hoy')
    expect(estadoDeTarea(tarea({ due_date: '2026-09-07' }), [asig(YO)], HOY)).toBe('proxima')
  })

  /* Sin fecha es su PROPIO estado y no "próxima": una tarea sin vencimiento no está por vencer, y
     mezclarlas obligaría a la fila a inventar un texto de fecha que no existe. */
  it('sin fecha tiene su propio estado', () => {
    expect(estadoDeTarea(tarea(), [asig(YO)], HOY)).toBe('sin_fecha')
  })

  it('cruza el mes sin equivocarse de lado', () => {
    expect(estadoDeTarea(tarea({ due_date: '2026-08-31' }), [asig(YO)], '2026-09-01')).toBe('vencida')
  })
})

describe('puedeEditar', () => {
  it('el autor siempre puede', () => {
    expect(puedeEditar(tarea({ created_by: YO }), [asig(OTRA)], YO)).toBe(true)
  })

  /* EL CASO QUE DA NOMBRE A LA REGLA: una tarea que otro me asignó es un ENCARGO. Puedo marcarla
     hecha, no cambiar lo que me pidieron. */
  it('un asignado en una tarea INDIVIDUAL no puede editarla', () => {
    expect(puedeEditar(tarea({ created_by: OTRA }), [asig(YO)], YO)).toBe(false)
  })

  it('un asignado en una tarea GRUPAL sí puede: es trabajo compartido', () => {
    expect(puedeEditar(tarea({ created_by: OTRA }), [asig(YO), asig(TERCERA)], YO)).toBe(true)
  })

  /* "Grupal" se lee de la CANTIDAD de asignados. Estar de a varios no alcanza: hay que ser uno de
     ellos. Un tercero que ve la tarea por ser autor ya entró por la primera rama. */
  it('no basta con que la tarea sea grupal: hay que estar asignado', () => {
    expect(puedeEditar(tarea({ created_by: OTRA }), [asig(OTRA), asig(TERCERA)], YO)).toBe(false)
  })

  it('sin sesión resuelta no se ofrece nada', () => {
    expect(puedeEditar(tarea({ created_by: YO }), [asig(YO)], null)).toBe(false)
  })
})

describe('etiquetaDeVencimiento', () => {
  /* El tiempo verbal sale de la FECHA, no del estado — por eso `estaHecha` no entra acá. Es la
     regla que hace que una tarea hecha tarde diga "venció" y no "vence 29/08" en presente sobre una
     fecha que ya pasó. Invertida no rompe nada: dibuja prolijo afirmando lo contrario.

     No se asierta el FORMATO de la fecha: eso lo decide `formatAR` según la preferencia del
     usuario, y fijarlo acá haría fallar el test el día que alguien elija otro formato sin que la
     regla que este archivo cuida haya cambiado. Lo que se asierta es el VERBO. */
  const HACE_UNA_SEMANA = '2026-08-30'
  const MANANA = '2026-09-07'

  it('una fecha pasada va en pasado, y se declara vencida', () => {
    const e = etiquetaDeVencimiento(HACE_UNA_SEMANA, HOY)
    expect(e).toEqual({ texto: `venció ${formatAR(HACE_UNA_SEMANA)}`, vencida: true })
  })

  it('una fecha futura va en presente', () => {
    const e = etiquetaDeVencimiento(MANANA, HOY)
    expect(e).toEqual({ texto: `vence ${formatAR(MANANA)}`, vencida: false })
  })

  it('HOY todavía no venció', () => {
    // El borde: vence hoy es "vence", no "venció". Un `<=` acá reprocharía algo que está a tiempo.
    const e = etiquetaDeVencimiento(HOY, HOY)
    expect(e).toEqual({ texto: `vence ${formatAR(HOY)}`, vencida: false })
  })

  it('sin fecha devuelve null, no un texto de relleno', () => {
    /* Una tarea sin vencimiento es válida ("cuando pueda"). Devolver "sin fecha" acá obligaría a
       las dos pantallas a reconocer ese texto para poder no mostrarlo. */
    expect(etiquetaDeVencimiento(null, HOY)).toBeNull()
  })

  it('el color no se puede separar de la palabra', () => {
    /* `vencida` viaja CON el texto justamente para que sea imposible pintar de rojo un "vence" o
       de gris un "venció": las dos cosas salen de la misma comparación. */
    for (const fecha of [HACE_UNA_SEMANA, HOY, MANANA]) {
      const e = etiquetaDeVencimiento(fecha, HOY)!
      expect(e.vencida).toBe(e.texto.startsWith('venció'))
    }
  })
})

describe('puedeEliminar', () => {
  it('sólo el autor', () => {
    expect(puedeEliminar(tarea({ created_by: YO }), YO)).toBe(true)
    expect(puedeEliminar(tarea({ created_by: OTRA }), YO)).toBe(false)
    // Ni siquiera en una grupal: borrarla le sacaría el pendiente a otro sin que se entere.
    expect(puedeEliminar(tarea({ created_by: OTRA }), null)).toBe(false)
  })
})
