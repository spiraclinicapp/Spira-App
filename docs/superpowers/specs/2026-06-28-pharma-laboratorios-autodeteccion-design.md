# Pharma — Laboratorios con autodetección por código de barra · Diseño

> Suma el **laboratorio** al catálogo de medicación y lo **autodetecta** por el prefijo del código
> de barra (el segmento de empresa GS1), aprendiéndolo on-demand igual que los códigos de
> medicamento. Pedido del Director: el laboratorio se necesita firme para "jugar con la droga" en
> la dispensación.

**Fecha:** 2026-06-28 · **Rama:** `feat/pharma-1a` · **Migración:** `0033` (nueva).

## Contexto

El catálogo (`medications`) tiene droga, nombre, unidad y código, pero **no laboratorio**. Ninguna
fuente gratis trae el laboratorio en bloque (ver memoria `pharma-sembrado-fuentes`), pero el GTIN
**sí lo lleva escondido**: después del `779` (Argentina) viene el **prefijo de empresa GS1**, que
identifica al laboratorio. Los datos reales del centro lo confirman (productos del mismo lab
comparten los primeros ~7-8 dígitos). Entonces, igual que con los códigos de medicamento, lo
**aprendemos al escanear**: no hace falta comprar la base de GS1.

## Modelo (migración 0033)

- **`laboratorios`** (id, name único): catálogo global → el desplegable.
- **`medications.laboratorio_id`** (FK nullable, `on delete set null`): el laboratorio del
  medicamento. Verdad firme para dispensación.
- **`laboratorio_codes`** (id, prefix único, laboratorio_id FK `on delete cascade`): prefijo de
  código de barra → laboratorio. **Espejo de `medication_codes`**, pero para prefijos.
- RLS/grants espejo de `medication_codes`: ven pharma/gerencia/contable; administra `operator+`.
- RPC `create_laboratorio(p_name)` (operator+). RPC `create_medication` redefinida para aceptar
  `p_laboratorio_id` (drop+recreate; el default null la mantiene compatible hacia atrás).
- Auditoría (`audit_row`) en ambas tablas nuevas.

## Autodetección (en el cliente, capa de datos)

La lógica de prefijo vive en el cliente (es UX, fácil de iterar):
- `labPrefixOf(code)` → los primeros **8 dígitos** (`779` + 5; lo que agrupa bien en los datos del
  centro). Decisión: longitud de captura fija razonable, ajustable.
- `resolveLabByCode(code)` → lee `laboratorio_codes`, devuelve el laboratorio cuyo prefijo
  conocido **más largo** sea inicio del código (longest-prefix match, robusto ante longitud
  variable). `null` si ninguno coincide.
- `linkLabPrefix(code, labId)` → insert directo del prefijo → laboratorio (RLS operator+, ignora
  23505 si ya existe). Aprende el prefijo.

## UI (primer corte: alta de medicamento)

En `NewMedicationForm`:
- Desplegable de **laboratorio** (con "＋ Nuevo laboratorio…" al vuelo, igual que las drogas).
- Al tipear/escanear el **GTIN**, se llama `resolveLabByCode`: si hay match, **autorellena** el
  laboratorio y lo marca como detectado. Si no, elegís del desplegable.
- Al guardar: `createMedication({..., laboratorio_id})` + `linkLabPrefix(gtin, labId)` para aprender
  el prefijo (si había GTIN + laboratorio).

**No-alcance de este corte:** mostrar el laboratorio en el catálogo/recepción/dispensación
(iteración siguiente) y la autodetección dentro del panel `linkCode` de recepción (se puede sumar
después con el mismo `resolveLabByCode`).

## Verificación

`npm run typecheck` verde + prueba funcional (pharma-leader, tras aplicar la 0033): alta de
medicamento con un GTIN → elegir laboratorio → guardar; nueva alta con un GTIN del **mismo
prefijo** → el laboratorio se autorellena solo.

## Referencias

- Migración base: [`0032`](../../../supabase/migrations/0032_pharma_catalogo_global.sql) ·
  Memoria `pharma-sembrado-fuentes`, `pharma-ip-vs-base-modelo`.
- Código: `src/data/pharma/laboratorios.ts` (nuevo) · `medications.ts` · `NewMedicationForm.tsx`.
