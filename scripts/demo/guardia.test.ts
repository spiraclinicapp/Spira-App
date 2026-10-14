/**
 * La guardia del demo es justo lo que CLAUDE.md pide testear: si queda al revés no se ve nada raro en pantalla,
 * pero el próximo `npm run demo:resetear` escribe pacientes ficticios en PROD. Cada caso de abajo es un agujero
 * concreto que alguno de los tres cerrojos tiene que tapar.
 */
import { describe, expect, it } from 'vitest'
import { GuardiaError, REF_PROD, refDeDbUrl, refDeUrlApi, verificarBundle, verificarCentinela, verificarDestino } from './guardia.mjs'

const DEMO = 'demodemodemodemodemo'
const OTRO = 'otrootrootrootrootro'
const ok = { SPIRA_DEMO: '1' }
const api = (ref: string) => `https://${ref}.supabase.co`
const pooler = (ref: string) => `postgresql://postgres.${ref}:clave@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
const directa = (ref: string) => `postgresql://postgres:clave@db.${ref}.supabase.co:5432/postgres`

describe('el ref de prod está cargado', () => {
  it('es un ref de verdad, no el marcador', () => {
    expect(REF_PROD).toMatch(/^[a-z]{20}$/)
    expect(REF_PROD).not.toBe(DEMO)
  })
})

describe('refDeDbUrl', () => {
  it('saca el ref del USUARIO en el pooler (el host es compartido)', () => {
    expect(refDeDbUrl(pooler(DEMO))).toBe(DEMO)
  })
  it('saca el ref del HOST en la conexión directa', () => {
    expect(refDeDbUrl(directa(DEMO))).toBe(DEMO)
  })
  it('pooler sin ref en el usuario → no se sabe el proyecto', () => {
    expect(refDeDbUrl('postgresql://postgres:clave@aws-0-sa-east-1.pooler.supabase.com:5432/postgres')).toBeNull()
  })
  it('dos refs distintos en la misma URL → no se adivina', () => {
    expect(refDeDbUrl(`postgresql://postgres.${DEMO}:clave@db.${OTRO}.supabase.co:5432/postgres`)).toBeNull()
  })
  it('vacía, malformada o de otro protocolo → null', () => {
    expect(refDeDbUrl('')).toBeNull()
    expect(refDeDbUrl('no es una url')).toBeNull()
    expect(refDeDbUrl(`https://db.${DEMO}.supabase.co`)).toBeNull()
  })
})

describe('refDeUrlApi', () => {
  it('acepta con y sin barra final', () => {
    expect(refDeUrlApi(api(DEMO))).toBe(DEMO)
    expect(refDeUrlApi(api(DEMO) + '/')).toBe(DEMO)
  })
  it('rechaza lo que no es una URL de API de Supabase', () => {
    expect(refDeUrlApi(`https://${DEMO}.supabase.co/rest/v1`)).toBeNull()
    expect(refDeUrlApi(`http://${DEMO}.supabase.co`)).toBeNull()
    expect(refDeUrlApi(undefined)).toBeNull()
  })
})

describe('cerrojo 1 · verificarDestino', () => {
  it('todo apunta al demo → sigue', () => {
    expect(() => verificarDestino({ demoRef: DEMO, apiUrl: api(DEMO), dbUrl: pooler(DEMO), env: ok })).not.toThrow()
    expect(() => verificarDestino({ demoRef: DEMO, apiUrl: api(DEMO), env: ok })).not.toThrow()
  })
  it('lanzado a mano (ni `npm run demo:…` ni SPIRA_DEMO=1) → aborta', () => {
    expect(() => verificarDestino({ demoRef: DEMO, apiUrl: api(DEMO), env: {} })).toThrow(/npm run demo/)
    expect(() => verificarDestino({ demoRef: DEMO, apiUrl: api(DEMO), env: { SPIRA_DEMO: 'true' } })).toThrow(GuardiaError)
    expect(() => verificarDestino({ demoRef: DEMO, apiUrl: api(DEMO), env: { npm_lifecycle_event: 'build' } })).toThrow(GuardiaError)
  })
  it('lanzado por un `npm run demo:…` → sigue', () => {
    expect(() => verificarDestino({ demoRef: DEMO, apiUrl: api(DEMO), env: { npm_lifecycle_event: 'demo:verificar' } })).not.toThrow()
  })
  it('CRÍTICO · DEMO_REF igual al de prod → aborta', () => {
    expect(() => verificarDestino({ demoRef: REF_PROD, apiUrl: api(REF_PROD), env: ok })).toThrow(/PROD/)
  })
  it('CRÍTICO · URL directa de prod → aborta', () => {
    expect(() => verificarDestino({ demoRef: DEMO, apiUrl: api(DEMO), dbUrl: directa(REF_PROD), env: ok })).toThrow(/PROD/)
  })
  it('CRÍTICO · pooler (host compartido) con el usuario de prod → aborta', () => {
    expect(() => verificarDestino({ demoRef: DEMO, apiUrl: api(DEMO), dbUrl: pooler(REF_PROD), env: ok })).toThrow(/PROD/)
  })
  it('la URL de la API es de prod u otro proyecto → aborta', () => {
    expect(() => verificarDestino({ demoRef: DEMO, apiUrl: api(REF_PROD), env: ok })).toThrow(/PROD/)
    expect(() => verificarDestino({ demoRef: DEMO, apiUrl: api(OTRO), env: ok })).toThrow(/otro proyecto/)
  })
  it('DEMO_DB_URL de otro proyecto, o sin forma de saberlo → aborta', () => {
    expect(() => verificarDestino({ demoRef: DEMO, apiUrl: api(DEMO), dbUrl: pooler(OTRO), env: ok })).toThrow(/otro proyecto/)
    expect(() => verificarDestino({ demoRef: DEMO, apiUrl: api(DEMO), dbUrl: 'basura', env: ok })).toThrow(GuardiaError)
  })
  it('DEMO_REF vacío o malformado → aborta', () => {
    expect(() => verificarDestino({ demoRef: '', apiUrl: api(DEMO), env: ok })).toThrow(GuardiaError)
    expect(() => verificarDestino({ demoRef: 'Demo-Ref', apiUrl: api(DEMO), env: ok })).toThrow(GuardiaError)
  })
})

describe('cerrojo 2 · verificarCentinela', () => {
  const con = (fila: object | undefined) => async () => (fila ? [fila] : [])
  it('mira demo.centinela (su schema propio: el reset vacía public y se la llevaría)', async () => {
    let sql = ''
    await verificarCentinela(async (s: string) => { sql = s; return [{ centinela: true, con_datos: true }] })
    expect(sql).toContain("to_regclass('demo.centinela')")
    expect(sql).not.toContain('public.demo_centinela')
  })
  it('la centinela existe → es el demo', async () => {
    await expect(verificarCentinela(con({ centinela: true, con_datos: true }))).resolves.toBe('presente')
  })
  it('base vacía (primera vez) → se permite crearla', async () => {
    await expect(verificarCentinela(con({ centinela: false, con_datos: false }))).resolves.toBe('base-vacia')
  })
  it('CRÍTICO · base con datos y sin centinela → aborta (es prod u otro proyecto)', async () => {
    await expect(verificarCentinela(con({ centinela: false, con_datos: true }))).rejects.toThrow(GuardiaError)
  })
  it('la consulta no devuelve filas → aborta, no asume nada', async () => {
    await expect(verificarCentinela(con(undefined))).rejects.toThrow(GuardiaError)
  })
})

describe('cerrojo 3 · verificarBundle', () => {
  it('la app cargada apunta al demo → sigue', () => {
    expect(() => verificarBundle(api(DEMO), DEMO)).not.toThrow()
  })
  it('apunta a prod, a otro proyecto o a nada → aborta', () => {
    expect(() => verificarBundle(api(REF_PROD), DEMO)).toThrow(/PROD/)
    expect(() => verificarBundle(api(OTRO), DEMO)).toThrow(GuardiaError)
    expect(() => verificarBundle(undefined, DEMO)).toThrow(GuardiaError)
  })
})
