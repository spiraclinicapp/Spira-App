import { describe, expect, it } from 'vitest'
import type { HistorialEntradaRow } from '../../../data/pharma/dispensationModel'
import { interpretarHistorial } from './historial'

/**
 * La traducción del `audit_log` a castellano.
 *
 * POR QUÉ ESTA FUNCIÓN Y NO LA PANTALLA: es exactamente el tipo de cosa que falla EN SILENCIO. Una
 * regla mal puesta acá no se ve rota — se ve como una frase prolija, bien tipografiada, que dice
 * algo que no pasó. Un "se escaneó 1 unidad" sobre una fila que en realidad DESHIZO el escaneo es
 * indistinguible a ojo del correcto, y este historial es la ventana que se abre justamente cuando
 * alguien desconfía de lo que ve en pantalla: si miente, miente en el peor momento posible.
 *
 * Es el mismo error que el reporte del 2026-08-15 encontró del otro lado (el escaneo diciendo "ya
 * está escaneado" sobre un producto ajeno al pedido): una explicación asumida donde había tres.
 *
 * Sin base y sin navegador: son funciones puras sobre dos objetos jsonb.
 */

function fila(over: Partial<HistorialEntradaRow> = {}): HistorialEntradaRow {
  return {
    cuando: '2026-08-15T14:54:00Z',
    quien: 'Ana Farmacéutica',
    entidad: 'dispensation_requests',
    accion: 'UPDATE',
    antes: null,
    despues: null,
    ...over,
  }
}

/** El primer (y normalmente único) evento traducido. */
function uno(f: HistorialEntradaRow, nombres: Record<string, string> = {}) {
  return interpretarHistorial([f], (id) => (typeof id === 'string' ? nombres[id] ?? null : null))[0]
}

const MEDS = { m1: 'Alvetide 92/22 mcg', m2: 'Symbicort Forte 320/9 mcg' }

describe('el pedido', () => {
  it('un alta no se cuenta campo por campo', () => {
    // La versión vieja pintaba una línea por columna, incluidas las vacías ("notes — → —"): cambios
    // que no ocurrieron. Un alta es UN hecho.
    const e = uno(fila({
      accion: 'INSERT',
      despues: { status: 'solicitada', notes: null, source: 'manual', requested_by_module: 'track' },
    }))
    expect(e.titulo).toBe('Se creó el pedido')
    expect(e.detalle).toBe('Lo dio de alta Coordinación')
  })

  it('tomar la preparación se lee como tal, no como tres columnas', () => {
    const e = uno(fila({
      antes: { status: 'solicitada', prepared_by: null, preparation_started_at: null },
      despues: { status: 'preparando', prepared_by: 'u1', preparation_started_at: '2026-08-15T14:53:06Z' },
    }))
    expect(e.titulo).toBe('Empezó la preparación')
    expect(e.tono).toBe('avance')
  })

  it('volver a solicitada es CANCELAR la preparación, no un cambio de estado cualquiera', () => {
    // Es EL caso que manda a abrir este historial: "¿por qué volvió a la cola?".
    const e = uno(fila({
      antes: { status: 'preparando' },
      despues: { status: 'solicitada' },
    }))
    expect(e.titulo).toBe('Se canceló la preparación')
    expect(e.detalle).toContain('volvió a la cola')
    expect(e.tono).toBe('alerta')
  })

  it('el rechazo viaja con su motivo y en tono terminal', () => {
    const e = uno(fila({
      antes: { status: 'preparando', rejection_reason: null },
      despues: { status: 'rechazada', rejection_reason: 'sin stock del lote requerido' },
    }))
    expect(e.titulo).toBe('Se rechazó el pedido')
    expect(e.detalle).toBe('sin stock del lote requerido')
    expect(e.tono).toBe('corte')
  })
})

describe('los renglones', () => {
  it('una pasada del lector dice qué se escaneó y cuánto va', () => {
    const e = uno(fila({
      entidad: 'dispensation_request_items',
      antes: { medication_id: 'm1', quantity: 2, scanned_units: 0 },
      despues: { medication_id: 'm1', quantity: 2, scanned_units: 1 },
    }), MEDS)
    expect(e.titulo).toBe('Se escaneó 1 unidad')
    expect(e.detalle).toBe('Alvetide 92/22 mcg · 1 de 2')
    expect(e.tono).toBe('avance')
  })

  it('la última unidad cierra el renglón y el tono lo dice', () => {
    const e = uno(fila({
      entidad: 'dispensation_request_items',
      antes: { medication_id: 'm1', quantity: 2, scanned_units: 1 },
      despues: { medication_id: 'm1', quantity: 2, scanned_units: 2 },
    }), MEDS)
    expect(e.tono).toBe('listo')
  })

  it('deshacer NO se lee como escanear', () => {
    // El bug que este test existe para atrapar: si la regla mirara solo "cambió scanned_units",
    // volver el contador a cero diría "se escaneó" sobre una corrección. Misma frase, hecho opuesto.
    const e = uno(fila({
      entidad: 'dispensation_request_items',
      antes: { medication_id: 'm1', quantity: 2, scanned_units: 2 },
      despues: { medication_id: 'm1', quantity: 2, scanned_units: 0 },
    }), MEDS)
    expect(e.titulo).toBe('Se deshizo el escaneo del renglón')
    expect(e.tono).toBe('alerta')
  })

  it('la sustitución le gana al conteo, aunque el conteo también haya cambiado', () => {
    // `substitute_dispensation_item` (0076) devuelve las unidades a CERO en la misma sentencia que
    // cambia el medicamento. Si mandara la regla del escaneo, el hecho importante —se cambió el
    // producto que se le da al paciente— quedaría escrito como "se deshizo el escaneo".
    const e = uno(fila({
      entidad: 'dispensation_request_items',
      antes: { medication_id: 'm1', quantity: 1, scanned_units: 1 },
      despues: { medication_id: 'm2', quantity: 1, scanned_units: 0, substitution_reason: 'sin stock' },
    }), MEDS)
    expect(e.titulo).toBe('Se sustituyó un renglón')
    expect(e.detalle).toBe('Ahora: Symbicort Forte 320/9 mcg · sin stock')
  })

  it('sin nombre en el mapa la línea se queda corta, no inventa uno', () => {
    const e = uno(fila({
      entidad: 'dispensation_request_items',
      antes: { medication_id: 'mX', quantity: 1, scanned_units: 0 },
      despues: { medication_id: 'mX', quantity: 1, scanned_units: 1 },
    }))
    expect(e.titulo).toBe('Se escaneó 1 unidad')
    expect(e.detalle).toBe('1 de 1')
  })
})

describe('la dispensación', () => {
  it('marcar lista dice qué pasó con el stock', () => {
    const e = uno(fila({
      entidad: 'dispensations',
      antes: { status: 'en_preparacion' },
      despues: { status: 'lista' },
    }))
    expect(e.titulo).toBe('Quedó lista para retirar')
    expect(e.tono).toBe('listo')
  })

  it('la entrega cuenta los kits de IP cuando los hubo', () => {
    const e = uno(fila({
      entidad: 'dispensations',
      antes: { status: 'lista', ip_kits: null },
      despues: { status: 'entregada', ip_kits: 1 },
    }))
    expect(e.titulo).toBe('Se entregó al paciente')
    expect(e.detalle).toBe('1 kit de producto en investigación')
  })

  it('el código del comprobante se muestra, el uuid de quien lo emitió no', () => {
    const e = uno(fila({
      entidad: 'dispensations',
      antes: { daily_number: null, dispensation_code: null, executed_by: 'c6d75358-2901-4153-bc55-db7a76c03189' },
      despues: { daily_number: 1, dispensation_code: 'D-1-150826-SC', executed_by: 'c6d75358-2901-4153-bc55-db7a76c03189' },
    }))
    expect(e.titulo).toBe('Se numeró el comprobante')
    expect(e.detalle).toBe('D-1-150826-SC · 1° del día')
  })
})

describe('la constancia del IRT', () => {
  it('dice "se marcó como impresa", no "se imprimió"', () => {
    // El navegador no puede saber si el papel salió (0075). La distinción entre lo que el sistema
    // OBSERVÓ y lo que alguien AFIRMÓ no se difumina, tampoco en el historial.
    const e = uno(fila({
      entidad: 'dispensation_ip_documents',
      antes: { printed_at: null, file_name: 'irt.pdf' },
      despues: { printed_at: '2026-08-15T14:50:00Z', file_name: 'irt.pdf' },
    }))
    expect(e.titulo).toBe('Se marcó la constancia como impresa')
  })
})

describe('el respaldo', () => {
  it('un campo sin regla se muestra igual, con etiqueta legible', () => {
    // La red que atrapa lo que nadie tradujo todavía. Ocultarlo sería peor: en un sistema auditable
    // un hecho invisible es más caro que una línea fea.
    const e = uno(fila({
      antes: { notes: null },
      despues: { notes: 'llamar al paciente antes' },
    }))
    expect(e.titulo).toBe('Se editó la nota del pedido')
    expect(e.detalle).toBe('llamar al paciente antes')
  })

  it('nunca deja un uuid de persona a la vista', () => {
    // El dato "quién hizo esto" ya está en la cabecera de la fila, con nombre y apellido.
    const e = uno(fila({
      entidad: 'dispensations',
      antes: { executed_by: null, notes: null },
      despues: { executed_by: 'c6d75358-2901-4153-bc55-db7a76c03189', notes: null },
    }))
    expect(e.detalle).not.toContain('c6d75358')
  })

  it('traduce los enums crudos que se le escapen a las reglas', () => {
    const e = uno(fila({
      entidad: 'tabla_futura',
      antes: { status: 'solicitada' },
      despues: { status: 'preparando' },
    }))
    expect(e.detalle).toBe('Estado: En preparación')
  })
})
