# Banco de pruebas de la RLS

Un Postgres en memoria ([PGlite](https://pglite.dev)) con **las migraciones reales del repo**, datos sintéticos en todas las tablas y doce perfiles de usuario. Sirve para probar un cambio de permisos (policies, funciones de alcance, vistas `security_invoker`) **antes** de pasarle el SQL al Director: no hay acceso SQL a prod y la RLS falla en silencio, con menos filas y sin ningún error.

Nació con la 0146 (2026-09-28): 129 policies reescritas para que dejen de preguntar los permisos por fila, sin cambiar quién ve qué. Ver la §11 de `docs/bitacora/2026-09-28.md`.

## Los tres comandos

```bash
# 1 · ¿El banco es fiel? Las migraciones contra las policies vigentes en prod.
node scripts/banco-rls/comparar-con-prod.mjs policies.csv [--hasta NNNN]

# 2 · ¿Una migración cambia quién ve qué?
node scripts/banco-rls/equivalencia.mjs NNNN [--control] [--traza]

# 3 · ¿Cuánto tardan las consultas de las pantallas, antes y después?
node scripts/banco-rls/tiempos.mjs [NNNN]
```

- **`comparar-con-prod`** necesita el CSV de `pg_policies` de prod. La consulta está en la cabecera del script; hay que exportarla a CSV desde el editor, con el límite en «No limit». Correlo antes de confiar en el banco si pasó tiempo: una policy hecha a mano en el dashboard deja a prod distinto del repo sin que nada avise. El 2026-09-28 dio 136 de 136.
- **`equivalencia`** hace dos pruebas entre el antes y el después de aplicar la migración NNNN:
  - evalúa cada policy fila por fila, con cada perfil;
  - saca una foto de lo que cada perfil ve en cada tabla con RLS y en cada vista.

  **Verde quiere decir que no cambió nada.** Si la migración cambia permisos a propósito, la lista de diferencias es lo que cambió: leela contra lo que tenía que cambiar. Una foto distinta **con la misma cantidad de filas** suele ser de esquema (una columna nueva); **con otra cantidad**, es de permisos.
- **`--control`** niega a propósito una policy y exige que el banco lo detecte. Si no lo detecta, el verde no vale.
- **`tiempos`** siembra con el volumen de prod (~1.000 visitas). **Sus números son de PGlite: sirven para comparar antes contra después, no como tiempos de prod.** Para prod:
  - medí con la sesión real, en la pestaña de red del navegador;
  - compará contra `explain analyze` en el editor, que corre sin RLS;
  - la diferencia entre los dos es lo que cuesta la RLS.

## Qué hay adentro

| Archivo | Qué |
|---|---|
| `base.mjs` | PGlite + el preludio de Supabase (roles, `auth`, `storage`, `supabase_realtime`, `uuid_ossp`, `pgcrypto`) + las migraciones en orden. `comoPerfil()` corre una consulta con la RLS de una persona. |
| `sembrar.mjs` | Los doce perfiles y el sembrado genérico por catálogo: sigue el orden de las FKs, usa los valores de los enums y las listas de los `check`. Es determinista. |

## Trampas conocidas

- **PGlite corre como superusuario y saltea la RLS entera.** Para probar permisos hay que usar `set role authenticated` (lo hace `comoPerfil`); `force row level security` no alcanza.
- **Muchas inserciones fallidas seguidas agotan la pila de PGlite** (`54001`). Lo que revienta es la consulta siguiente, aunque sea de catálogo. El sembrado corta cada tabla a los ~12 fallos.
- **Si una migración nueva no corre acá**, casi siempre falta un stub en el preludio de `base.mjs`, algo que Supabase trae de fábrica.
- **Una tabla con policies y sin filas sembradas no prueba nada.** `equivalencia` las lista al final. Si aparece una, el sembrado necesita un caso especial, como `patient_visits` en `sembrar.mjs`.
- **No cubre `storage.objects`**: las policies de archivos se prueban con dos usuarios reales.
