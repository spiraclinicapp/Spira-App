// Conexión a la base del proyecto DEMO. La ÚNICA puerta: abre sólo después de que la guardia (cerrojo 1) dice que
// la cadena apunta al demo, y quien la usa para escribir tiene que pasar además el cerrojo 2 (`verificarCentinela`)
// ya conectado. Plan: docs/plan-tutoriales.md, «El ambiente demo».
import pg from 'pg'
import { leerConfigDemo, REQUERIDAS_DB } from './config.mjs'
import { verificarDestino } from './guardia.mjs'

/** Lee la config, pasa el cerrojo 1 y conecta. Devuelve el cliente y un `consultar(sql)` que devuelve filas. */
export async function conectarDemo() {
  const cfg = leerConfigDemo({ requeridas: REQUERIDAS_DB })
  verificarDestino({ demoRef: cfg.ref, apiUrl: cfg.url, dbUrl: cfg.dbUrl })
  // Supabase exige TLS; el certificado del pooler no viene en la cadena de confianza de Node en Windows.
  const cliente = new pg.Client({ connectionString: cfg.dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20_000 })
  try {
    await cliente.connect()
  } catch (e) {
    const pausado = /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|timeout/i.test(String(e?.message ?? e))
    throw new Error(pausado
      ? 'El demo no responde. ¿Está pausado? Despausalo desde el dashboard de Supabase.'
      : `No se pudo conectar al demo: ${e?.code ?? ''} ${String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, '<url>')}`)
  }
  const consultar = async (sql, params) => (await cliente.query(sql, params)).rows
  return { cfg, cliente, consultar }
}
