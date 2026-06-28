# Pharma Tajada 1a — `linkCode` (guardado on-demand de códigos) · Diseño

> Cierra el escáner de la vista Recepción: convierte el "código no reconocido" en una
> asociación código→medicamento que se aprende y persiste. Última pieza de código de la 1a
> (queda aparte el sembrado, que necesita el Excel curado).

**Fecha:** 2026-06-28 · **Rama:** `feat/pharma-1a` · **Migración base:** `0032` (ya en prod).

## Contexto

`resolveCode(code)` ya resuelve un código de barras a su medicamento leyendo `medication_codes`
([medications.ts:79](../../../src/data/pharma/medications.ts#L79)). Cuando el código no está
mapeado, hoy el escáner de la recepción dead-end-ea con un mensaje
([NewReceptionModal.tsx:58](../../../src/views/pharma/NewReceptionModal.tsx#L58)) y el header del
archivo dice literalmente *"On-demand de códigos NUEVOS: a futuro"*. Este diseño implementa ese
futuro: el operador asocia el código desconocido a un medicamento y queda guardado para la
próxima vez.

## Decisión de diseño (aprobada)

**Enfoque A — panel inline de asociación.** Al escanear un código desconocido aparece, debajo del
escáner, un control sobrio: un desplegable de medicamentos + "Asociar y agregar". Calca el camino
de éxito que ya existe (escaneo conocido → auto-asigna al protocolo + agrega renglón), es un solo
gesto y todo por desplegable (cero texto libre). Se descartó el "enseñar-sobre-el-renglón" por
acoplar la asociación al ciclo de vida del renglón y repartir la acción en dos lugares.

**Defaults acordados:**
1. El desplegable lista el **catálogo global** (`useMedications`), no solo los asignados al
   protocolo: un código mapea a un medicamento global; si no estaba asignado, se auto-asigna.
2. Solo se **vincula a medicamentos existentes**. Dar de alta un medicamento nuevo es la vista
   Medicamentos (fuera de alcance de 1a). YAGNI.
3. **Persistencia inmediata al confirmar**: el mapeo código→medicamento es verdad de catálogo,
   independiente de esta recepción; se guarda al apretar "Asociar", aunque después se cancele la
   recepción.

## Capa de datos — `src/data/pharma/medications.ts`

Función nueva `linkCode(code, medicationId)`, simétrica a `resolveCode`. **Insert directo, no
RPC**: la RLS `"pharma administra codigos"` (0032, líneas 199-201) ya autoriza `INSERT` a
`pharma operator+`, y el grant a `authenticated` está. Evita una migración nueva y tocar prod.
Calca la forma con que `create_medication` inserta el GTIN (0032, líneas 230-231).

```ts
/**
 * Asocia un código de barras escaneado a un medicamento del catálogo (insert directo en
 * medication_codes; RLS "pharma administra codigos" lo permite a operator+). On-demand desde la
 * recepción cuando un código no se reconoce. code es único global (0032) → 23505 si ya está
 * mapeado a otro medicamento. code_type queda en 'ean13' por el default de la columna
 * (DataMatrix/GS1 = Tajada 1b).
 */
export async function linkCode(
  code: string,
  medicationId: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase
    .from('medication_codes')
    .insert({ medication_id: medicationId, code: code.trim() })
  if (error) return { error: linkCodeMessage(error.code, error.message), code: error.code }
  return { error: null }
}
```

**Mensajes de error:** el `23505` (código único ya mapeado) necesita texto propio, porque el
genérico de `pharmaErrorMessage` habla de "lote repetido". Un helper local mínimo:

```ts
function linkCodeMessage(code: string | undefined, raw: string): string {
  if (code === '23505') return 'Ese código ya figura asociado a otro medicamento.'
  return pharmaErrorMessage(code, raw) // 42501 (sin permiso) y el resto delegan
}
```

Nota: en un `INSERT`, un fallo de RLS `with check` devuelve `42501` explícito (no el "0 filas
silenciosas" de los `update`/`delete`), así que el manejo de permiso es directo.

## UI — `src/views/pharma/NewReceptionModal.tsx`

- **Estado nuevo:** `unknownCode: string | null` (código escaneado sin asociar). Opcional
  `linking: boolean` para el botón ocupado.
- **Hook nuevo en el modal:** `useMedications()` para el catálogo global del desplegable de
  asociación (el desplegable de renglón sigue usando `assigned`).
- **`handleScan`:** cuando `resolveCode` da `null`, en vez de solo `scanMsg`, setea
  `unknownCode = code`.
- **Panel inline** (render solo si `unknownCode != null`), debajo del escáner, estética calma:
  texto *"Código «XXXX» sin asociar. Elegí el medicamento:"* + `<select>` del catálogo global +
  botón **"Asociar y agregar"** + botón sobrio **"Descartar"** (limpia `unknownCode`).
- **Al confirmar:** `linkCode(unknownCode, medId)`. Si error → mostrarlo en el panel. Si OK →
  auto-asignar al protocolo si falta (`assignMedicationToProtocol`, igual que el escaneo
  conocido) → `addRow(medId)` → limpiar panel → `protocolMeds.refetch()` → `scanMsg` de
  confirmación con el nombre. Reescanear ese código ahora resuelve solo.

## Bordes y no-alcance

- Si se escanea otro código desconocido con el panel abierto, el segundo **reemplaza** al primero
  (KISS).
- **Fuera de alcance:** alta de medicamento inline; selector de `code_type` (1b, DataMatrix/GS1).

## Observación — auditoría (deuda, no se toca acá)

`medication_codes` se creó en la 0032 **sin** trigger `audit_row` (a diferencia de
`protocol_medications`, 0032 líneas 320-323), así que los inserts de `linkCode` **no** quedan en
`audit_log`. Para 1a es aceptable: es metadata de catálogo, no cadena de custodia ni dato de
paciente. Pero por consistencia con la postura "audit_log transversal" —y porque un mapeo errado
podría arrastrar a dispensar el producto equivocado— conviene auditarlo. **Mejora futura:**
migración aparte que agregue el trigger de auditoría a `medication_codes` (replicar el patrón de
0032:320-323). Anotada como chip; no es tarea de esta tajada.

## Verificación

No hay tests. Gate: `npm run typecheck` verde + prueba funcional como **pharma-leader**
(los RPC/RLS no corren como postgres), con registros `TEST-*`:
escanear un código inventado → aparece el panel → elegir medicamento → "Asociar y agregar" →
el renglón se agrega precargado → crear/verificar la recepción → reescanear el mismo código →
ahora resuelve directo (sin panel).

## Referencias

- Migración base: [`0032_pharma_catalogo_global.sql`](../../../supabase/migrations/0032_pharma_catalogo_global.sql)
  (tabla `medication_codes` líneas 41-47; RLS líneas 199-201; insert de GTIN líneas 230-231).
- Capa de datos: [`medications.ts`](../../../src/data/pharma/medications.ts).
- Vista: [`NewReceptionModal.tsx`](../../../src/views/pharma/NewReceptionModal.tsx).
- Handoff: [`docs/bitacora/handoff-2026-06-27.md`](../../bitacora/handoff-2026-06-27.md).
