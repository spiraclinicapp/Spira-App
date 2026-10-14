// Configuración del proyecto Supabase DEMO (tutoriales y entorno de práctica). Plan: docs/plan-tutoriales.md,
// «El ambiente demo».
//
// ── POR QUÉ FUERA DEL REPO Y NO EN UN .env DE LA RAÍZ ──
// Cada sesión trabaja en su propio worktree (CLAUDE.md), y un `.env.demo.local` git-ignored vive sólo en la
// carpeta donde se creó: desde cualquier otro worktree no existiría y, peor, Vite completaría lo que falte con
// el `.env` de la raíz, que apunta a PROD. Una ruta fija en la carpeta del usuario se ve igual desde todos lados.
//
// ── POR QUÉ LA URL NO VA EN EL ARCHIVO ──
// Sale del ref (`https://<ref>.supabase.co`). Un dato menos para copiar a mano, y uno menos que pueda quedar
// apuntando a otro proyecto mientras el ref dice el demo.
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const RUTA_DEMO_ENV = join(homedir(), '.spira', 'demo.env')

/** Las claves sin las que nada del demo funciona. `DEMO_DB_URL` y `TTS_KEY` las pide quien las usa. */
export const REQUERIDAS = ['DEMO_REF', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'DEMO_SECRET_KEY']

/** El ref de un proyecto de Supabase: 20 letras minúsculas. */
export const FORMA_REF = /^[a-z]{20}$/

/** Lo que piden, además, los scripts que se conectan a la base (migrar, resetear, sembrar). */
export const REQUERIDAS_DB = [...REQUERIDAS, 'DEMO_DB_URL']

/** El marcador que deja Supabase en la cadena que se copia de «Connect». */
export const MARCADOR_PASSWORD = '[YOUR-PASSWORD]'

export class ConfigDemoError extends Error {}

/**
 * La cadena de conexión final. El Director pega la URI TAL CUAL la da Supabase (con `[YOUR-PASSWORD]` adentro)
 * y la contraseña en `DEMO_DB_PASSWORD`: reemplazar a mano fue justo el paso que se trababa, y una contraseña
 * con `@`, `/` o `#` sin codificar rompe la URL de una manera que no se entiende. Si la cadena ya trae la
 * contraseña (sin marcador), se usa como está.
 */
export function armarDbUrl(dbUrl, password) {
  if (!dbUrl) return null
  if (!dbUrl.includes(MARCADOR_PASSWORD)) return dbUrl
  if (!password) throw new ConfigDemoError(`DEMO_DB_URL trae ${MARCADOR_PASSWORD}: falta DEMO_DB_PASSWORD con la contraseña de la base.`)
  return dbUrl.replace(MARCADOR_PASSWORD, encodeURIComponent(password))
}

/** `CLAVE=valor` por renglón; ignora vacíos y comentarios (`#`), recorta espacios y comillas. */
export function parsearEnv(texto) {
  const salida = {}
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim()
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf('=')
    if (i <= 0) continue
    salida[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
  }
  return salida
}

/**
 * Lee y valida el archivo del demo. Tira `ConfigDemoError` con un mensaje que dice QUÉ falta y DÓNDE, nunca
 * con los valores (son claves). `leer` y `existe` se inyectan para los tests.
 */
export function leerConfigDemo({ ruta = RUTA_DEMO_ENV, requeridas = REQUERIDAS, leer = readFileSync, existe = existsSync } = {}) {
  if (!existe(ruta)) {
    throw new ConfigDemoError(`Falta ${ruta}. Crealo con las claves del proyecto DEMO (ver docs/plan-tutoriales.md, «El ambiente demo»).`)
  }
  const env = parsearEnv(leer(ruta, 'utf8'))
  const faltan = requeridas.filter((k) => !env[k])
  if (faltan.length) throw new ConfigDemoError(`En ${ruta} faltan: ${faltan.join(', ')}.`)

  const ref = env.DEMO_REF
  if (!FORMA_REF.test(ref)) {
    throw new ConfigDemoError(`DEMO_REF no tiene forma de ref de Supabase (20 letras minúsculas; tiene ${ref.length} caracteres).`)
  }
  return {
    ref,
    url: `https://${ref}.supabase.co`,
    publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    secretKey: env.DEMO_SECRET_KEY,
    dbUrl: armarDbUrl(env.DEMO_DB_URL || null, env.DEMO_DB_PASSWORD || null),
    ttsKey: env.TTS_KEY || null,
  }
}
