/**
 * La semilla del demo falla EN SILENCIO de dos maneras, y las dos son reglas puras:
 *   · las FECHAS — si la cuenta de días queda corrida, la app no se ve rota: se ve con el paciente equivocado en el día
 *     equivocado, y el tutorial graba una historia que no cierra (la visita de hoy no está, la alerta no aparece);
 *   · la GUARDIA — sembrar sobre una base que no es el demo, o sobre un demo ya sembrado.
 * Lo que la semilla deja en la base se comprobó contra el demo real (docs/plan-tutoriales.md, T2b); esto fija la
 * narrativa para que una edición de las constantes no la rompa sin aviso.
 */
import { describe, expect, it } from 'vitest'
import { GuardiaError } from './guardia.mjs'
import {
  CRONOGRAMA, CUENTAS, MEDICACION, PROCEDIMIENTOS, claimsDe, hoyEnAR, marcaAR, planDePacientes, sembrar, sumarDias,
  visitasAutomaticas,
} from './semilla.mjs'
import { claveDeSesion, entradaDeSesion } from './sesion.mjs'

const HOY = '2026-10-13'

describe('fechas', () => {
  it('hoyEnAR: después de las 21 h de Argentina, la base (UTC) ya está en mañana; la semilla no', () => {
    expect(hoyEnAR(new Date('2026-10-14T01:30:00Z'))).toBe('2026-10-13')
    expect(hoyEnAR(new Date('2026-10-14T03:00:00Z'))).toBe('2026-10-14')
  })
  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-10-13', -28)).toBe('2026-09-15')
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02')
    expect(sumarDias('2024-03-01', -1)).toBe('2024-02-29')
  })
  it('marcaAR ancla la hora a −03:00, como motivosDelDia', () => {
    expect(marcaAR('2026-09-01', '09:00')).toBe('2026-09-01T09:00:00-03:00')
  })
  it('visitasAutomaticas espeja generate_patient_visits: offset desde la randomización y ventana alrededor', () => {
    expect(visitasAutomaticas('2026-09-15')[0]).toEqual({
      name: 'V3 W4', estimated_date: '2026-10-13', window_start: '2026-10-10', window_end: '2026-10-16',
    })
  })
})

describe('la narrativa de los cuatro pacientes', () => {
  const pacientes = planDePacientes(HOY)
  const p = Object.fromEntries(pacientes.map((x) => [x.alias, x]))
  /** Las visitas que el demo tiene sin atender (las automáticas de los randomizados + la V2 de P2). */
  const pendientes = pacientes.flatMap((x) => (x.randomizacion ? visitasAutomaticas(x.randomizacion).map((v) => ({ ...v, alias: x.alias })) : []))

  it('«Visitas de hoy» son exactamente P1 (V3, por llegar) y P2 (V2, en el centro)', () => {
    const deHoy = pendientes.filter((v) => v.estimated_date === HOY).map((v) => v.alias)
    expect(deHoy).toEqual(['P1'])
    expect(p.P2.v2Hoy).toBe(HOY)
    expect(p.P2.randomizacion).toBeNull()
  })
  it('la única alerta de Pendientes es la V3 de P4, con la ventana vencida', () => {
    const vencidas = pendientes.filter((v) => v.window_end < HOY)
    expect(vencidas.map((v) => `${v.alias} ${v.name}`)).toEqual(['P4 V3 W4'])
  })
  it('P3 tiene la V3 dentro de la semana', () => {
    expect(pendientes.find((v) => v.alias === 'P3' && v.name === 'V3 W4')?.estimated_date).toBe(sumarDias(HOY, 2))
  })
  it('la historia es pasada: screening 14 días antes de la randomización, y las dos antes de hoy', () => {
    for (const x of pacientes) {
      expect(x.screening < HOY).toBe(true)
      if (x.randomizacion) {
        expect(sumarDias(x.screening, 14)).toBe(x.randomizacion)
        expect(x.randomizacion < HOY).toBe(true)
      }
    }
  })
  it('IVRS y nombres sin repetir (patients.code es único)', () => {
    expect(new Set(pacientes.map((x) => x.ivrs)).size).toBe(pacientes.length)
    expect(new Set(pacientes.map((x) => x.nombre)).size).toBe(pacientes.length)
  })
})

describe('las constantes', () => {
  it('todo procedimiento del cronograma existe en el catálogo (si no, set_visit_procedures recibe un null)', () => {
    const codigos = new Set(PROCEDIMIENTOS.map(([code]) => code))
    for (const v of CRONOGRAMA) for (const proc of v.procedimientos) expect(codigos.has(proc)).toBe(true)
  })
  it('el cronograma tiene UNA visita de screening y UNA de randomización, las dos libres', () => {
    expect(CRONOGRAMA.filter((v) => v.role === 'screening').map((v) => v.date_mode)).toEqual(['libre'])
    expect(CRONOGRAMA.filter((v) => v.role === 'randomizacion').map((v) => v.date_mode)).toEqual(['libre'])
  })
  it('el GTIN tiene el dígito verificador EAN-13 bien calculado', () => {
    const d = MEDICACION.gtin.split('').map(Number)
    const suma = d.slice(0, 12).reduce((s, n, i) => s + n * (i % 2 ? 3 : 1), 0)
    expect((10 - (suma % 10)) % 10).toBe(d[12])
  })
  it('hay una gerencia y una pharma leader (operator no alcanza para el catálogo ni el stock)', () => {
    const accesos = CUENTAS.flatMap((c) => c.accesos.map(([m, r]) => `${c.alias}:${m}:${r}`))
    expect(accesos).toContain('dir:gerencia:admin')
    expect(accesos).toContain('farmaresp:pharma:leader')
  })
  it('claimsDe lleva el sub que lee auth.uid()', () => {
    expect(JSON.parse(claimsDe('abc'))).toEqual({ sub: 'abc', role: 'authenticated' })
  })
})

describe('sesión', () => {
  it('la clave es la de supabase-js por defecto: sb-<ref>-auth-token', () => {
    expect(claveDeSesion('https://abcdefghijklmnopqrst.supabase.co')).toBe('sb-abcdefghijklmnopqrst-auth-token')
  })
  it('el archivo guarda la sesión entera como valor de sessionStorage', () => {
    const sesion = { access_token: 'a', refresh_token: 'r', expires_at: 1_800_000_000, user: { id: 'u' } }
    const e = entradaDeSesion('https://abcdefghijklmnopqrst.supabase.co', CUENTAS[0], sesion)
    expect(JSON.parse(e.sessionStorage['sb-abcdefghijklmnopqrst-auth-token'])).toEqual(sesion)
    expect(e.cuenta).toBe('coord')
  })
})

describe('sembrar · la guardia', () => {
  function falso(filas: Record<string, unknown>[][]) {
    const ejecutado: string[] = []
    const respuestas = [...filas]
    return {
      ejecutado,
      db: {
        cfg: { url: 'https://x.supabase.co', secretKey: 'sb_secret_x' },
        cliente: { query: async (sql: string) => { ejecutado.push(sql); return { rows: [] } } },
        consultar: async () => respuestas.shift() ?? [],
      },
    }
  }
  it('CRÍTICO · sin la centinela (prod u otro proyecto) → aborta sin ejecutar nada', async () => {
    const { db, ejecutado } = falso([[{ centinela: false, con_datos: true }]])
    await expect(sembrar(db as never, { log: () => {}, hoy: HOY })).rejects.toThrow(GuardiaError)
    expect(ejecutado).toEqual([])
  })
  it('un demo ya sembrado no se vuelve a sembrar (duplicaría todo)', async () => {
    const { db, ejecutado } = falso([[{ centinela: true, con_datos: true }], [{ cuentas: 4, protocolos: 1 }]])
    await expect(sembrar(db as never, { log: () => {}, hoy: HOY })).rejects.toThrow(/demo:resetear/)
    expect(ejecutado).toEqual([])
  })
})
