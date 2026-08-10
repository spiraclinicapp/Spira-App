# Dispensación de IP: la tarjeta de la visita se parte en dos — Design

- **Fecha:** 2026-08-09
- **Estado:** aprobado (brainstorming), pendiente de plan de implementación
- **Módulos:** Track (solicita) · Pharma (entrega)
- **Migración nueva:** `0071` — aplicar a mano en prod
- **Infraestructura nueva:** bucket privado de Supabase Storage (`ip-docs`), el primero del proyecto
- **Depende de:** 0023 (`visit_definitions.dispenses`), 0038 (IP macro + `v_ip_stock`),
  0050 (dispensación + `patient_medications`), 0054 (flujo de cuatro estados),
  0060 (origen declarado), 0006 (`is_assigned_coordinator`, `coordina_visita`, `has_min_role`)

## Por qué

La tarjeta **Dispensación** del detalle de visita hace hoy una sola cosa: pedir **medicación de
base** eligiéndola de la habilitada del paciente (`patient_medications` → `medications`, con lote,
EAN, FEFO y comprobante numerado). Eso es la **medicación concomitante**, aunque en ningún lado se
la llame así.

Del **producto en investigación (IP)** la app hoy solo sabe recibirlo. La `0038` lo dejó anotado
palabra por palabra en el comentario de la vista de stock:

> `v_ip_stock` — total de kits recibidos por protocolo. **La dispensación (Tajada 2) restará cuando exista.**

Esta especificación **es** la Tajada 2. Y hereda su principio rector, que también viene de la 0038
(definición del Director Médico):

> La trazabilidad por kit la provee el sponsor/IRT; Spira no la duplica — **"sin paralelismo"**.

Por eso el IP no se modela kit por kit. Se registra **que se entregó**, **cuántos kits** y **con qué
constancia**. Nada más. No es una simplificación: es la política.

## Decisiones del Director (2026-08-09)

| # | Decisión | Elegido |
|---|---|---|
| **D1** | ¿El IP pasa por Farmacia? | **Sí**, el mismo circuito que la concomitante. No es una constancia que Track archiva solo. |
| **D2** | ¿Quién adjunta? | **Track tilda y adjunta**; la farmacéutica lo ve, lo abre, **lo imprime** y lo entrega junto con la medicación. |
| **D3** | ¿Un pedido o dos? | **Un solo pedido por visita**: renglones de concomitante + constancia de IP, **un** comprobante. El paciente se acerca una vez. |
| **D4** | ¿Descuenta stock? | **Sí.** La farmacéutica declara cuántos kits entrega antes de que el pedido quede entregado. |
| **D5** | ¿Dónde viven los archivos? | **Supabase Storage**, bucket privado. Ver §7 (costos): la base de datos sale 5,9× más cara por GB y con 12,5× menos incluido. |
| **D6** | ¿Tope de tamaño? | **10 MB**, y la UI **sugiere PDF**. Sin recomprimir imágenes (§6.3). |

## Modelo mental

Una visita puede entregar **dos cosas distintas** que viajan en **un solo pedido**:

```
  visit_definitions.dispenses      →  sección "Medicación concomitante"  →  renglones + FEFO + lote
  visit_definitions.dispenses_ip   →  sección "Producto en investigación" →  tilde + constancia + kits

                        ambas alimentan LA MISMA dispensation_request
                                        │
                                        ▼
              un solo cajón en Farmacia · un solo comprobante · una sola entrega
```

Las dos secciones son **vistas sobre el mismo pedido**, no dos entidades. Es lo que se sigue de D3.

---

## 1 · Base de datos — migración `0071`

Un solo archivo, todo aditivo. **No hay baile de orden de deploy** (ver §1.6 para el porqué).

### 1.1 El candado nuevo

```sql
alter table public.visit_definitions
  add column if not exists dispenses_ip boolean not null default false;
```

Hace falta porque `dispenses` es **uno solo y lo valida el servidor**
(`create_dispensation_request`, [0050:189](../../../supabase/migrations/0050_pharma_dispensacion.sql)).
Sin el flag nuevo, **la visita típica de protocolo —que entrega IP y ninguna concomitante— quedaría
con la tarjeta diciendo "esta visita no entrega medicación"**, que es exactamente lo contrario de la
verdad.

Se expone en `v_patient_visits` y `v_track_visits`, siguiendo el patrón de recreación de la
[0068](../../../supabase/migrations/0068_estados_visita.sql). **Verificar el orden de dependencia
entre las dos vistas antes de dropear** (una referencia a la otra).

### 1.2 El tilde y los kits

```sql
alter table public.dispensation_requests
  add column if not exists includes_ip boolean not null default false;

alter table public.dispensations
  add column if not exists ip_kits integer;
-- check: ip_kits is null or ip_kits > 0
```

`ip_kits` vive en la **dispensación**, no en la solicitud, por el mismo motivo por el que el lote
vive ahí: es lo que **efectivamente salió**, declarado por quien lo entregó, y queda congelado en el
comprobante. Nace `null` y lo sella `mark_dispensation_ready`.

### 1.3 La constancia

```sql
create table public.dispensation_ip_documents (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.dispensation_requests(id) on delete restrict,
  storage_path   text not null unique,
  file_name      text not null,
  mime_type      text not null,
  size_bytes     integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by    uuid not null references public.users(id) on delete restrict,
  uploaded_at    timestamptz not null default now(),
  superseded_at  timestamptz
);

create unique index dispensation_ip_documents_vigente_uq
  on public.dispensation_ip_documents(request_id) where superseded_at is null;
```

**Las filas son inmutables y no se borran.** Reemplazar un archivo inserta una fila nueva y sella
`superseded_at` en la anterior. `on delete restrict` en las dos FKs por lo mismo. Es nota fuente:
un documento así no desaparece en silencio, y el `audit_log` transversal registra cada alta.

El índice parcial garantiza **una sola constancia vigente por pedido** a nivel base, no a nivel UI.

RLS: `select` para Pharma (cualquier rol) o el coordinador del protocolo de la visita
(`coordina_visita` sobre `request_id → visit_id`). Sin `insert`/`update`/`delete` directos: todo
pasa por las RPC de §1.5.

### 1.4 El bucket

Se crea **a mano en el dashboard** (Storage → New bucket), como las migraciones:

| | |
|---|---|
| Nombre | `ip-docs` |
| Público | **no** |
| `file_size_limit` | `10485760` (10 MB) |
| `allowed_mime_types` | `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` |

Los dos límites se imponen **del lado del servidor**, no con una validación de JS que se saltea.

**Ruta:** `{protocol_id}/{request_id}/{uuid}.{ext}`. El protocolo va primero **a propósito**: es lo
que la política de acceso necesita leer del path sin salir a consultar otras tablas.

**Políticas sobre `storage.objects`** (van en la migración; se corren como `postgres` en el SQL
editor, igual que el resto):

```sql
-- Helper: el protocolo dueño del objeto, o null si el path no tiene la forma esperada.
-- Existe para que un path malformado DENIEGUE en vez de reventar con un error de cast.
create or replace function public.ip_doc_protocol(p_name text)
returns uuid language sql immutable as $$
  select case when p_name ~ '^[0-9a-fA-F-]{36}/' then substring(p_name from 1 for 36)::uuid end;
$$;
```

- **select:** `bucket_id = 'ip-docs' and (has_min_role('pharma','viewer') or is_assigned_coordinator(public.ip_doc_protocol(name)))`
- **insert:** el mismo predicado pero con `has_min_role('pharma','operator')` en la rama de Farmacia.
- **update / delete: ninguna política.** Nadie borra ni pisa un objeto. La inmutabilidad de la
  evidencia queda garantizada en la capa de storage, no solo en la tabla.

### 1.5 Las RPC

Todas `security definer`, `revoke all from public`, `grant execute to authenticated`, con mensajes
de error en castellano sereno traducidos por `pharmaErrorMessage`.

| RPC | Firma | Qué hace |
|---|---|---|
| `create_dispensation_request` | `(p_visit_id uuid, p_items jsonb, p_notes text default null, p_origen text default 'track', p_includes_ip boolean default false)` | Igual que hoy **más** la rama de IP. Ver §1.6. |
| `set_request_ip` | `(p_request_id uuid, p_includes boolean) → void` | Prende o apaga el tilde en un pedido **todavía `solicitada`**. Apagarlo con constancia cargada la marca superada. |
| `attach_ip_document` | `(p_request_id uuid, p_path text, p_file_name text, p_mime text, p_size int) → uuid` | Marca superada la vigente, inserta la nueva, y pone `includes_ip = true`. Solo con el pedido `solicitada` o `preparando`. |
| `mark_dispensation_ready` | `(p_request_id uuid, p_ip_kits integer default null)` | Suma dos exigencias cuando `includes_ip`: **kits ≥ 1** y **constancia vigente cargada**. Sella `ip_kits`. |

Las dos que cambian de firma (`create_dispensation_request`, `mark_dispensation_ready`) se
**dropean y se recrean**, no se reemplazan: agregar un parámetro con `create or replace` crea una
**sobrecarga** y PostgREST tendría que elegir entre dos funciones. Es la misma trampa que documentó
la [0060](../../../supabase/migrations/0060_origen_solicitud_explicito.sql), y encima
`mark_dispensation_ready` devuelve `table(...)`, que `create or replace` tampoco puede cambiar.

La lectura del archivo **no necesita RPC**: el cliente pide una URL firmada de vida corta
(`createSignedUrl(path, 60)`), y la política de `select` de §1.4 es el candado.

### 1.6 Las reglas del pedido, escritas de una vez

`create_dispensation_request` valida, en este orden:

1. Si hay renglones → la visita tiene que tener `dispenses`.
2. Si `p_includes_ip` → la visita tiene que tener `dispenses_ip`.
3. Si no hay renglones **y** no hay IP → error: un pedido vacío no es un pedido.

**Cero renglones con IP es válido y es el caso típico.** Eso obliga a que
`mark_dispensation_ready` tolere un pedido sin ítems: la exigencia de "todo escaneado" se cumple
trivialmente y el bloque FEFO no corre. Hay que verificarlo explícitamente — hoy nunca recibió un
pedido vacío.

**Por qué no hay problema de orden de deploy:** PostgREST resuelve las RPC por parámetros con
nombre, y los parámetros nuevos van con default. Un front viejo que llame sin `p_includes_ip` o sin
`p_ip_kits` sigue resolviendo contra la función nueva. Es exactamente el razonamiento que dejó
escrito la [0060](../../../supabase/migrations/0060_origen_solicitud_explicito.sql), y por eso ahí
también se dropeó la firma vieja sin romper nada. Agregar una columna a una vista es aditivo por el
mismo motivo: el front viejo la ignora.

### 1.7 El stock, que se deriva en vez de mutarse

`v_ip_stock` pasa a restar. **No se agrega tabla de movimientos**: la vista lee las dispensaciones
vivas, así que cancelar una preparación devuelve los kits sola, sin riesgo de descuadre.

Se restan las dispensaciones en estado `lista` o `entregada` — el mismo corte que usa el stock de
base, que sale al **marcar lista** y no al entregar (decisión D4 del
[plan de dispensaciones](../../plan-rediseno-dispensaciones.md), 2026-07-18). Por eso los kits se
piden en *Marcar lista*: es el único momento en que el stock se mueve, y cancelar devuelve las dos
cosas juntas.

**Las columnas existentes no cambian de significado.** `total_kits` sigue siendo lo recibido — el
front lo lee así ([`ipStock.ts`](../../../src/data/pharma/ipStock.ts)). Se **agregan**
`kits_entregados` y `kits_disponibles`. Cambiarle el sentido a una columna sin cambiarle el nombre
es la clase de cosa que rompe una pantalla sin que nadie se entere.

---

## 2 · Capa de datos

- `visitDefinitions.ts` / `dayVisits.ts`: `dispenses_ip` en las interfaces y en los selects.
- `dispensations.ts`: `includes_ip` y `ip_kits` en las interfaces + en `REQUEST_COLS`;
  `p_includes_ip` en `createDispensationRequest`; `p_ip_kits` en `markDispensationReady`; funciones
  nuevas `setRequestIp` y `attachIpDocument`.
  El embed trae **todas** las constancias del pedido (`ip_documents:dispensation_ip_documents(...)`)
  y la vigente se resuelve en el cliente con un helper `constanciaVigente(r)`. Filtrar el embed
  server-side por `superseded_at is null` es la trampa conocida de PostgREST: el filtro sobre un
  embed **no excluye la fila padre**, solo deja el embed en null — el mismo motivo por el que
  `HISTORY_COLS` tuvo que usar `!inner`. Son dos o tres filas por pedido; no hay nada que optimizar.
- `ipStock.ts`: las dos columnas nuevas en `IpStockRow`.
- **`src/data/pharma/ipDocuments.ts` (nuevo):** la subida y la URL firmada. Es el único archivo que
  toca `supabase.storage`, para que el estreno de Storage tenga **un solo** punto de entrada.

**El orden de la subida es: crear el pedido → subir el archivo → `attach_ip_document`.** La ruta
necesita el `request_id`, que no existe antes. Si la subida falla, el pedido queda tildado y sin
constancia: es un estado legítimo, se muestra como tal (§3) y se reintenta. No se finge éxito.

---

## 3 · Track — la tarjeta partida en dos

`VisitDispensationPanel` gana dos secciones rotuladas: **Medicación concomitante** (lo de hoy,
intacto) y **Producto en investigación**. Cada una aparece según su flag.

| Situación | Qué se ve en la sección de IP |
|---|---|
| La visita no entrega IP | La sección no existe. |
| Sin pedido abierto | Tilde "Esta visita entrega IP" + zona de adjunto (arrastrar o elegir). |
| Pedido abierto, sin IP | `Agregar constancia de IP` (prende el tilde y adjunta en un gesto). |
| Pedido con IP, sin archivo | `Falta la constancia` en tono de aviso + zona de adjunto. **Se dice, no se calla.** |
| Pedido con IP y archivo | Nombre + peso + `Ver`, y `Reemplazar` mientras siga `solicitada`. |
| Ni concomitante ni IP | El mensaje sereno de siempre: *"Esta visita no entrega medicación."* |

La zona de adjunto **sugiere PDF** ("Preferentemente el PDF impreso del IRT") sin prohibir la
imagen: el PDF gana por mérito propio (pesa 10× menos, se imprime nítido, se puede buscar), no por
regla.

En la ficha del paciente (`readOnly`) todo esto es de solo lectura, con `Ver` habilitado.

---

## 4 · Pharma — el cajón

En `PanelPreparando`, **arriba** de los renglones (se entrega junto, y es lo que hay que imprimir
antes de armar el resto):

- Nombre del archivo, peso, quién lo subió y cuándo.
- **`Abrir e imprimir`** → URL firmada en pestaña nueva; se imprime desde el visor del navegador.
  No se finge una impresora: es el mismo criterio que ya rige para el comprobante
  ([plan de dispensaciones §6](../../plan-rediseno-dispensaciones.md)).
- **`Descargar`**.
- Sin constancia cargada: aviso claro de que falta, y `Marcar lista` deshabilitado **con el motivo
  escrito debajo** (§6.5.3 del plan de dispensaciones: ningún botón deshabilitado mudo).

En `Marcar lista`: campo **Kits de IP a entregar**, default `1`, obligatorio si `includes_ip`.

Un pedido **sin renglones** (IP solo) no muestra el campo de escaneo: muestra la constancia y el
campo de kits. `PanelLista` y `PanelEntregada` muestran la línea de IP y mantienen `Abrir` para
reimprimir.

**El tablero:** la card suma un distintivo de IP (ícono + `IP` en el pie, junto a las unidades), y
las que están tildadas sin constancia lo dicen ahí, no recién al abrir el cajón.

---

## 5 · El comprobante

`ComprobanteImprimible` suma un bloque cuando `ip_kits is not null`:

```
PRODUCTO EN INVESTIGACIÓN
────────────────────────────────────────────
2 kits · constancia adjunta (irt-asignacion.pdf)
```

El resto de la hoja no cambia. Sigue identificando al paciente por código IVRS, y sigue por el
mismo motivo de siempre: es nota fuente que se archiva y se comparte con monitores y sponsor.

---

## 6 · Lo que queda afuera, a propósito

### 6.1 Kit por kit, y los rangos de kits

`medication_receptions` guarda `kit_range_from` / `kit_range_to`, y da tentación cruzar el kit
entregado contra el rango recibido. **No se hace.** Es justo el paralelismo que la 0038 prohíbe: el
IRT es la fuente de verdad de qué kit fue a qué paciente, y una segunda contabilidad que puede
divergir es peor que ninguna.

### 6.2 Integración con el IRT

Fuera de alcance. La constancia es un archivo que sube una persona.

### 6.3 Recomprimir las imágenes

Achicar la foto en el navegador antes de subirla (4 MB → 300 KB) es habitual y acá está
**prohibido**: el archivo guardado dejaría de ser el que la persona eligió. Es evidencia. Si un
número de kit queda ilegible porque la recompresión le comió el borde a un dígito, el sistema
**alteró un documento fuente en silencio** — rompe *Original* y *Accurate* de ALCOA+. Mejor un
archivo grande y fiel que uno chico y retocado.

### 6.4 Firma digital del adjunto, y OCR

Fuera de alcance.

---

## 7 · Costos (verificado el 2026-08-09)

Precios vigentes de [Supabase](https://supabase.com/pricing): plan **Pro US$25/mes** con **100 GB**
de Storage y **250 GB** de egress incluidos; excedente **$0,0213/GB/mes** y **$0,09/GB**. El plan
**Free** incluye 1 GB de Storage.

Volumen declarado: **30 archivos/día** ≈ 660/mes, y **se acumulan** (archivo regulatorio, no se
borra). Con la constancia siendo un **PDF impreso desde el IRT o el mail** — que es texto, 50–300 KB
— y alguna foto ocasional:

| | |
|---|---|
| Por mes | ~290 MB |
| Por año | ~3,4 GB |
| Hasta agotar los 100 GB incluidos | **~30 años** |
| Egress (3 aperturas por archivo) | ~1 GB/mes contra 250 incluidos = **0,4%** |

**El almacenamiento no cuesta nada apreciable.** El costo real de la feature es otro: **si el
proyecto está en Free, esto obliga a pasar a Pro (US$25/mes) dentro del primer mes o dos.** Ese
salto es el 100% del gasto, y ocurre con cualquiera de las dos arquitecturas.

**Por qué no la base de datos:** 8 GB incluidos contra 100, y **$0,125/GB/mes** contra $0,0213 —
5,9× más caro por GB con 12,5× menos incluido. Y el disco de la base es lo que se respalda todos los
días: cada backup más pesado y cada restore más lento, un costo que se paga en tiempo.

---

## 8 · Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| **Estrena Storage en el proyecto.** Ninguna política de `storage.objects` fue escrita nunca acá. La primera siempre sale mal. | **Alta** | Verificación logueada obligatoria con **dos usuarios**: coordinador de otro protocolo (no debe ver el archivo) y farmacéutica (sí). No alcanza con que "ande" con el usuario admin de QA, que tiene los cinco módulos. |
| **La constancia cuelga del pedido, no de la visita.** Cancelar y rehacer el pedido obliga a re-adjuntar. | Media | Es correcto conceptualmente (es otro evento de dispensación), pero es fricción real en el mostrador. Queda declarado; si molesta en el uso, se revisa con el dato en la mano. |
| **`mark_dispensation_ready` nunca recibió un pedido sin renglones.** | Media | Es el caso típico del IP solo. Probarlo explícitamente antes de dar la migración por buena. |
| **Recrear `v_patient_visits` / `v_track_visits`** con el Director trabajando en paralelo. | Media | Verificar la dependencia entre las dos antes de dropear; stagear **por ruta**. |
| **El pedido queda tildado y sin archivo** si la subida falla después de crearse. | Baja | Es un estado legítimo y visible en las dos puntas (§3, §4), y `mark_dispensation_ready` no deja avanzar. No se finge éxito. |

---

## 9 · Verificación

Sin suite de tests: el gate es `npm run typecheck` verde **más** el recorrido logueado en el preview
(puerto 5250), con datos `TEST-*` creados por la sesión y borrados exactamente esos.

1. Definición de visita con `dispenses_ip` y **sin** `dispenses` → la tarjeta muestra **solo** la
   sección de IP, y no el cartel "esta visita no entrega medicación".
2. Tildar + adjuntar un PDF → nace el pedido con **cero renglones**; aparece en *Solicitadas*.
3. **Recargar la página** → la constancia sigue ahí. (El escaneo ya enseñó que lo que no se persiste
   miente.)
4. Intentar subir un archivo de 12 MB y un `.docx` → los rechaza **el bucket**, no el navegador.
5. Reemplazar la constancia → la anterior queda `superseded_at`, la vigente es una sola, y el
   `audit_log` tiene las dos altas.
6. Como farmacéutica: abrir e imprimir el archivo, `Marcar lista` con **2 kits** → comprobante
   emitido y `v_ip_stock` baja 2.
7. `Cancelar preparación` → **los 2 kits vuelven** y el comprobante desaparece.
8. Rehacer y `Entregar` → el stock **no** vuelve a bajar.
9. Una visita con concomitante **y** IP → **un** cajón, **un** comprobante con las dos cosas.
10. Con un coordinador de **otro** protocolo: la URL firmada del archivo **no** se puede pedir.
11. Borrar exactamente los registros `TEST-*` creados.

---

## 10 · Orden de ejecución

```
  1. Mock de la tarjeta partida al repo  ──►  aprobación del Director
     (CLAUDE.md: el mock va ANTES de implementar; desviarse de uno ya costó una reescritura)
     │
  2. Bucket ip-docs en el dashboard ──► confirmar
     │
  3. 0071 ──► aplicar en prod ──► registrar en supabase/README.md
     │
  4. Capa de datos (ipDocuments.ts + extensiones)
     │
  5. UI Track (tarjeta partida) ──► UI Pharma (cajón + kits) ──► comprobante
     │
  6. typecheck verde + recorrido §9 logueado
     │
  7. PR ──► el Director mergea
```

NO UNRESOLVED DECISIONS
