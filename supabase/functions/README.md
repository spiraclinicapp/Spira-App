# Edge Functions

Acá viven las Edge Functions de Spira. **El fuente de este repo es la fuente de verdad**, igual que
con las migraciones: lo que corre en Supabase tiene que ser exactamente lo que hay acá.

| Función | Qué hace | Desde |
|---|---|---|
| `admin-usuarios` | Única puerta a la Admin API de Auth: crear cuentas, generar links para definir o restablecer la contraseña, bloquear el ingreso, eliminar cuentas vírgenes | 2026-08-25 (`docs/plan-alta-de-cuentas.md`, PR-2) |

---

## Cómo se despliega (sin CLI)

En esta máquina **no hay CLI de Supabase** ni `config.toml`, y la operativa del proyecto ya es
aplicar a mano desde el dashboard. Las Functions se despliegan igual que el SQL:

1. Dashboard → **Edge Functions** → **Deploy a new function** → *Via Editor*.
2. Nombre: **exactamente** el del directorio (`admin-usuarios`). El front la invoca por ese nombre;
   si no coincide, el error que se ve es un 404 genérico que no dice nada útil.
3. Pegar el contenido de `index.ts` tal cual y desplegar.

Para actualizarla, el mismo camino sobre la función ya existente. **Editar sólo en el dashboard es
como editar el schema sin migración**: al toque siguiente nadie sabe qué está corriendo. Si se
cambia algo ahí, traerlo a este repo en el mismo momento.

## Los secrets

`admin-usuarios` usa tres variables, y **las tres las inyecta Supabase sola**: `SUPABASE_URL`,
`SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. No hay que cargar nada a mano.

> ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` saltea toda la RLS.** Sólo puede leerse desde adentro de una
> Function. Nunca en el front, nunca en un `.env` del repo, nunca en un log. Si alguna vez se
> filtra, hay que rotarla desde el dashboard: con esa clave se lee y escribe la base entera.

## `verify_jwt` queda ENCENDIDO

Es el default y así se deja: la plataforma rechaza cualquier request sin un JWT válido antes de que
la función se ejecute. Es una reja más antes de la reja propia — `admin-usuarios` igual verifica
por su cuenta que quien llama tenga **gerencia**, porque un JWT válido sólo prueba que sos alguien,
no que seas administrador.

## Cómo se prueba que la reja funciona

La prueba que importa **no** es que un administrador pueda crear una cuenta: es que alguien que no
es administrador **no** pueda.

Ojo con el usuario de QA: tiene los cinco módulos, así que **no reproduce las fallas de permisos**.
Para probar de verdad hace falta una sesión sin gerencia. La respuesta esperada es **403** con
*"No tenés permiso para administrar cuentas."*, y sin que se haya creado nada.
