# Dispensación de IP — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usá `superpowers:subagent-driven-development` (recomendada)
> o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que una visita pueda entregar **producto en investigación** —constancia adjunta +
kits declarados— por el mismo circuito que la medicación concomitante, en un solo pedido.

**Arquitectura:** la tarjeta *Dispensación* del detalle de visita se parte en dos secciones que
alimentan **una sola** `dispensation_request`. La constancia vive en un bucket privado de Supabase
Storage (el primero del proyecto) con su metadato en una tabla hija inmutable. Los kits se declaran
al **entregar** y `v_ip_stock` los resta derivándolos, sin tabla de movimientos.

**Fuentes de verdad:**
- Diseño y decisiones: [`docs/superpowers/specs/2026-08-09-dispensacion-ip-design.md`](../specs/2026-08-09-dispensacion-ip-design.md)
- Visual: [`design_handoff_dispensacion_ip/`](../../../design_handoff_dispensacion_ip/README.md) (v6, aprobado)
- **El mock manda en todo lo visual.** Desviarse de un mock existente ya costó una reescritura completa.

---

## Global Constraints

- **No hay suite de tests en este repo.** El ciclo de verificación de cada tarea es, por CLAUDE.md:
  **`npm run typecheck` verde + verificación logueada en el preview (puerto 5250)**. Donde este plan
  dice "verificar", hay pasos concretos con el resultado esperado. **No inventes un test runner.**
- **No hay acceso SQL a producción.** Las migraciones las aplica **el Director a mano** en el
  dashboard de Supabase. El SQL tiene que correr **tal cual**, sin placeholders `<...>`.
- **Migraciones inmutables y numeradas.** La última aplicada es la `0070`. Esta feature usa la
  **`0071`**. Nunca editar una migración ya aplicada ni renumerar.
- **Datos reales en prod.** Para probar, crear solo registros con prefijo `TEST-*` y borrar
  exactamente esos. Nunca borrar en lote por categoría.
- **Git:** verificar la rama antes de cada commit (hay hook que bloquea `main`); **stagear siempre
  por ruta**, nunca `git add -A`. Rama de trabajo: `feat/dispensacion-ip`.
- **Estilo:** CSS con variables de `src/styles/tokens.css` (sin Tailwind), íconos Lucide vía
  `components/Icon.tsx`, TypeScript strict, comentarios y copy en **castellano rioplatense**.
- **El realce de estado es elevación, nunca un borde de color.** El color se reserva para significado.
- **Tope de archivo: 10 MB.** Tipos: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`,
  `image/heic`, `image/heif`. **Las imágenes no se recomprimen** (alteraría un documento fuente).
- **Copy fijo del box de adjunto:** `Arrastrá la constancia o elegí un archivo` /
  `Preferentemente el PDF · hasta 10 MB`.
- **Punto abierto que no bloquea:** la lista de motivos del desplegable de "fuera de cronograma" se
  implementa con la propuesta de la Tarea 9 y se corrige con una línea cuando el Director la confirme.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0071_dispensacion_ip.sql` | **Crear.** Todo el cambio de base. |
| `src/data/pharma/ipDocuments.ts` | **Crear.** Único archivo que toca `supabase.storage`: subir, URL firmada, imprimir por blob. |
| `src/data/pharma/dispensations.ts` | **Modificar.** Campos nuevos + `attachIpDocument` + `p_ip_kits`. |
| `src/data/pharma/ipStock.ts` | **Modificar.** Columnas nuevas de `v_ip_stock`. |
| `src/data/dayVisits.ts` · `src/data/visitDefinitions.ts` | **Modificar.** `dispenses_ip`. |
| `src/styles/tokens.css` | **Modificar.** `--spira-acc-deep` con su inverso en oscuro. |
| `src/views/track/Panel.tsx` | **Modificar.** Variante destacada (`highlight`). |
| `src/views/pharma/ConstanciaIp.tsx` | **Crear.** Dropzone + previsualizador, reusado por Track y Pharma. |
| `src/views/pharma/VisitDispensationPanel.tsx` | **Modificar.** La tarjeta partida + fuera de cronograma. |
| `src/views/pharma/dispensaciones/PanelPreparando.tsx` · `PanelLista.tsx` | **Modificar.** Bloque de IP, kits, pop-up. |
| `src/views/pharma/dispensaciones/ComprobanteImprimible.tsx` | **Modificar.** Líneas de IP y de excepción. |
| `src/views/track/ScheduleDefinitionForm.tsx` · `ScheduleEditor.tsx` | **Modificar.** El flag `dispenses_ip`. |

---

### Task 1: El bucket `ip-docs`

**Lo hace el Director en el dashboard.** Va primero porque la Tarea 2 escribe políticas sobre él.

**Archivos:** ninguno (acción de dashboard).

**Interfaces:**
- Produce: un bucket privado llamado `ip-docs` con límites server-side.

- [ ] **Paso 1: Pasarle al Director estas instrucciones, textuales**

> En Supabase → **Storage → New bucket**:
> - **Name:** `ip-docs`
> - **Public bucket:** **NO** (queda privado)
> - **File size limit:** `10` MB
> - **Allowed MIME types:** `application/pdf, image/jpeg, image/png, image/webp, image/heic, image/heif`
>
> Avisame cuando esté creado. Todavía no se puede subir nada: las políticas van en la 0071.

- [ ] **Paso 2: Esperar la confirmación**

No seguir sin ella. Las políticas de la 0071 sobre un bucket inexistente **no fallan**, y eso
esconde el error hasta el primer intento de subida.

- [ ] **Paso 3: Anotarlo**

Agregar a `supabase/README.md`, en la sección de infraestructura, la línea:
`Bucket privado \`ip-docs\` (constancias de IP, 10 MB, PDF/imagen) — creado en prod (2026-__-__).`

---

### Task 2: Migración 0071

**Archivos:**
- Crear: `supabase/migrations/0071_dispensacion_ip.sql`
- Modificar: `supabase/README.md` (índice de migraciones)

**Interfaces:**
- Consume: el bucket de la Tarea 1; los helpers `has_min_role`, `is_assigned_coordinator`,
  `coordina_visita` (0006).
- Produce: columnas `visit_definitions.dispenses_ip`, `dispensation_requests.includes_ip` /
  `off_schedule` / `off_schedule_reason`, `dispensations.ip_kits`; tabla
  `dispensation_ip_documents`; RPC `attach_ip_document(uuid,text,text,text,int) → uuid`;
  `create_dispensation_request(uuid,jsonb,text,text,text) → uuid`;
  `deliver_dispensation(uuid,integer) → void`; vista `v_ip_stock` con `kits_entregados` y
  `kits_disponibles`.

- [ ] **Paso 1: Crear el archivo con el encabezado y el flag del cronograma**

```sql
-- Spira · Migración 0071 — Dispensación de Producto en Investigación (IP).
-- Aplicar A MANO en el SQL Editor (como postgres), después de la 0070. IDEMPOTENTE.
--
-- REQUISITO PREVIO: el bucket privado `ip-docs` tiene que existir (Storage → New bucket,
-- 10 MB, PDF/imagen). Las políticas de §6 no fallan si no existe — fallan las subidas.
--
-- QUÉ HABILITA: la visita entrega IP (además de, o en vez de, medicación concomitante). La
-- constancia del IRT se adjunta desde Coordinación y la farmacéutica la ve, la imprime y declara
-- cuántos kits salieron. Todo en UN solo pedido y UN solo comprobante.
--
-- PRINCIPIO HEREDADO DE LA 0038 (Director Médico): "la trazabilidad por kit la provee el
-- sponsor/IRT; Spira no la duplica". Por eso NO se modela kit por kit: se registra que se entregó,
-- cuántos kits y con qué constancia.
-- ============================================================================

-- 1 · El candado del cronograma para IP.
--     `dispenses` es uno solo y lo valida el servidor (0050). Sin este flag aparte, la visita
--     típica de protocolo —que entrega IP y ninguna concomitante— quedaría diciendo "esta visita
--     no entrega medicación", que es lo contrario de la verdad.
alter table public.visit_definitions
  add column if not exists dispenses_ip boolean not null default false;
comment on column public.visit_definitions.dispenses_ip is
  'true = esta visita entrega producto en investigación. Independiente de `dispenses` (base). 0071.';
```

- [ ] **Paso 2: Recrear `v_track_visits` con la columna nueva**

`dispenses` solo aparece en `v_track_visits` (`0068:163`), no en `v_patient_visits`. Así que se
recrea **una sola** vista, y no hace falta tocar la otra ni respetar orden de dependencia.

Copiar **el cuerpo exacto** de `supabase/migrations/0068_estados_visita.sql`, líneas **144 a 183**
(desde `create view public.v_track_visits ...` hasta el `;` final), y agregar **una línea** justo
debajo de `coalesce(vd.dispenses, false) as dispenses,`:

```sql
  coalesce(vd.dispenses_ip, false) as dispenses_ip,
```

Precedido de:

```sql
-- 2 · La vista del día expone el flag nuevo. Aditivo: el front viejo ignora la columna, así que
--     NO hay orden de deploy que respetar (a diferencia de la 0068, que sí fue breaking).
drop view if exists public.v_track_visits;
```

- [ ] **Paso 3: Columnas de la solicitud y de la dispensación**

```sql
-- 3 · La marca de IP, los kits y la excepción.
alter table public.dispensation_requests
  add column if not exists includes_ip         boolean not null default false,
  add column if not exists off_schedule        boolean not null default false,
  add column if not exists off_schedule_reason text;

alter table public.dispensations
  add column if not exists ip_kits integer;

comment on column public.dispensation_requests.includes_ip is
  'true = el pedido lleva IP. Lo sella el servidor copiando visit_definitions.dispenses_ip al crear:
   NO lo declara el cliente. Se guarda en vez de mirarse en vivo porque el cronograma puede cambiar
   después y el pedido tiene que recordar lo que era cierto cuando se pidió. 0071.';
comment on column public.dispensation_requests.off_schedule is
  'true = dispensación fuera de cronograma (la visita no dispensaba). Exige motivo. 0071.';
comment on column public.dispensations.ip_kits is
  'Kits de IP efectivamente entregados. NULL hasta la entrega; lo sella deliver_dispensation. 0071.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dispensations_ip_kits_chk') then
    alter table public.dispensations
      add constraint dispensations_ip_kits_chk check (ip_kits is null or ip_kits > 0);
  end if;
end $$;

-- El punto de este check: NO EXISTE una dispensación fuera de cronograma sin motivo. Que el
-- desplegable de la UI sea obligatorio no alcanza; el candado va donde no se puede saltear.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dispensation_requests_off_schedule_chk') then
    alter table public.dispensation_requests
      add constraint dispensation_requests_off_schedule_chk
      check (not off_schedule or (off_schedule_reason is not null and btrim(off_schedule_reason) <> ''));
  end if;
end $$;
```

- [ ] **Paso 4: La tabla de constancias, inmutable**

```sql
-- 4 · La constancia. Filas INMUTABLES y sin borrado: es nota fuente. Reemplazar inserta una fila
--     nueva y sella `superseded_at` en la anterior. El índice parcial garantiza UNA sola vigente
--     por pedido a nivel base, no a nivel UI.
create table if not exists public.dispensation_ip_documents (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.dispensation_requests(id) on delete restrict,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by   uuid not null references public.users(id) on delete restrict,
  uploaded_at   timestamptz not null default now(),
  superseded_at timestamptz
);
comment on table public.dispensation_ip_documents is
  'Constancia del IRT adjunta a un pedido de dispensación. Filas inmutables, sin borrado: nota fuente. 0071.';

create unique index if not exists dispensation_ip_documents_vigente_uq
  on public.dispensation_ip_documents(request_id) where superseded_at is null;
create index if not exists idx_ip_documents_request
  on public.dispensation_ip_documents(request_id);

alter table public.dispensation_ip_documents enable row level security;

drop policy if exists "ver constancias de IP" on public.dispensation_ip_documents;
create policy "ver constancias de IP" on public.dispensation_ip_documents for select using (
  public.has_min_role('pharma','viewer')
  or exists (
    select 1 from public.dispensation_requests r
    where r.id = dispensation_ip_documents.request_id
      and public.coordina_visita(r.visit_id)
  )
);
-- Sin policies de insert/update/delete: todo pasa por attach_ip_document (security definer).
```

- [ ] **Paso 5: El helper del path y las políticas de storage**

```sql
-- 5 · Ruta de los objetos: {protocol_id}/{request_id}/{uuid}.{ext}. El protocolo va PRIMERO
--     porque es lo que la política necesita leer del path sin salir a consultar otras tablas.
--     El helper devuelve NULL si el path no tiene la forma esperada: así un path malformado
--     DENIEGA en vez de reventar con un error de cast.
create or replace function public.ip_doc_protocol(p_name text)
returns uuid language sql immutable as $$
  select case when p_name ~ '^[0-9a-fA-F-]{36}/' then substring(p_name from 1 for 36)::uuid end;
$$;

-- 6 · Políticas sobre el bucket. Sin update ni delete: la inmutabilidad de la evidencia queda
--     garantizada en la capa de storage, no solo en la tabla.
drop policy if exists "ip docs lectura" on storage.objects;
create policy "ip docs lectura" on storage.objects for select using (
  bucket_id = 'ip-docs' and (
    public.has_min_role('pharma','viewer')
    or public.is_assigned_coordinator(public.ip_doc_protocol(name))
  )
);

drop policy if exists "ip docs alta" on storage.objects;
create policy "ip docs alta" on storage.objects for insert with check (
  bucket_id = 'ip-docs' and (
    public.has_min_role('pharma','operator')
    or public.is_assigned_coordinator(public.ip_doc_protocol(name))
  )
);
```

- [ ] **Paso 6: `attach_ip_document` (nueva, completa)**

```sql
-- 7 · Adjuntar la constancia. Marca superada la vigente e inserta la nueva, en una transacción.
create or replace function public.attach_ip_document(
  p_request_id uuid,
  p_path       text,
  p_file_name  text,
  p_mime       text,
  p_size       int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_status      request_status;
  v_includes_ip boolean;
  v_visit_id    uuid;
  v_id          uuid;
begin
  select r.status, r.includes_ip, r.visit_id
    into v_status, v_includes_ip, v_visit_id
  from public.dispensation_requests r where r.id = p_request_id for update;

  if not found then
    raise exception 'No se encontró la solicitud' using errcode = 'check_violation';
  end if;
  if not (public.has_min_role('pharma','operator') or public.coordina_visita(v_visit_id)) then
    raise exception 'Sin permiso para adjuntar la constancia' using errcode = '42501';
  end if;
  if not v_includes_ip then
    raise exception 'Esta solicitud no lleva producto en investigación' using errcode = 'check_violation';
  end if;
  if v_status not in ('solicitada','preparando') then
    raise exception 'La solicitud ya está cerrada: no se puede cambiar la constancia' using errcode = 'check_violation';
  end if;

  update public.dispensation_ip_documents
     set superseded_at = now()
   where request_id = p_request_id and superseded_at is null;

  insert into public.dispensation_ip_documents
    (request_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (p_request_id, p_path, p_file_name, p_mime, p_size, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.attach_ip_document(uuid, text, text, text, int) from public;
grant execute on function public.attach_ip_document(uuid, text, text, text, int) to authenticated;
```

- [ ] **Paso 7: `create_dispensation_request` (drop + create)**

Partir del cuerpo **exacto** de `supabase/migrations/0060_origen_solicitud_explicito.sql`, líneas
**32 a 110**, y aplicarle estos cambios. Se dropea primero porque agregar un parámetro con
`create or replace` crea una **sobrecarga** y PostgREST quedaría entre dos funciones.

```sql
-- 8 · La creación del pedido aprende dos cosas: el IP (que deduce del cronograma) y la excepción
--     (que exige motivo). El parámetro nuevo va con default → el front viejo sigue resolviendo
--     contra esta función y no hay orden de deploy que respetar.
drop function if exists public.create_dispensation_request(uuid, jsonb, text, text);
```

Cambios sobre el cuerpo copiado:

1. La firma pasa a:
   `(p_visit_id uuid, p_items jsonb, p_notes text default null, p_origen text default 'track', p_off_schedule_reason text default null)`
2. En el `declare`, sumar: `v_dispenses_ip boolean; v_off boolean;`
3. Donde hoy lee `coalesce(vd.dispenses, false) into v_dispenses`, leer también
   `coalesce(vd.dispenses_ip, false)` en `v_dispenses_ip`.
4. Reemplazar el bloque que hoy rechaza cuando `not v_dispenses` por, **en este orden**:

```sql
  v_off := p_off_schedule_reason is not null and btrim(p_off_schedule_reason) <> '';

  -- Fuera de cronograma: se saltea la validación, pero SOLO con motivo. Es la única puerta.
  if v_off then
    v_dispenses    := true;
    v_dispenses_ip := true;
  else
    if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 and not v_dispenses then
      raise exception 'Esta visita no entrega medicación' using errcode = 'check_violation';
    end if;
    if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 and not v_dispenses_ip then
      raise exception 'Un pedido sin renglones y sin producto en investigación no es un pedido'
        using errcode = 'check_violation';
    end if;
  end if;
```

5. En el `insert into public.dispensation_requests (...)`, sumar las columnas
   `includes_ip, off_schedule, off_schedule_reason` con los valores
   `v_dispenses_ip, v_off, nullif(btrim(coalesce(p_off_schedule_reason,'')),'')`.
6. Al final, los grants con la firma nueva:

```sql
revoke all on function public.create_dispensation_request(uuid, jsonb, text, text, text) from public;
grant execute on function public.create_dispensation_request(uuid, jsonb, text, text, text) to authenticated;
```

- [ ] **Paso 8: `mark_dispensation_ready` — exigir la constancia**

Conserva su firma, así que va con `create or replace`. Partir del cuerpo exacto de
`supabase/migrations/0058_fix_mark_ready_dispensation_id.sql`, líneas **34 al final de la función**,
y sumar este bloque **después** de la validación de escaneos pendientes y **antes** de crear la
fila en `dispensations`:

```sql
  -- Con IP, no se emite comprobante sin constancia: el papel que la farmacéutica imprime y
  -- entrega junto con la medicación tiene que existir antes de que exista el comprobante.
  if (select r.includes_ip from public.dispensation_requests r where r.id = p_request_id) then
    if not exists (
      select 1 from public.dispensation_ip_documents d
      where d.request_id = p_request_id and d.superseded_at is null
    ) then
      raise exception 'Falta la constancia del producto en investigación' using errcode = 'check_violation';
    end if;
  end if;
```

**Ojo con el pedido sin renglones** (IP solo, el caso típico): la exigencia de "todo escaneado" se
cumple trivialmente con cero ítems y el bloque FEFO no itera. Verificar que la función **no** tenga
un `raise` para "sin ítems"; si lo tiene, acotarlo a `not includes_ip`.

- [ ] **Paso 9: `deliver_dispensation` (drop + create) y `v_ip_stock`**

```sql
-- 9 · La entrega sella los kits. Es el ÚNICO momento en que el IP sale del stock: en el IP no hay
--     lote ni FEFO, así que no hay nada que reservar antes, y `entregada` es el paso irreversible
--     — el lugar donde corresponde congelar un dato que después no se corrige.
drop function if exists public.deliver_dispensation(uuid);
```

Partir del cuerpo de `deliver_dispensation` en
`supabase/migrations/0054_dispensacion_flujo_cuatro_estados.sql`, cambiar la firma a
`(p_dispensation_id uuid, p_ip_kits integer default null)`, y sumar antes de sellar la entrega:

```sql
  if (select r.includes_ip
        from public.dispensation_requests r
        join public.dispensations d on d.request_id = r.id
       where d.id = p_dispensation_id) then
    if p_ip_kits is null or p_ip_kits < 1 then
      raise exception 'Indicá cuántos kits de producto en investigación se entregaron'
        using errcode = 'check_violation';
    end if;
    update public.dispensations set ip_kits = p_ip_kits where id = p_dispensation_id;
  end if;
```

Más los grants con la firma nueva (`uuid, integer`). Y la vista:

```sql
-- 10 · El stock de IP pasa a restar. Se DERIVA, no se muta: sin tabla de movimientos y sin rama
--      de devolución, porque el corte es `entregada`, que es irreversible.
--      `total_kits` NO cambia de significado (sigue siendo lo recibido; el front lo lee así):
--      se agregan dos columnas.
create or replace view public.v_ip_stock with (security_invoker = true) as
with recibido as (
  select r.protocol_id, count(*)::int as recepciones, coalesce(sum(r.total_kits), 0)::int as total_kits
  from public.medication_receptions r
  where r.tipo = 'investigacion' and r.status = 'verificada' and r.total_kits is not null
  group by r.protocol_id
), entregado as (
  select e.protocol_id, coalesce(sum(d.ip_kits), 0)::int as kits
  from public.dispensations d
  join public.dispensation_requests dr on dr.id = d.request_id
  join public.patient_visits pv on pv.id = dr.visit_id
  join public.enrollments e on e.id = pv.enrollment_id
  where d.ip_kits is not null and d.status = 'entregada'
  group by e.protocol_id
)
select
  rc.protocol_id,
  p.code  as protocol_code,
  p.name  as protocol_name,
  rc.recepciones,
  rc.total_kits,
  coalesce(en.kits, 0)                 as kits_entregados,
  rc.total_kits - coalesce(en.kits, 0) as kits_disponibles
from recibido rc
join public.protocols p on p.id = rc.protocol_id
left join entregado en on en.protocol_id = rc.protocol_id;
comment on view public.v_ip_stock is
  'Stock de IP por protocolo: total_kits = recibido, kits_entregados = salido (dispensaciones
   entregadas), kits_disponibles = la resta. 0071.';
```

- [ ] **Paso 10: Revisar el archivo entero antes de entregarlo**

Correr, y leer la salida:

```bash
node -e "const s=require('fs').readFileSync('supabase/migrations/0071_dispensacion_ip.sql','utf8');const m=s.match(/<[^>]*\.\.\.[^>]*>|\bTODO\b|\bTBD\b/g);console.log(m?'PLACEHOLDERS: '+m.join(', '):'sin placeholders');console.log('statements:',(s.match(/;\s*$/gm)||[]).length)"
```

Esperado: `sin placeholders`. Un placeholder literal ya se corrió una vez en prod.

- [ ] **Paso 11: Commit y entrega al Director**

```bash
git add supabase/migrations/0071_dispensacion_ip.sql
git commit -m "feat(db): 0071 - dispensación de producto en investigación"
```

Pasarle el archivo al Director para que lo aplique. **No seguir con las tareas 4+ hasta que
confirme.** Apenas confirme, registrarlo en `supabase/README.md` con **Aplicada en prod (fecha)** —
CI lo vigila con `scripts/check-migraciones.mjs`.

---

### Task 3: `ipDocuments.ts` — subida, URL firmada e impresión

**Archivos:**
- Crear: `src/data/pharma/ipDocuments.ts`
- Modificar: `src/data/pharma/index.ts` (reexportar)

**Interfaces:**
- Consume: `attach_ip_document` (Tarea 2), `supabase` de `src/lib/supabase.ts`.
- Produce: `uploadIpDocument(requestId, protocolId, file) → {error, id?}`,
  `ipDocumentUrl(path) → Promise<string | null>`, `printIpDocument(path) → Promise<string | null>`,
  `IP_MAX_BYTES`, `IP_MIME_TYPES`, `formatBytes(n) → string`.

- [ ] **Paso 1: Escribir el archivo completo**

```ts
import { supabase } from '../../lib/supabase'
import { pharmaErrorMessage } from './errors'

/** Tope del bucket, repetido acá SOLO para avisar antes de subir. El límite de verdad lo impone
 *  el bucket server-side: una validación de JS se saltea, la del bucket no. */
export const IP_MAX_BYTES = 10 * 1024 * 1024

/** Mismos tipos que declara el bucket. El PDF va primero porque es el que sugerimos. */
export const IP_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]

const BUCKET = 'ip-docs'

/** "148 KB" / "2,4 MB" — para mostrar el peso del archivo sin mentir con decimales de más. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** La extensión que corresponde al tipo, para no confiar en el nombre que trae el archivo. */
function extOf(file: File): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(file.name)
  if (m) return m[1].toLowerCase()
  return file.type === 'application/pdf' ? 'pdf' : 'bin'
}

/**
 * Sube la constancia y la registra. El orden es: el pedido YA existe → subir → registrar, porque
 * la ruta necesita el `request_id`. Si la subida falla, el pedido queda sin constancia: es un
 * estado legítimo, se muestra como tal y se reintenta. No se finge éxito.
 *
 * El protocolo va primero en la ruta porque es lo que la política de storage lee del path.
 */
export async function uploadIpDocument(
  requestId: string,
  protocolId: string,
  file: File,
): Promise<{ error: string | null; id?: string }> {
  if (file.size > IP_MAX_BYTES) {
    return { error: `El archivo pesa ${formatBytes(file.size)} y el máximo es 10 MB.` }
  }
  if (!IP_MIME_TYPES.includes(file.type)) {
    return { error: 'Formato no admitido. Se aceptan PDF, JPG, PNG, WEBP y HEIC.' }
  }

  const path = `${protocolId}/${requestId}/${crypto.randomUUID()}.${extOf(file)}`
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (up.error) return { error: `No se pudo subir la constancia: ${up.error.message}` }

  const { data, error } = await supabase.rpc('attach_ip_document', {
    p_request_id: requestId,
    p_path: path,
    p_file_name: file.name,
    p_mime: file.type,
    p_size: file.size,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message) }
  return { error: null, id: data as string }
}

/** URL firmada de vida corta para ver el archivo. Sesenta segundos alcanzan para abrirlo. */
export async function ipDocumentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
  if (error) return null
  return data?.signedUrl ?? null
}

/**
 * Imprime la constancia en un clic. El truco es el blob: el archivo se baja y se sirve desde
 * NUESTRO origen, y recién ahí se puede llamar a `print()` sobre el iframe. Con la URL firmada a
 * pelo no se puede — es otro origen y el navegador bloquea el print() cruzado.
 *
 * Devuelve null si salió bien, o un mensaje si no. El llamador tiene que ofrecer igual la salida
 * de "abrir en pestaña": esto depende del navegador y no queremos que un fallo deje sin imprimir.
 */
export async function printIpDocument(path: string): Promise<string | null> {
  const url = await ipDocumentUrl(path)
  if (!url) return 'No se pudo abrir la constancia.'
  try {
    const res = await fetch(url)
    if (!res.ok) return 'No se pudo descargar la constancia para imprimirla.'
    const blobUrl = URL.createObjectURL(await res.blob())
    const frame = document.createElement('iframe')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    frame.src = blobUrl
    document.body.appendChild(frame)
    frame.onload = () => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      // El objeto vive hasta que el diálogo se cierra; limpiarlo antes cancela la impresión.
      window.setTimeout(() => { URL.revokeObjectURL(blobUrl); frame.remove() }, 60_000)
    }
    return null
  } catch {
    return 'No se pudo imprimir. Probá con “Abrir en pestaña”.'
  }
}
```

- [ ] **Paso 2: Reexportar**

Agregar a `src/data/pharma/index.ts`, siguiendo el formato de las líneas vecinas:

```ts
export * from './ipDocuments'
```

- [ ] **Paso 3: Verificar que compila**

Run: `npm run typecheck`
Esperado: sin salida de errores (termina en silencio).

- [ ] **Paso 4: Commit**

```bash
git add src/data/pharma/ipDocuments.ts src/data/pharma/index.ts
git commit -m "feat(pharma): capa de datos de la constancia de IP"
```

---

### Task 4: Extender la capa de datos

**Archivos:**
- Modificar: `src/data/pharma/dispensations.ts`, `src/data/pharma/ipStock.ts`,
  `src/data/dayVisits.ts`, `src/data/visitDefinitions.ts`

**Interfaces:**
- Consume: las columnas de la Tarea 2.
- Produce: `DispensationRequestRow` con `includes_ip`, `off_schedule`, `off_schedule_reason`,
  `ip_documents: IpDocumentRow[]`; `DispensationRow.ip_kits`; `constanciaVigente(r) → IpDocumentRow | null`;
  `deliverDispensation(id, ipKits?)`; `createDispensationRequest(..., offScheduleReason?)`;
  `useUltimaDispensacion(enrollmentId) → QueryResult<UltimaDispensacionRow[]>`;
  `DayVisitRow.dispenses_ip`; `IpStockRow.kits_entregados` / `.kits_disponibles`.

- [ ] **Paso 1: Tipos y columnas en `dispensations.ts`**

Agregar la interfaz y el helper:

```ts
/** Constancia del IRT adjunta al pedido (tabla `dispensation_ip_documents`, 0071). */
export interface IpDocumentRow {
  id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  uploaded_at: string
  /** NULL = es la vigente. Reemplazar no borra: sella esta fecha en la anterior. */
  superseded_at: string | null
}

/**
 * La constancia vigente del pedido. Se resuelve ACÁ y no filtrando el embed: en PostgREST un
 * filtro sobre un embed no excluye la fila padre, solo deja el embed en null — el mismo motivo por
 * el que `HISTORY_COLS` tuvo que usar `!inner`. Son dos o tres filas por pedido.
 */
export function constanciaVigente(r: DispensationRequestRow): IpDocumentRow | null {
  return r.ip_documents?.find((d) => d.superseded_at === null) ?? null
}
```

En `DispensationRequestRow`, sumar:

```ts
  /** El pedido lleva IP. Lo sella el servidor desde el cronograma; el cliente no lo declara (0071). */
  includes_ip: boolean
  /** Dispensación fuera de cronograma + su motivo obligatorio (0071). */
  off_schedule: boolean
  off_schedule_reason: string | null
  ip_documents: IpDocumentRow[]
```

En `DispensationRow`, sumar:

```ts
  /** Kits de IP entregados. NULL hasta la entrega (0071). */
  ip_kits: number | null
```

En `REQUEST_COLS`, sumar `includes_ip, off_schedule, off_schedule_reason, ` a la lista de campos
sueltos, `ip_kits` dentro del embed de `dispensations:dispensations(...)`, y este embed nuevo antes
del de `visit:`:

```ts
  'ip_documents:dispensation_ip_documents(id, storage_path, file_name, mime_type, size_bytes, uploaded_at, superseded_at), ' +
```

- [ ] **Paso 2: Las dos firmas de mutación**

En `createDispensationRequest`, sumar el parámetro y pasarlo:

```ts
  /**
   * Motivo de la dispensación FUERA DE CRONOGRAMA (0071). Con motivo, la base saltea la
   * validación del cronograma; sin motivo, la excepción no existe. Es la única puerta.
   */
  offScheduleReason: string | null = null,
```

y en el `rpc(...)`: `p_off_schedule_reason: offScheduleReason,`

En `deliverDispensation`:

```ts
export async function deliverDispensation(
  dispensationId: string,
  /** Kits de IP entregados (0071). Obligatorio si el pedido lleva IP; la base lo exige. */
  ipKits: number | null = null,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('deliver_dispensation', {
    p_dispensation_id: dispensationId,
    p_ip_kits: ipKits,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}
```

- [ ] **Paso 3: El aviso de los 30 días**

Agregar al final de `dispensations.ts`:

```ts
/** Cuántos días mira hacia atrás el aviso de dispensación reciente (0071). */
export const DIAS_AVISO_DISPENSACION = 30

/** Última dispensación entregada del enrolamiento, para el aviso de D12. */
export interface UltimaDispensacionRow {
  entregada_el: string
  visita: string | null
  ip_kits: number | null
  items: number
}

/**
 * La última dispensación ENTREGADA del mismo enrolamiento dentro de los últimos 30 días.
 *
 * Va por consulta común y no por RPC: Track ya puede leer las solicitudes de las visitas de su
 * protocolo por RLS, y acotarla al enrolamiento la deja dentro de lo que el coordinador ya ve. No
 * cruza protocolos a propósito — además de que la RLS no lo dejaría, la comparación útil es contra
 * el mismo estudio.
 */
export function useUltimaDispensacion(enrollmentId: string | null) {
  return useSupabaseQuery<UltimaDispensacionRow[]>(
    async (c) => {
      if (!enrollmentId) return { data: [], error: null }
      const desde = new Date(Date.now() - DIAS_AVISO_DISPENSACION * 86_400_000)
        .toISOString().slice(0, 10)
      const { data, error } = await c
        .from('dispensation_requests')
        .select(
          'updated_at, visit:patient_visits!inner(visit_name, enrollment_id), ' +
          'items:dispensation_request_items(id), ' +
          'dispensations:dispensations!inner(status, delivered_at, ip_kits)',
        )
        .eq('visit.enrollment_id', enrollmentId)
        .eq('dispensations.status', 'entregada')
        .gte('dispensations.delivered_at', `${desde}T00:00:00`)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (error) return { data: null, error }
      const row = (data as unknown as {
        visit: { visit_name: string | null } | null
        items: { id: string }[]
        dispensations: { delivered_at: string; ip_kits: number | null }[]
      }[] | null)?.[0]
      if (!row) return { data: [], error: null }
      return {
        data: [{
          entregada_el: row.dispensations[0]?.delivered_at ?? '',
          visita: row.visit?.visit_name ?? null,
          ip_kits: row.dispensations[0]?.ip_kits ?? null,
          items: row.items?.length ?? 0,
        }],
        error: null,
      }
    },
    [enrollmentId],
  )
}
```

- [ ] **Paso 4: Los otros tres archivos**

- `src/data/pharma/ipStock.ts` → en `IpStockRow`, sumar:
  ```ts
    /** Kits ya entregados y los que quedan (0071). `total_kits` sigue siendo lo RECIBIDO. */
    kits_entregados: number
    kits_disponibles: number
  ```
- `src/data/dayVisits.ts` → en `DayVisitRow`, junto a `dispenses`:
  ```ts
    /** coalesce(visit_definitions.dispenses_ip, false): si la visita entrega IP (0071). */
    dispenses_ip: boolean
  ```
  y sumar `dispenses_ip` a la lista de columnas del select si la hay.
- `src/data/visitDefinitions.ts` → sumar `dispenses_ip: boolean` a las **dos** interfaces que hoy
  declaran `dispenses` (líneas 22 y 97), y al input de alta/edición.

- [ ] **Paso 5: Verificar**

Run: `npm run typecheck`
Esperado: sin errores. Si aparece `Property 'dispenses_ip' is missing`, falta agregarlo en algún
constructor de `VisitDefinitionInput` — completarlo, no castear.

- [ ] **Paso 6: Commit**

```bash
git add src/data/pharma/dispensations.ts src/data/pharma/ipStock.ts src/data/dayVisits.ts src/data/visitDefinitions.ts
git commit -m "feat(pharma): la capa de datos conoce el IP, la excepción y el aviso de 30 días"
```

---

### Task 5: Tokens del acento profundo + `Panel` destacado

**Archivos:**
- Modificar: `src/styles/tokens.css`, `src/views/track/Panel.tsx`

**Interfaces:**
- Produce: variables `--spira-acc-deep` (y su inverso en oscuro); `Panel` acepta
  `highlight?: boolean`.

- [ ] **Paso 1: Tokens**

En `src/styles/tokens.css`, dentro de `:root`, después del bloque de acentos por módulo:

```css
  /* —— Acento PROFUNDO: para TEXTO sobre un tinte del acento ——
     El acento a secas sobre un tinte al 6% da 4,14:1, y el título de un panel va a 14px en
     negrita, donde AA pide 4,5:1. El profundo llega a 6,37:1 sin perder el color.
     REGLA: todo color que se oscurezca para leerse sobre tinte claro necesita su versión
     CLARA para oscuro (ver abajo) — si no, queda en 1,85:1, o sea invisible. Medido. */
  --spira-acc-deep-track:  #0F5F57;
  --spira-acc-deep-pharma: #6E5620;
```

Y dentro de `[data-theme='dark']`:

```css
  --spira-acc-deep-track:  #9DE6D6;  /* menta: en oscuro hay que ACLARAR, no oscurecer */
  --spira-acc-deep-pharma: #E8CE8A;
```

- [ ] **Paso 2: La variante destacada del `Panel`**

En `src/views/track/Panel.tsx`, sumar la prop y el estilo. El realce es **carta teñida**: velo del
acento sobre toda la card, título en el acento profundo y el ícono en una pastilla teñida. **Nunca
un borde de acento alrededor.**

```tsx
export function Panel({ title, icon, accent, aside, highlight = false, deepAccent, children }: {
  title: string
  icon: IconName
  accent: string
  aside?: ReactNode
  /**
   * Realce de la tarjeta (pedido del Director Médico para Dispensación, 2026-08-09): carta teñida.
   * NO es un borde de acento — eso está prohibido en este sistema. Se apaga cuando la sección no
   * tiene nada que hacer: una tarjeta sin trabajo no debería llamar la atención.
   */
  highlight?: boolean
  /** Acento PROFUNDO para el título sobre el tinte (ver tokens). Obligatorio si `highlight`. */
  deepAccent?: string
  children: ReactNode
}) {
  return (
    <div style={{
      border: '1px solid var(--spira-line)', borderRadius: 14, padding: '14px 16px',
      background: highlight ? `${accent}0F` : 'var(--spira-surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {highlight ? (
          <span style={{ flex: '0 0 auto', width: 26, height: 26, borderRadius: 8, background: `${accent}21`, display: 'grid', placeItems: 'center', marginLeft: -2 }}>
            <Icon name={icon} size={15} color={accent} />
          </span>
        ) : (
          <Icon name={icon} size={15} color={accent} />
        )}
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14, color: highlight ? deepAccent : undefined }}>{title}</span>
        {aside && <span style={{ marginLeft: 'auto', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center' }}>{aside}</span>}
      </div>
      {children}
    </div>
  )
}
```

`${accent}0F` es el acento al 6% y `${accent}21` al 13%, en hex de 8 dígitos — el mismo recurso que
ya usa `VisitProcedures` para el tinte de la fila realizada.

- [ ] **Paso 3: Verificar en el preview**

Run: `npm run typecheck` → sin errores.

Después, con el preview corriendo, medir en la consola del navegador que el título destacado pasa
AA. Abrir un modal de visita y ejecutar:

```js
getComputedStyle(document.querySelector('[role=dialog]')).color
```

La verificación real de contraste se hace al final de la Tarea 8, cuando el panel ya está teñido.

- [ ] **Paso 4: Commit**

```bash
git add src/styles/tokens.css src/views/track/Panel.tsx
git commit -m "feat(ui): acento profundo para texto sobre tinte + Panel destacado"
```

---

### Task 6: El flag `dispenses_ip` en el cronograma

Va **antes** que la tarjeta: sin esto no hay forma de crear una visita que entregue IP, y toda la
verificación de las tareas siguientes quedaría en el aire.

**Archivos:**
- Modificar: `src/views/track/ScheduleDefinitionForm.tsx`, `src/views/track/ScheduleEditor.tsx`

**Interfaces:**
- Consume: `VisitDefinitionInput.dispenses_ip` (Tarea 4).

- [ ] **Paso 1: La casilla en el formulario**

En `ScheduleDefinitionForm.tsx`, junto al estado de `dispenses` (línea ~78):

```tsx
  const [dispensesIp, setDispensesIp] = useState(initial?.dispenses_ip ?? false)
```

En el objeto que se manda a guardar (línea ~107), sumar `dispenses_ip: dispensesIp,`.

Y en el formulario, **inmediatamente debajo** de la casilla de `dispenses` (línea ~157), replicando
su marcado exacto:

```tsx
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
          <input type="checkbox" checked={dispensesIp} onChange={(e) => setDispensesIp(e.target.checked)} />
          Entrega producto en investigación (IP)
        </label>
```

- [ ] **Paso 2: El resumen de la fila**

En `ScheduleEditor.tsx` línea ~235, donde hoy dice `{d.dispenses ? ' · disp.' : ''}`, sumar:

```tsx
{d.dispenses_ip ? ' · IP' : ''}
```

- [ ] **Paso 3: Verificar logueado**

1. `npm run typecheck` → sin errores.
2. En el preview: Coordinación → un protocolo → Cronograma → editar una definición de visita.
3. La casilla **"Entrega producto en investigación (IP)"** aparece debajo de la de dispensación.
4. Tildarla, guardar, **recargar la página**: sigue tildada. (Si no persiste, falta `dispenses_ip`
   en el input de la mutación.)
5. En la lista del cronograma, esa fila muestra `· IP`.

- [ ] **Paso 4: Commit**

```bash
git add src/views/track/ScheduleDefinitionForm.tsx src/views/track/ScheduleEditor.tsx
git commit -m "feat(track): el cronograma define si la visita entrega IP"
```

---

### Task 7: `ConstanciaIp.tsx` — dropzone y previsualizador

Un solo componente, usado por Track (chico) y por Pharma (grande). Es donde vive todo el trato con
el archivo, así que el resto de las vistas no sabe que existe Storage.

**Archivos:**
- Crear: `src/views/pharma/ConstanciaIp.tsx`

**Interfaces:**
- Consume: `uploadIpDocument`, `ipDocumentUrl`, `printIpDocument`, `formatBytes`, `IpDocumentRow`.
- Produce: `<ConstanciaDropzone onFile accent busy />` y
  `<ConstanciaVista doc size="chica" | "grande" accent onReemplazar? />`.

- [ ] **Paso 1: El dropzone**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { formatBytes } from '../../data/pharma'
import type { IpDocumentRow } from '../../data/pharma'
import { ipDocumentUrl } from '../../data/pharma'

/**
 * Zona de carga de la constancia. Sugiere el PDF sin prohibir la imagen: el PDF impreso del IRT
 * gana por mérito propio —pesa 10× menos, se imprime nítido y se puede buscar—, no por regla.
 */
export function ConstanciaDropzone({ accent, busy, onFile }: {
  accent: string
  busy: boolean
  onFile: (f: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      onClick={() => !busy && input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f && !busy) onFile(f)
      }}
      className="spira-card-link"
      style={{
        border: '1px dashed var(--spira-line-2)', borderRadius: 12, background: 'var(--spira-white)',
        padding: '17px 14px', textAlign: 'center', cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.6 : 1, transform: over ? 'translateY(-1px)' : undefined,
        boxShadow: over ? 'var(--spira-shadow-sm)' : undefined,
      }}
    >
      <input
        ref={input} type="file" hidden
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
      />
      <Icon name="upload" size={20} color={accent} stroke={1.7} />
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 7 }}>
        {busy ? 'Subiendo…' : <>Arrastrá la constancia o <span style={{ color: accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>elegí un archivo</span></>}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 3 }}>
        Preferentemente el PDF · hasta 10&nbsp;MB
      </div>
    </div>
  )
}
```

Si `upload` no existe en `components/Icon.tsx`, agregarlo ahí con el path de Lucide
`M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 / 17 8 12 3 7 8 / M12 3v12`, siguiendo el formato de
los íconos vecinos.

- [ ] **Paso 2: El previsualizador**

```tsx
/**
 * Vista de la constancia. Reemplaza al botón "Ver": la constancia tiene cuatro datos y entran en
 * 140px — si hay que hacer clic para ver algo que cabe, el clic sobra.
 *
 * Sin librerías: `<iframe>` para PDF y `<img>` para imagen, contra la URL firmada. La alternativa
 * (pdf.js dibujando la miniatura en un canvas) son ~350 KB comprimidos por una imagen que el
 * navegador ya sabe dibujar solo.
 */
export function ConstanciaVista({ doc, size, accent, onReemplazar }: {
  doc: IpDocumentRow
  size: 'chica' | 'grande'
  accent: string
  onReemplazar?: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    ipDocumentUrl(doc.storage_path).then((u) => { if (vivo) setUrl(u) })
    return () => { vivo = false }
  }, [doc.storage_path])

  const alto = size === 'grande' ? 348 : 140
  const esPdf = doc.mime_type === 'application/pdf'

  return (
    <div>
      <div style={{ position: 'relative', height: alto, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--spira-line)', background: 'var(--spira-white)' }}>
        {url === null ? (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 12.5, color: 'var(--spira-muted)' }}>Cargando la constancia…</div>
        ) : esPdf ? (
          <iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={doc.file_name} style={{ width: '100%', height: '100%', border: 0 }} />
        ) : (
          <img src={url} alt={doc.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 9, padding: '10px 12px', border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-white)' }}>
        <span style={{ flex: '0 0 auto', width: 32, height: 32, borderRadius: 9, background: `${accent}1F`, display: 'grid', placeItems: 'center' }}>
          <Icon name="fileText" size={16} color={accent} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.file_name}</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 1 }}>{formatBytes(doc.size_bytes)}</span>
        </span>
        {onReemplazar && (
          <button type="button" onClick={onReemplazar} style={miniBtn}>Reemplazar</button>
        )}
      </div>
    </div>
  )
}

const miniBtn: CSSProperties = {
  height: 30, padding: '0 11px', borderRadius: 9, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 12.5, color: 'var(--spira-ink)', flex: '0 0 auto',
}
```

Si `fileText` no existe en `Icon.tsx`, agregarlo.

- [ ] **Paso 3: Verificar**

Run: `npm run typecheck` → sin errores. (Todavía no se monta en ninguna vista; se prueba en la
Tarea 8.)

- [ ] **Paso 4: Commit**

```bash
git add src/views/pharma/ConstanciaIp.tsx src/components/Icon.tsx
git commit -m "feat(pharma): dropzone y previsualizador de la constancia de IP"
```

---

### Task 8: Track — la tarjeta partida

**Archivos:**
- Modificar: `src/views/pharma/VisitDispensationPanel.tsx`, `src/views/track/VisitDetail.tsx`

**Interfaces:**
- Consume: `ConstanciaDropzone`, `ConstanciaVista`, `constanciaVigente`, `uploadIpDocument`,
  `Panel` con `highlight`, `visit.dispenses_ip`.

- [ ] **Paso 1: El panel monta su propio `Panel`**

Como ya hace `VisitProcedures`: el realce depende de si hay algo que dispensar, y eso solo lo sabe
este componente. En `VisitDetail.tsx`, reemplazar

```tsx
                <Panel title="Dispensación" icon="pill" accent={accent}>
                  <VisitDispensationPanel visit={visit} accent={accent} readOnly={readOnly} />
                </Panel>
```

por

```tsx
                {/* Monta su propio `Panel`: el realce se apaga cuando no hay nada que dispensar. */}
                <VisitDispensationPanel visit={visit} accent={accent} readOnly={readOnly} />
```

Y en `VisitDispensationPanel`, envolver todo en:

```tsx
    <Panel
      title="Dispensación" icon="pill" accent={accent}
      highlight={visit.dispenses || visit.dispenses_ip}
      deepAccent="var(--spira-acc-deep-track)"
    >
```

Ampliar el tipo de la prop `visit` con `dispenses_ip: boolean` y `enrollment_id` (ya está).

- [ ] **Paso 2: Las dos subsecciones**

Extraer el marcado de secciones a helpers locales, con el rótulo en `ink-soft` (no en el `faint`
del `.spira-eyebrow`: sobre `surface` da 2,1:1 y esta es la división primaria de la tarjeta):

```tsx
const subLabel: CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.13em', textTransform: 'uppercase',
  color: 'var(--spira-ink-soft)',
}

/** Una subsección de la tarjeta. El filete separa; no hay cajas anidadas. */
function Sub({ label, first, children }: { label: string; first?: boolean; children: ReactNode }) {
  return (
    <div style={first ? undefined : { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--spira-line)' }}>
      <div style={{ ...subLabel, marginBottom: 9 }}>{label}</div>
      {children}
    </div>
  )
}
```

El cuerpo del panel queda:

- Si `!visit.dispenses && !visit.dispenses_ip` → el mensaje sereno de siempre + (Tarea 9) la salida.
- Si `visit.dispenses` → `<Sub label="Medicación concomitante" first>` con **lo que ya existe hoy**,
  sin cambios de comportamiento. El botón punteado pasa a decir **"Agregar medicación"**: ya no
  solicita por su cuenta, suma renglones al pedido.
- Si `visit.dispenses_ip` → `<Sub label="Producto en investigación">` con el dropzone o la vista.
- El **pie común** (fecha del pedido + estado + "Cancelar solicitud", una sola vez) va abajo de
  todo: es lo que hace visible que arriba hay **un** pedido y no dos.

- [ ] **Paso 3: La carga de la constancia**

```tsx
  const [subiendo, setSubiendo] = useState(false)

  /**
   * El primero que actúa crea el pedido; el segundo se suma al mismo. Si no hay pedido abierto,
   * cargar la constancia lo crea (sin renglones, que es el caso típico del IP solo).
   */
  async function cargarConstancia(f: File) {
    setSubiendo(true); setErr(null)
    let requestId = openReqs[0]?.id ?? null
    if (!requestId) {
      const res = await createDispensationRequest(visit.id, [], null, 'track')
      if (res.error) { setErr(res.error); setSubiendo(false); return }
      requestId = res.id!
    }
    const up = await uploadIpDocument(requestId, visit.protocol_id, f)
    setSubiendo(false)
    if (up.error) { setErr(up.error); return }
    reqQ.refetch()
  }
```

`visit.protocol_id` tiene que estar en el tipo de la prop `visit`; `DayVisitRow` ya lo trae.

- [ ] **Paso 4: Verificar logueado — el recorrido mínimo**

1. `npm run typecheck` → sin errores.
2. Crear una definición de visita `TEST-IP` con **solo** `dispenses_ip` (Tarea 6) y generar una
   visita para un paciente de prueba.
3. Abrir el modal: la tarjeta **está teñida**, muestra **solo** la sección de IP y **no** dice
   "esta visita no entrega medicación".
4. Soltar un PDF en el dropzone → aparece el previsualizador con el nombre y el peso, y el pie dice
   "Solicitada".
5. **Recargar la página** → la constancia sigue ahí. (Lo que no se persiste, miente.)
6. Medir el contraste del título en la consola:

```js
(() => { const t=[...document.querySelectorAll('[role=dialog] *')].find(e=>e.textContent.trim()==='Dispensación'&&e.children.length===0); return getComputedStyle(t).color })()
```

Esperado: el valor de `--spira-acc-deep-track` (`rgb(15, 95, 87)` en claro). Si sale
`rgb(46, 125, 116)`, falta pasarle `deepAccent` al `Panel`.

7. Cambiar a tema oscuro y repetir: tiene que dar `rgb(157, 230, 214)`. **Si sigue en el petróleo
oscuro, el título es invisible** — es el agujero que ya apareció dos veces en el diseño.

- [ ] **Paso 5: Commit**

```bash
git add src/views/pharma/VisitDispensationPanel.tsx src/views/track/VisitDetail.tsx
git commit -m "feat(track): la tarjeta de Dispensación se parte en concomitante e IP"
```

---

### Task 9: Track — fuera de cronograma y el aviso de 30 días

**Archivos:**
- Modificar: `src/views/pharma/VisitDispensationPanel.tsx`

**Interfaces:**
- Consume: `useUltimaDispensacion`, `createDispensationRequest(..., offScheduleReason)`,
  `SearchableSelect`.

- [ ] **Paso 1: Los motivos**

```tsx
/**
 * Motivos de una dispensación fuera de cronograma. Desplegable y no texto libre: el Director
 * prefiere valores preestablecidos para no depender de cómo lo escriba cada operador.
 * PENDIENTE: lista propuesta, a confirmar por el Director (2026-08-09).
 */
const MOTIVOS_FUERA_CRONOGRAMA = [
  { value: 'reposicion', label: 'Reposición por pérdida o rotura' },
  { value: 'vnp', label: 'Visita no programada (VNP)' },
  { value: 'ajuste_dosis', label: 'Ajuste de dosis indicado por el investigador' },
  { value: 'viaje', label: 'Adelanto por viaje del paciente' },
  { value: 'otro', label: 'Otro' },
]
```

- [ ] **Paso 2: La salida**

Debajo del mensaje sereno, **con la misma forma que "Agregar medicación"** —la tarjeta ya tiene un
idioma para "acá se suma algo"— pero un escalón más callada: ícono sin acento y tinta atenuada.

```tsx
        <button
          type="button" onClick={() => setFueraCronograma(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', height: 40, borderRadius: 12, border: '1px dashed var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13, color: 'var(--spira-ink-soft)' }}
        >
          <Icon name="plus" size={15} color="var(--spira-muted)" /> Dispensar fuera de cronograma
        </button>
```

- [ ] **Paso 3: La subsección de excepción**

Con `fueraCronograma` en true, la tarjeta se enciende (`highlight`) y muestra **tres**
subsecciones. La primera, en ámbar, **con el mismo ritmo que las otras**: rótulo, contenido, filete.
No es un formulario encima de la tarjeta.

```tsx
const subLabelExc: CSSProperties = {
  ...subLabel, color: 'var(--spira-acc-deep-pharma)', display: 'inline-flex',
  alignItems: 'center', gap: 6,
}
```

Contiene el aviso (Paso 4) y el `SearchableSelect` de motivos. Al crear el pedido, pasar
`MOTIVOS_FUERA_CRONOGRAMA.find(m => m.value === motivo)!.label` como quinto argumento de
`createDispensationRequest` — **el label, no el value**: es lo que va a leer un monitor en el
comprobante impreso.

- [ ] **Paso 4: El aviso, con sus dos tonos**

```tsx
/**
 * Aviso de dispensación reciente. Cambia de TONO, no de existencia: dentro de cronograma la
 * entrega estaba prevista y el dato se ofrece; fuera de cronograma una entrega repetida sí puede
 * ser un error y va en ámbar.
 *
 * El porqué de la distinción: en un protocolo con visitas cada 28 días una alarma ámbar saltaría
 * TODAS las veces, y una alarma que siempre suena deja de escucharse justo cuando importa.
 * Nunca bloquea.
 */
function AvisoReciente({ ultima, alerta, accent }: {
  ultima: UltimaDispensacionRow
  alerta: boolean
  accent: string
}) {
  const dias = Math.floor((Date.now() - new Date(ultima.entregada_el).getTime()) / 86_400_000)
  const detalle = [
    formatAR(ultima.entregada_el.slice(0, 10)),
    ultima.ip_kits ? `${ultima.ip_kits} kit${ultima.ip_kits > 1 ? 's' : ''} de IP` : null,
    ultima.items ? `${ultima.items} renglón${ultima.items > 1 ? 'es' : ''} de medicación` : null,
    ultima.visita ? `en la visita ${ultima.visita}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 11,
      marginBottom: 12, fontSize: 12.5,
      // Sobre PAPEL BLANCO como todo lo que vive adentro de la card: un recuadro teñido adentro
      // de una card teñida se ve sucio. La alerta es la única que se tiñe, porque ahí el color
      // es significado.
      background: alerta ? 'rgba(176, 130, 63, 0.15)' : 'var(--spira-white)',
      border: alerta ? '1px solid transparent' : '1px solid var(--spira-line)',
    }}>
      <Icon name={alerta ? 'alert' : 'info'} size={15} color={alerta ? 'var(--spira-warn)' : accent} style={{ flex: '0 0 auto', marginTop: 1 }} />
      <span>
        <span style={{ display: 'block', fontWeight: 600 }}>
          {alerta ? `Ya se dispensó hace ${dias} días` : `Última dispensación hace ${dias} días`}
        </span>
        <span style={{ display: 'block', color: 'var(--spira-ink-soft)', marginTop: 2 }}>
          {detalle}{alerta ? '. Revisá que no sea una entrega repetida.' : '.'}
        </span>
      </span>
    </div>
  )
}
```

Va **arriba de todo**, antes de las subsecciones: si llega después de que el coordinador ya cargó la
medicación, llega tarde.

- [ ] **Paso 5: Verificar logueado**

1. `npm run typecheck` → sin errores.
2. Visita con los **dos** flags apagados → aparece la salida punteada, la tarjeta **no** está teñida.
3. Abrirla → la tarjeta se tiñe, aparecen las tres subsecciones y el motivo es obligatorio (sin
   motivo no se puede crear).
4. Con una entrega de menos de 30 días en el mismo enrolamiento: en una visita **de cronograma** el
   aviso sale con fondo **blanco**; en la salida **fuera de cronograma**, con fondo **ámbar**.
5. Con la última entrega a más de 30 días, no sale nada.
6. **Probar el candado de la base**: en la consola del preview,
   `await supabase.rpc('create_dispensation_request', {p_visit_id:'<id de una visita sin flags>', p_items:[], p_notes:null, p_origen:'track'})`
   → tiene que devolver error. Si crea el pedido, la validación del Paso 7 de la Tarea 2 está mal.

- [ ] **Paso 6: Commit**

```bash
git add src/views/pharma/VisitDispensationPanel.tsx
git commit -m "feat(track): dispensación fuera de cronograma con motivo y aviso de 30 días"
```

---

### Task 10: Pharma — la constancia en el cajón

**Archivos:**
- Modificar: `src/views/pharma/dispensaciones/PanelPreparando.tsx`,
  `src/views/pharma/dispensaciones/PanelLista.tsx`,
  `src/views/pharma/dispensaciones/KanbanCard.tsx`,
  `src/views/pharma/dispensaciones/estados.ts`

- [ ] **Paso 1: El bloque, arriba de los renglones**

En `PanelPreparando`, antes del `ScanField`: acá el archivo no es un adjunto, es **lo primero que
hay que hacer**. `<ConstanciaVista size="grande">` + tres botones en columna a la derecha:
`Imprimir` (sólido, `printIpDocument`), `Abrir en pestaña` (`ipDocumentUrl` + `window.open`) y
`Descargar`.

**`Abrir en pestaña` va siempre visible, no escondido tras un fallo**: el `print()` por blob depende
del navegador, y la salida tiene que estar antes de que falle, no después.

- [ ] **Paso 2: El botón bloqueado explica por qué**

En `estados.ts`, extender `readyBlockedReason` (línea 108) para que contemple la constancia:

```ts
export function readyBlockedReason(r: DispensationRequestRow): string | null {
  if (r.includes_ip && !r.ip_documents?.some((d) => d.superseded_at === null)) {
    return 'Falta la constancia del producto en investigación'
  }
  const pendientes = r.items.filter((i) => i.scanned_at === null)
  if (pendientes.length === 0) return null
  if (pendientes.length === 1) {
    const nombre = pendientes[0].medication?.name ?? 'el medicamento pendiente'
    return `Falta escanear ${nombre}`
  }
  return `Faltan ${pendientes.length} ítems por escanear`
}
```

- [ ] **Paso 3: El pedido sin renglones**

Con cero ítems (IP solo), `PanelPreparando` **no** muestra el campo de escaneo ni la lista: muestra
la constancia y nada más. Condicionar el bloque de escaneo a `r.items.length > 0`.

- [ ] **Paso 4: La marca de fuera de cronograma viaja**

En `KanbanCard` y en el encabezado del cajón, cuando `r.off_schedule`: chip ámbar
**"Fuera de cronograma"** y, en el cajón, el motivo (`r.off_schedule_reason`). Una excepción que
solo conoce quien la hizo no es una excepción auditada — y le cambia el trabajo a la farmacéutica.

En la card, cuando `r.includes_ip`, sumar el distintivo `IP` junto a las unidades.

- [ ] **Paso 5: Verificar logueado**

1. `npm run typecheck` → sin errores.
2. Con el pedido de la Tarea 8 (IP solo): en Farmacia → Dispensaciones, la card muestra `IP`.
3. Abrir el cajón: la constancia se ve grande y **no** hay campo de escaneo.
4. `Imprimir` → **abre el diálogo del sistema con el PDF**, sin pestaña nueva. Si abre una pestaña o
   no pasa nada, usar `Abrir en pestaña` y anotarlo: el `print()` por blob depende del navegador.
5. Borrar la constancia de la vigencia no es posible; en cambio, con un pedido `includes_ip` sin
   constancia, `Marcar lista` está deshabilitado y **dice** "Falta la constancia del producto en
   investigación".

- [ ] **Paso 6: Commit**

```bash
git add src/views/pharma/dispensaciones/PanelPreparando.tsx src/views/pharma/dispensaciones/PanelLista.tsx src/views/pharma/dispensaciones/KanbanCard.tsx src/views/pharma/dispensaciones/estados.ts
git commit -m "feat(pharma): la constancia de IP se ve y se imprime desde el cajón"
```

---

### Task 11: Pharma — los kits y el pop-up al entregar

**Archivos:**
- Modificar: `src/views/pharma/dispensaciones/PanelLista.tsx`
- Crear: `src/views/pharma/dispensaciones/ModalKitsIp.tsx`

- [ ] **Paso 1: El campo, en 0 y visiblemente pendiente**

En `PanelLista`, cuando `r.includes_ip`, un campo **Kits de IP entregados** con `value` inicial `0`.
El 0 se pinta **como pendiente** —borde punteado, tinta atenuada y una píldora "Sin declarar"— y no
como un número válido más: un `1` por defecto se confirma en piloto automático.

- [ ] **Paso 2: El pop-up**

```tsx
import { useState } from 'react'
import { Modal } from '../../../components/Modal'
import { btnOutline, btnPrimary } from '../../../components/buttons'

/**
 * Pide los kits cuando la farmacéutica va a entregar y el campo sigue en 0.
 *
 * EXPLICA POR QUÉ interrumpe: una ventana que aparece pidiendo un número y nada más se cierra sin
 * leer. Y no acepta 0 — si de verdad no salió ningún kit, lo que corresponde no es entregar cero,
 * es cancelar la preparación.
 */
export function ModalKitsIp({ busy, onClose, onConfirm }: {
  busy: boolean
  onClose: () => void
  onConfirm: (kits: number) => void
}) {
  const [kits, setKits] = useState('')
  const n = parseInt(kits, 10)
  const valido = Number.isFinite(n) && n >= 1
  return (
    <Modal title="¿Cuántos kits de IP entregaste?" onClose={onClose} icon="flask" accent="var(--spira-pharma-solid)">
      <p style={{ fontSize: 13, color: 'var(--spira-ink-soft)', margin: '0 0 15px', lineHeight: 1.55 }}>
        Quedó en 0 y esta entrega lleva producto en investigación. El número descuenta del stock del
        protocolo y <b>no se puede corregir después</b>: entregada es definitiva.
      </p>
      <input
        type="number" min={1} value={kits} autoFocus
        onChange={(e) => setKits(e.target.value)}
        style={{ width: '100%', height: 52, borderRadius: 12, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', padding: '0 15px', fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 22, color: 'var(--spira-ink)' }}
      />
      <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
        <button type="button" onClick={onClose} style={{ ...btnOutline, height: 40 }}>Volver</button>
        <button
          type="button" disabled={!valido || busy}
          onClick={() => onConfirm(n)}
          style={{ ...btnPrimary, height: 40, flex: 1, opacity: !valido || busy ? 0.6 : 1 }}
        >
          {busy ? 'Entregando…' : 'Entregar'}
        </button>
      </div>
      {/* Ningún botón deshabilitado mudo. */}
      {!valido && (
        <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', textAlign: 'center', marginTop: 8 }}>
          Tiene que ser 1 o más
        </div>
      )}
    </Modal>
  )
}
```

Verificar que `flask` exista en `Icon.tsx`; si no, agregarlo o usar `pill`.

- [ ] **Paso 3: Enganchar la entrega**

En `PanelLista`, `doDeliver` pasa a:

```tsx
  const doDeliver = async (kits?: number) => {
    const ipKits = r.includes_ip ? (kits ?? (parseInt(kitsCampo, 10) || 0)) : null
    if (r.includes_ip && (!ipKits || ipKits < 1)) { setPidiendoKits(true); return }
    setBusy(true); setErr(null)
    const res = await deliverDispensation(disp.id, ipKits)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    setPidiendoKits(false)
    onChanged()
    onToast(`${disp.dispensation_code ?? 'Dispensación'} entregada`)
  }
```

- [ ] **Paso 4: Verificar logueado**

1. `npm run typecheck` → sin errores.
2. Marcar lista el pedido de prueba → el comprobante se emite y `v_ip_stock` **todavía no se mueve**
   (verificar en Farmacia → el stock de IP del protocolo).
3. `Cancelar preparación` desde *Lista* → el stock de IP **ni se toca**, porque nunca salió.
4. Rehacer y apretar `Entregar` **con los kits en 0** → salta el pop-up y no deja pasar con 0.
5. Poner **2** y confirmar → entrega sellada y `kits_disponibles` baja 2.
6. Declarar 2 en el campo **antes** de entregar → `Entregar` **no** abre el pop-up.

- [ ] **Paso 5: Commit**

```bash
git add src/views/pharma/dispensaciones/PanelLista.tsx src/views/pharma/dispensaciones/ModalKitsIp.tsx
git commit -m "feat(pharma): los kits de IP se declaran al entregar, con pop-up si quedaron en 0"
```

---

### Task 12: El comprobante impreso

**Archivos:**
- Modificar: `src/views/pharma/dispensaciones/ComprobanteImprimible.tsx`

- [ ] **Paso 1: Las dos líneas nuevas**

Cuando `disp.ip_kits != null`, después del bloque de medicación entregada:

```
PRODUCTO EN INVESTIGACIÓN
────────────────────────────────────────────
2 kits · constancia adjunta (irt-asignacion.pdf)
```

Y cuando `r.off_schedule`, arriba del pie de firmas:

```
DISPENSACIÓN FUERA DE CRONOGRAMA
Motivo: Reposición por pérdida o rotura
```

Es justo el dato que un monitor va a buscar. Negro sobre blanco, sin fondos ni acentos: la hoja se
imprime en una láser monocroma.

- [ ] **Paso 2: Verificar**

1. `npm run typecheck` → sin errores.
2. Imprimir a PDF desde el navegador: entra en una hoja, no salen el riel ni el cajón, y las dos
   líneas aparecen con los valores de la pantalla.

- [ ] **Paso 3: Commit**

```bash
git add src/views/pharma/dispensaciones/ComprobanteImprimible.tsx
git commit -m "feat(pharma): el comprobante declara el IP y la excepción de cronograma"
```

---

### Task 13: QA logueado de punta a punta

**Archivos:** ninguno (salvo los arreglos que salgan).

- [ ] **Paso 1: El recorrido completo**

Es el §9 de la especificación. Con datos `TEST-*` creados por la sesión:

1. Visita con `dispenses_ip` y **sin** `dispenses` → solo la sección de IP, con realce, sin el
   cartel de "no entrega medicación".
2. Adjuntar un PDF → nace el pedido con **cero renglones** e `includes_ip` en true **sin que el
   cliente lo haya declarado**.
3. Recargar → la constancia y su previsualizador siguen ahí.
4. Apagar `dispenses_ip` en el cronograma **después** de creado el pedido → el pedido **sigue**
   diciendo que lleva IP. Prueba de que se congeló y no se recalcula.
5. Subir un archivo de 12 MB y un `.docx` → los rechaza **el bucket**, no el navegador.
6. Reemplazar la constancia → la anterior queda `superseded_at`, la vigente es una sola.
7. Farmacia: ver, imprimir en un clic, `Marcar lista` → comprobante emitido, stock de IP quieto.
8. `Cancelar preparación` → el stock de IP ni se toca.
9. `Entregar` con 0 → pop-up; con 2 → `kits_disponibles` baja 2.
10. Visita con concomitante **y** IP → **un** cajón, **un** comprobante con las dos cosas.
11. Fuera de cronograma: chip y motivo en tablero, cajón y comprobante; sin motivo, la base rechaza.
12. Aviso de 30 días: informativo dentro de cronograma, ámbar fuera, nada si pasaron más de 30 días.

- [ ] **Paso 2: La prueba que de verdad importa — dos usuarios**

Esto **estrena Storage** en el proyecto y ninguna política de `storage.objects` se escribió nunca
acá. Con el usuario de QA solo no se prueba nada: tiene los cinco módulos.

- Como **coordinador de OTRO protocolo**: pedir la URL firmada de la constancia →
  **tiene que fallar**.
- Como **farmacéutica**: la misma URL → tiene que funcionar.

Si el primero funciona, la política de lectura está mal y **no se mergea**.

- [ ] **Paso 3: Limpieza**

Borrar **exactamente** los registros `TEST-*` creados por la sesión. Nunca en lote por categoría:
ya se perdió data real una vez así.

- [ ] **Paso 4: Build y PR**

```bash
npm run build
```

Esperado: typecheck + build sin errores.

Después, PR contra `main` vía API REST de GitHub (no hay `gh` en esta máquina; ver CLAUDE.md). **El
Director mergea** — el clasificador bloquea el self-merge.

---

## Autorrevisión del plan

**Cobertura de la especificación:** §1.1 → T2P2 · §1.2 → T2P3 · §1.2b → T2P3 · §1.3 → T2P4 ·
§1.4 → T1 + T2P5 · §1.5 → T2P6-9 · §1.6 → T2P7 · §1.7 → T2P9 · §2 → T3 y T4 · §3 → T8 ·
§3.1 → T9 · §4 → T10 y T11 · §5 → T12 · §7 (costos) → sin tarea, es análisis · §9 → T13.

**Puntos que quedan explícitamente abiertos, y no son placeholders:**
- La lista de motivos (T9P1) está implementada con la propuesta y marcada `PENDIENTE` en el código.
- El cuerpo de tres funciones existentes (`create_dispensation_request`, `mark_dispensation_ready`,
  `deliver_dispensation`) se cita por archivo y líneas en vez de transcribirse: transcribir 80
  líneas que no leí sería peor que preciso, sería falso.

**Consistencia de nombres verificada:** `constanciaVigente`, `uploadIpDocument`, `ipDocumentUrl`,
`printIpDocument`, `formatBytes`, `ConstanciaDropzone`, `ConstanciaVista`, `ModalKitsIp`,
`readyBlockedReason`, `DIAS_AVISO_DISPENSACION`, `--spira-acc-deep-track/-pharma`,
`dispenses_ip`, `includes_ip`, `ip_kits`, `off_schedule`, `off_schedule_reason` — usados con el
mismo nombre en todas las tareas.
