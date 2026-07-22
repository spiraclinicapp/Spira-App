# Carga de visitas históricas — generador

Transforma el Excel `Visitas estimada real (1).xlsx` en el script SQL de carga
(`out/carga-visitas-historicas.sql`) + un informe de discrepancias (`out/discrepancias.md`).

**Qué carga:** cronograma (`visit_definitions`) + personas (`patients`) + inscripciones
(`enrollments` con `randomization_date` + `ivrs_code`) de 4 protocolos. Al setear
`randomization_date`, el trigger `generate_patient_visits` genera las visitas con su
`estimated_date`; después el script rellena las `real_date` de las visitas ya ocurridas.

## Uso

```bash
# check rápido (imprime conteos)
node generar.mjs "Visitas estimada real (1).xlsx"

# genera out/ (SQL + discrepancias)
node generar.mjs "Visitas estimada real (1).xlsx" --build ./out
```

## Pasos para aplicar (los corre el Director en Supabase)

1. Aplicar la migración **`0062_enrollments_ivrs_code.sql`** primero.
2. Revisar `out/discrepancias.md` y resolver (typos de año, notas de texto, enrollments
   diferidos, desvíos estimada-vs-Spira).
3. Correr `out/carga-visitas-historicas.sql` en el SQL Editor en **dry-run** (termina en
   `rollback;`), mirar los `SELECT` de control, y recién ahí cambiar `rollback;` por `commit;`.

## Privacidad

`out/` y el `*.xlsx` están **gitignored**: traen nombres de paciente. Al repo va **solo la
lógica** (`parse-xlsx.mjs`, `mapeo.mjs`, `generar.mjs`), nunca los datos ni el SQL generado.

## Archivos

- `parse-xlsx.mjs` — lector .xlsx en Node puro (ZIP + XML), sin dependencias.
- `mapeo.mjs` — mapeo por protocolo: qué visitas hay, sus `offset_days` (derivados del Excel) y
  ventanas (±3, basal +3/−0), y la visita ancla. Anclas confirmadas con el Director.
- `generar.mjs` — extractor + emisores SQL + informe.

## Notas

- `enrolled_by` se setea al usuario más antiguo como "sistema"; cambialo por tu id si querés.
- Los códigos de protocolo del Excel (`CEREN-2`, `ACT18301`, `THESEUS`, `LTS 17231`) deben
  coincidir **exactos** con `protocols.code` en Spira (el script aborta si falta alguno).
