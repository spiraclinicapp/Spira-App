// Banco de pruebas de la RLS · la base: un Postgres en memoria (PGlite) con las migraciones REALES.
//
// No es un esquema de juguete: corre `supabase/migrations/NNNN_*.sql` enteras, en orden, en ~4 s. El
// 2026-09-28 las 145 dieron EXACTAMENTE las 136 policies de `pg_policies` de prod (comando, roles y
// texto; ver comparar-con-prod.mjs). Lo único inventado es el preludio de abajo: lo que en Supabase ya
// existe antes de la primera migración y ninguna migración crea.
//
// ⚠️ PGlite corre como SUPERUSUARIO, y un superusuario saltea la RLS entera (`force row level security`
// no alcanza). Todo lo que quiera probar permisos tiene que hacer `set role authenticated` antes de leer
// y `reset role` después — `comoPerfil()` lo hace. Las `security definer` siguen corriendo como su
// dueño, igual que en prod.
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const MIGRACIONES = join(RAIZ, 'supabase/migrations')

// Lo que Supabase trae de fábrica. Cada línea está porque alguna migración revienta sin ella:
//   · los roles: el primer `grant … to authenticated` aborta el exec entero si no existen;
//   · `supabase_realtime`: la 0007 le agrega tablas a la publicación;
//   · `auth.uid()`: lee `spira.uid`, así cada consulta elige de quién es (ver comoPerfil);
//   · `storage`: la 0071 y la 0142 le ponen policies a storage.objects.
const PRELUDIO = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_storage_admin nologin;
create schema extensions;
create publication supabase_realtime;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  last_sign_in_at timestamptz
);
create function auth.uid() returns uuid language sql stable as
  $f$ select nullif(current_setting('spira.uid', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb,
  created_at timestamptz default now());
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert on storage.objects to authenticated;
`

/** Los archivos de migración, en orden de aplicación. */
export function archivosDeMigracion() {
  return readdirSync(MIGRACIONES).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()
}

/** El archivo de la migración NNNN (acepta "146" o "0146"). */
export function migracion(numero) {
  const n = String(numero).padStart(4, '0')
  const f = archivosDeMigracion().find((a) => a.startsWith(`${n}_`))
  if (!f) throw new Error(`No existe la migración ${n} en supabase/migrations/.`)
  return { numero: n, archivo: f, sql: readFileSync(join(MIGRACIONES, f), 'utf8') }
}

/**
 * Una base con las migraciones aplicadas hasta `hasta` inclusive (todas si no se pasa).
 * Si una falla, el error dice cuál: casi siempre es un stub que falta en el preludio.
 */
export async function crearBase({ hasta } = {}) {
  const db = new PGlite({ extensions: { uuid_ossp, pgcrypto } })
  await db.exec(PRELUDIO)
  const tope = hasta == null ? null : String(hasta).padStart(4, '0')
  for (const f of archivosDeMigracion()) {
    if (tope && f.slice(0, 4) > tope) break
    try {
      await db.exec(readFileSync(join(MIGRACIONES, f), 'utf8'))
    } catch (e) {
      throw new Error(`${f}: ${e.message}`)
    }
  }
  return db
}

/**
 * Corre `sql` con la RLS de una persona: `uid` vacío es "sin sesión". Siempre deja la base como
 * superusuario al salir, aunque la consulta falle.
 */
export async function comoPerfil(db, uid, sql) {
  await db.exec(`set spira.uid = '${uid}'; set role authenticated;`)
  try {
    return (await db.query(sql)).rows
  } finally {
    await db.exec(`reset role; reset spira.uid;`)
  }
}
