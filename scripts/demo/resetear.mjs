// `npm run demo:resetear` — vuelve el proyecto DEMO a cero: vacía `public`, borra las cuentas y los archivos, y
// vuelve a aplicar las migraciones. Cada grabación arranca de los mismos datos (docs/plan-tutoriales.md, «Reset»).
// Al final, la semilla narrativa (semilla.mjs) y las sesiones sin contraseña de sus cuentas (sesion.mjs).
//
// ── POR QUÉ OBJETO POR OBJETO Y NO `drop schema public cascade` ──
// Supabase deja `public` con dueño `pg_database_owner` y con privilegios por defecto para `postgres` Y para
// `supabase_admin`. Esos últimos los guarda atados al schema, y `postgres` no es miembro de `supabase_admin`:
// si se borra el schema, se pierden para siempre y no se pueden recrear. Vaciándolo, el schema queda con los
// permisos de fábrica (leídos del demo recién creado el 2026-10-13).
//
// ── LOS CERROJOS ──
// `conectarDemo` pasa el cerrojo 1 (lista blanca del ref); acá se exige además la centinela PRESENTE (cerrojo 2):
// una base sin centinela no se resetea nunca, aunque esté vacía — esa sólo se migra.
import { conectarDemo } from './db.mjs'
import { GuardiaError, verificarCentinela } from './guardia.mjs'
import { migrar } from './migrar.mjs'
import { sembrar } from './semilla.mjs'
import { guardarSesiones } from './sesion.mjs'

/* Todo lo de `public`, en el orden en que se puede soltar. `cascade` se lleva lo que dependa (triggers sobre
   auth.users, policies de storage.objects que llaman funciones de public), y lo que pertenece a una extensión
   no se toca. Corre adentro de la transacción del script: o se vacía entero o no se toca nada. */
const VACIAR_PUBLIC = `
do $$
declare r record;
begin
  for r in select format('drop materialized view if exists public.%I cascade', matviewname) s
             from pg_matviews where schemaname = 'public' loop execute r.s; end loop;
  for r in select format('drop view if exists public.%I cascade', viewname) s
             from pg_views where schemaname = 'public' loop execute r.s; end loop;
  for r in select format('drop table if exists public.%I cascade', tablename) s
             from pg_tables where schemaname = 'public' loop execute r.s; end loop;
  for r in select format('drop %s if exists %s cascade',
                         case p.prokind when 'p' then 'procedure' when 'a' then 'aggregate' else 'function' end,
                         p.oid::regprocedure) s
             from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute r.s;
  end loop;
  for r in select format('drop type if exists public.%I cascade', t.typname) s
             from pg_type t
            where t.typnamespace = 'public'::regnamespace
              and t.typcategory <> 'A'
              and (t.typtype in ('e', 'd', 'r')
                   or (t.typtype = 'c' and exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind = 'c')))
              and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e') loop
    execute r.s;
  end loop;
  for r in select format('drop sequence if exists public.%I cascade', sequencename) s
             from pg_sequences where schemaname = 'public' loop execute r.s; end loop;
end
$$;`

export async function resetear(db, { log = console.log } = {}) {
  const estado = await verificarCentinela(db.consultar)
  if (estado !== 'presente') throw new GuardiaError('El reset exige la centinela del demo. Una base vacía no se resetea: se migra (`npm run demo:migrar`).')

  log('· Vacío public y el registro de migraciones…')
  await db.cliente.query('begin')
  try {
    await db.cliente.query(VACIAR_PUBLIC)
    await db.cliente.query('truncate demo.migraciones')
    await db.cliente.query('commit')
  } catch (e) {
    await db.cliente.query('rollback').catch(() => {})
    throw new Error(`No se pudo vaciar public (no se tocó nada): ${e.code ?? ''} ${e.message}`)
  }

  const [{ n: cuentas }] = await db.consultar('select count(*)::int n from auth.users')
  await db.cliente.query('delete from auth.users')
  log(`· ${cuentas} cuenta(s) borrada(s).`)
  await vaciarBucket(db.cfg, 'ip-docs', log)

  const migracion = await migrar(db, { log })
  const semilla = await sembrar(db, { log })
  await guardarSesiones(db.cfg, { log })
  return { ...migracion, semilla }
}

/** Storage no deja borrar archivos con SQL (los borra su API, que también limpia el almacenamiento físico). */
async function vaciarBucket(cfg, bucket, log) {
  const auth = { apikey: cfg.secretKey, Authorization: `Bearer ${cfg.secretKey}`, 'Content-Type': 'application/json' }
  const nombres = []
  const listar = async (prefijo) => {
    const r = await fetch(`${cfg.url}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: auth, body: JSON.stringify({ prefix: prefijo, limit: 1000 }) })
    if (!r.ok) throw new Error(`No se pudo listar el bucket ${bucket} (HTTP ${r.status}).`)
    for (const o of await r.json()) {
      const ruta = prefijo ? `${prefijo}/${o.name}` : o.name
      if (o.id) nombres.push(ruta); else await listar(ruta) // sin id = carpeta
    }
  }
  await listar('')
  if (nombres.length) {
    const r = await fetch(`${cfg.url}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: auth, body: JSON.stringify({ prefixes: nombres }) })
    if (!r.ok) throw new Error(`No se pudieron borrar los archivos de ${bucket} (HTTP ${r.status}).`)
  }
  log(`· ${nombres.length} archivo(s) borrado(s) de ${bucket}.`)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/scripts/demo/resetear.mjs')) {
  const db = await conectarDemo().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1) })
  try {
    await resetear(db)
  } catch (e) {
    console.error(`✗ ${e.message}`)
    process.exitCode = 1
  } finally {
    await db.cliente.end()
  }
}
