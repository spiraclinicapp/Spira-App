---
name: cierre-jornada
description: Usar cuando el Director pide cerrar la jornada o sacar release — "hace bitácora y handoff", "el protocolo de cierre", "cerralo acá", "voy a tirar un clear", "actualizá el tag", "bitacorda" — o antes de un /clear con trabajo sin documentar.
---

# Cierre de jornada (y release)

El ritual es fijo: no lo reconstruyas grepeando el repo. Dos modos: **cierre** (siempre)
y **release** (solo si sale versión). El Director dispara con una frase corta; ejecutá el
modo completo sin re-preguntar los pasos.

## Antes de todo (el working copy es COMPARTIDO)

1. `git fetch` + `git branch --show-current` + `git status` — el Director commitea y
   mergea en paralelo; el árbol suele tener cambios/borrados ajenos a tu sesión.
2. Stagear **por ruta** (`git add <archivos>`), nunca `git add -A` ni `.`.
3. Commits en `main` los bloquea el hook de guardia. Si el Director autorizó commitear
   en main (release, bitácora), anteponé `SPIRA_ALLOW_MAIN=1` al comando.

## Modo cierre (siempre)

| Paso | Cómo |
|---|---|
| 1. Bitácora | `docs/bitacora/YYYY-MM-DD.md`. **Leé la última entrada y calcá** su estructura: título `# Bitácora · fecha — tema · estado del release`, líneas **Proyecto / Autor / Contexto / Ramas**, secciones numeradas (Resumen de la jornada, un § por hilo, **Lo no-obvio**, **Git — estado de las ramas**, **Pendientes**). Si el día ya tiene entrada, anexá — no la pises. |
| 2. Handoff | `docs/bitacora/handoff-YYYY-MM-DD.md`. Calcar el último: primera línea con links al handoff anterior y a la narrativa del día; secciones **Dónde estás / Lo hecho esta jornada / Decisiones tomadas (no re-discutir) / PRÓXIMO PASO (próxima sesión) / Cómo verificar al retomar**. |
| 3. Memoria | Actualizar `spira-estado-proyecto.md` y `MEMORY.md` en la memoria persistente. **Read SIEMPRE antes de Edit** — editar memoria solo grepeada es la causa #1 de errores acá. |
| 4. Commit | Por ruta. Push solo si el Director lo pide o ya era la operativa del día. Al final, decí explícito qué quedó local y qué en origin. |

## Modo release (además del cierre)

1. **Confirmá la versión** si hay ambigüedad (ya pasó que un tag apuntaba a otra línea).
2. `node scripts/release.mjs X.Y.Z "Texto del changelog." [--dry]` — bumpea `package.json`,
   los **2 lugares** de `package-lock.json` y agrega la entrada a `src/lib/version.ts`
   (versión corta `X.Y`, una línea, tono sereno). No edites el lock a mano (2 matches).
3. Si hubo migraciones: fila nueva en el índice de `supabase/README.md` (el
   `**Aplicada en prod (fecha).**` va solo con confirmación del Director) + el número en
   CLAUDE.md ("La última aplicada va por la NNNN"). CI corre `scripts/check-migraciones.mjs`.
4. Gate: `npm run build` verde. No afirmes "listo" sin eso.
5. Merge a `main` **solo si el Director lo pide**. PRs: no hay `gh` ni self-merge — API
   REST + `git credential fill` + Node; el Director mergea.
6. `git tag -a vX.Y.Z -m "…"` + `git push --follow-tags`.

## Errores conocidos (no repetir)

- Editar CLAUDE.md / README / memoria habiéndolos solo grepeado → "File has not been read yet".
- Olvidarse del índice de migraciones (quedó desactualizado 2 veces; hoy lo vigila CI).
- Prometer push/merge y dejarlo colgado sin avisar.
- Pisar la bitácora del día cuando ya tenía una entrada de otra sesión.
