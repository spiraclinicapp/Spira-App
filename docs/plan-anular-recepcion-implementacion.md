# Anular una recepción — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usá `superpowers:subagent-driven-development` (recomendada)
> o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan
> checkbox (`- [ ]`) para poder tildarlos.

**Goal:** que una recepción cargada mal se pueda anular desde la app —revirtiendo el stock si ya
se había verificado— dejando registro de quién, cuándo y por qué, en vez de quedar para siempre.

**Arquitectura:** un estado nuevo (`anulada`) y una RPC `void_reception` que decide qué hacer según
lo que la recepción ya hizo: la pendiente sólo se sella; la verificada de medicación base valida que
su ingreso siga intacto, resta los lotes y escribe un movimiento compensatorio en el libro; la de
Producto de Investigación sólo cambia de estado, porque su stock lo *deriva* una vista. En el front,
un modal espejo del de verificación y una banda gris en la card.

**Tech Stack:** Postgres/Supabase (migraciones SQL numeradas, RPC `plpgsql` `security definer`),
React 18 + TypeScript strict, Vite, vitest. Sin Tailwind ni CSS-in-JS: estilos inline + variables de
`src/styles/tokens.css`.

**Spec:** [`docs/plan-anular-recepcion.md`](plan-anular-recepcion.md) — leerlo antes de empezar.
Las decisiones **D1–D5** de ahí no se re-discuten.

**Rama:** `feat/anular-recepcion` (ya creada, con el spec commiteado).

---

## Global Constraints

- **Castellano rioplatense** en comentarios, nombres de dominio y copy de UI. Los comentarios de
  este repo explican **el porqué, no el qué**, y son densos: igualá ese tono.
- **En la UI los módulos se llaman Coordinación y Farmacia**; en el código y la base siguen siendo
  `track` y `pharma`. Nunca renombrar las claves.
- **El realce de estado es ELEVACIÓN, nunca un borde de color.** El color se reserva para
  *significado* (estado clínico, alerta, error), no para decir "el mouse está acá".
- **Nunca mezclar la abreviada `border` con longhands** (`borderColor`) en el mismo estilo inline:
  React vacía las longhand al apagarse el estado y el borde queda negro.
- **Migraciones inmutables y numeradas.** No editar ni renumerar una ya aplicada. Las de este plan
  son la `0086` y la `0087` (la última aplicada en prod es la `0085`).
- **Nunca dos signos peso pegados dentro de un comentario SQL**: el editor de Supabase rastrea el
  dollar-quoting sin ignorar los comentarios y uno suelto le invierte la paridad. La cantidad de
  marcadores en el texto crudo tiene que ser **par**.
- **En plpgsql, calificar SIEMPRE las columnas** (`r.quantity`, `l.quantity_on_hand`): en un
  `returns table` o con variables declaradas, un nombre suelto puede resolverse contra la variable.
- **El gate de calidad es `npm run build`** (typecheck + vitest + build) **verde + verificar en el
  navegador**. No afirmar "anda" sin las dos cosas.
- **No hay acceso SQL directo a producción.** El SQL se le entrega al Director para que lo corra
  **tal cual**, sin placeholders.
- **Stagear siempre por ruta** (`git add <archivos>`), nunca `git add -A`: el working copy es
  compartido con el Director.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0086_reception_anulada_enum.sql` | **Crear.** Sólo los dos `add value` de enum. |
| `supabase/migrations/0087_anular_recepcion.sql` | **Crear.** Columnas de anulación, constraint y RPC `void_reception`. |
| `supabase/README.md` | **Modificar.** Índice de migraciones: dos filas nuevas. |
| `src/data/pharma/receptions.ts` | **Modificar.** Tipo `ReceptionStatus`, tres columnas en la fila y en `RECEPTION_COLS`, y la mutación `voidReception`. |
| `src/views/pharma/recepcion/derivados.ts` | **Modificar.** Reglas puras: `contenidoDe`, la tercera voz de `resumenContenido`, `totalesDelDia` con anuladas y `armarMotivo`. |
| `src/views/pharma/recepcion/derivados.test.ts` | **Modificar.** Los tests de lo anterior. |
| `src/views/pharma/recepcion/AnularRecepcion.tsx` | **Crear.** El modal de anulación (espejo de `ConfirmarVerificacion`). |
| `src/views/pharma/recepcion/ConfirmarVerificacion.tsx` | **Modificar.** Usa `contenidoDe` en vez del `.replace(/^trae /, '')`. |
| `src/views/pharma/recepcion/ReceptionCard.tsx` | **Modificar.** Banda anulada, botón Anular, helper `anuladaPor`. |
| `src/views/pharma/RecepcionView.tsx` | **Modificar.** Filtro de estado, wiring del modal, toast. |
| `TODOS.md` | **Modificar.** Borrar la entrada que este trabajo cierra; actualizar la que dependía de ella. |

---

## Ajustes al spec resueltos al escribir este plan

Cuatro cosas que el spec dejaba a medio resolver y que acá quedan cerradas. **El spec ya fue
actualizado con estas cuatro**; se listan para que quien lea sólo el plan sepa el porqué.

1. **`totalesDelDia` cuenta TODAS las recepciones del día, y descuenta sólo las unidades.** La
   primera versión del spec decía "no la cuenta ni en recepciones ni en unidades". Está mal: el
   usuario vería tres cards bajo un rótulo que dice "2 recepciones" y eso se lee como un bug. Cuenta
   los documentos (que es lo que hay a la vista), no suma las unidades de la anulada, y **nombra el
   descuento**: *"3 recepciones · 15 unidades · 1 anulada"*.
2. **El resumen de una anulada va en PASADO, no con un sufijo.** *"traía 2 medicamentos · 15
   unidades"*, no *"… — anulada"*: la banda ya lleva el rótulo `ANULADA` al lado, y repetirlo sería
   decir dos veces lo mismo en la misma línea. El verbo es lo que cambia — es el mismo mecanismo que
   ya distingue "trae" (pendiente) de "ingresadas" (verificada).
3. **El filtro de estado son dos chips toggle excluyentes** (`Pendientes` · `Anuladas`), ninguno
   tildado = todas. Un radiogroup de tres pondría un segundo chip "Todas" pegado al "Todas" del eje
   de ámbito, que ya existe. Dos toggles excluyentes dan los mismos tres estados y reusan el patrón
   que la toolbar ya tiene en el rango 7/30 días.
4. **Se extrae `contenidoDe(r)`** (el cuerpo del resumen, sin verbo). Hoy `ConfirmarVerificacion`
   le saca el verbo al resumen con `.replace(/^trae /, '')`, y el modal de anulación necesitaría el
   mismo cuerpo. Un `replace` sobre una frase generada es un acoplamiento invisible: el día que el
   verbo cambie, el modal deja de sacarlo y nadie se entera hasta verlo en pantalla.

---

### Task 1: La base sabe anular

> **Corregida durante la ejecución (review de la Task 1).** El SQL de abajo tiene dos errores que
> el review encontró y que la migración real ya NO tiene: (1) las dos consultas que ubican el lote
> buscaban por `(medication_id, lot_number)` citando el unique de la 0002 — la 0032 lo dropeó al
> volverse global el catálogo, y la clave real es `(medication_id, protocol_id, lot_number)`, que se
> compara con `is not distinct from` para que ambulatoria (protocolo `NULL`) siga matcheando;
> (2) faltaba el guard `trg_guard_reception_void`, sin el cual la RPC se salteaba con un PATCH
> directo a PostgREST. Ver `supabase/migrations/0087_anular_recepcion.sql` como fuente de verdad.

Las dos migraciones y su registro en el índice. Van juntas: la `0086` sola no hace nada y la `0087`
no aplica sin ella.

**Files:**
- Create: `supabase/migrations/0086_reception_anulada_enum.sql`
- Create: `supabase/migrations/0087_anular_recepcion.sql`
- Modify: `supabase/README.md` (tabla del índice, después de la fila de la `0085`)

**Interfaces:**
- Consumes: nada.
- Produces: `public.void_reception(p_reception_id uuid, p_reason text) returns void`; el valor
  `'anulada'` de `reception_status`; el valor `'anulacion_recepcion'` de `stock_movement_type`; las
  columnas `voided_at timestamptz`, `voided_by uuid`, `voided_by_name text`, `void_reason text` en
  `medication_receptions`.

- [ ] **Paso 1: Escribir `0086_reception_anulada_enum.sql`**

```sql
-- ============================================================================
-- 0086 — Recepción: el estado 'anulada' y su movimiento de stock
--
-- SOLO los dos valores de enum, en un archivo aparte y aplicado ANTES de la 0087. En Postgres un
-- valor recién agregado con ALTER TYPE ... ADD VALUE no se puede usar en la MISMA transacción que
-- lo creó, y la 0087 lo usa en un CHECK y en un INSERT. Es la trampa de la 0053; separarlos es la
-- única forma de que las dos corran de un saque en el editor.
--
--   1. reception_status.anulada          — una recepción cargada mal deja de ser un callejón sin
--                                          salida. Ver docs/plan-anular-recepcion.md (D1).
--   2. stock_movement_type.anulacion_recepcion — el compensatorio se llama por su nombre en el
--                                          libro, no es un ajuste manual disfrazado (D4).
--
-- Por qué no se recicla 'con_observaciones', que está en reception_status desde la 0001 y nadie
-- usa: "con observaciones" no es "anulada". Darle un segundo significado a un valor muerto es la
-- clase de atajo que se cobra un año después, cuando alguien filtre por él esperando otra cosa.
--
-- ORDEN DE DESPLIEGUE: esta migración y la 0087 van PRIMERO, antes del front. Son puramente
-- ADITIVAS y el que no funciona sin ellas es el código nuevo.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0085 y ANTES de la
-- 0087. IDEMPOTENTE: las dos sentencias se pueden repetir.
-- ============================================================================

alter type public.reception_status    add value if not exists 'anulada';

alter type public.stock_movement_type add value if not exists 'anulacion_recepcion';
```

- [ ] **Paso 2: Escribir `0087_anular_recepcion.sql`**

Ojo con dos cosas al copiar: los comentarios **no** pueden contener dos signos peso pegados, y la
cantidad de marcadores de dollar-quote del archivo tiene que quedar **par** (acá: la apertura y el
cierre del cuerpo de la función, más los del bloque `do`).

```sql
-- ============================================================================
-- 0087 — Recepción: anular (y revertir el ingreso si ya estaba verificada)
--
-- Hoy la pantalla de Recepción no tiene NINGUNA salida: ni anular, ni editar, ni borrar. Un lote
-- tipeado mal o una cantidad equivocada quedan para siempre, y la única corrección posible es un
-- ajuste manual de stock — otra pantalla, otro motivo escrito, y los dos registros conviviendo sin
-- que nada los vincule. En una app auditable no borrar es correcto; no poder anular no lo es.
-- Ver docs/plan-anular-recepcion.md.
--
-- TRES RAMAS, porque no todas las recepciones hicieron lo mismo:
--
--   1. PENDIENTE — nunca tocó stock. Se sella el estado y listo.
--
--   2. VERIFICADA de medicación base (protocolo / ambulatoria) — ingresó a medication_lots por el
--      trigger apply_reception_stock (0003:97). Se revierte en DOS PASADAS: primero se validan
--      TODOS los renglones sin mover nada, después se aplica. Un raise dentro de un único loop
--      revertiría igual toda la transacción, pero abortaría en el primer renglón que falle y la
--      farmacéutica vería un problema por vez; validar todo primero hace el error completo.
--      La reversión es un movimiento COMPENSATORIO (-), no un borrado: stock_movements es el libro
--      insert-only que pide ANMAT. El lote tampoco se borra aunque quede en cero — el libro tiene
--      los dos asientos y la fila del lote es su percha.
--
--   3. VERIFICADA de Producto de Investigación — sólo cambia de estado. EL IP NO TIENE LIBRO:
--      create_ip_reception (0038) nace ya verificada y el stock lo DERIVA la vista v_ip_stock
--      (0071 §10) como "recibido − entregado". Anularla es sacarla del conjunto que la vista suma,
--      y el stock se recalcula solo. No se escribe compensatorio porque no hay tabla donde
--      escribirlo: es una asimetría real del modelo, no un olvido.
--
-- LO QUE NO SE PERMITE (D1): anular dejando el stock en descubierto. Si de un lote ya se dispensó
-- parte de lo que esta recepción ingresó, la función corta y explica con los números. Una
-- anulación no puede contradecir una dispensación ya entregada a un paciente; para ese descuadre
-- está el ajuste manual, que existe desde la 0032.
--
-- PERMISO: pharma leader+ (D2), el mismo que verifica y el mismo que ya puede mover cualquier lote
-- con adjust_stock. El control es el registro (quién, cuándo, por qué), no el rango.
--
-- LOS TRIGGERS VIEJOS NO MOLESTAN: set_reception_verified (0003:232) y apply_reception_stock
-- (0003:97) están condicionados a `new.status = 'verificada' and old.status is distinct from
-- 'verificada'`, así que un update a 'anulada' no entra en ninguno. Y el camino inverso queda
-- cerrado por verify_reception, que sólo acepta 'pendiente': una anulada no se puede re-verificar,
-- de modo que el stock no puede re-ingresarse.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0086 (que crea los dos
-- valores de enum que este archivo usa). IDEMPOTENTE. Registrar en supabase/README.md al
-- confirmarse aplicada.
-- ============================================================================


-- 1 · Las cuatro columnas de la anulación -------------------------------------
-- voided_by_name va DESNORMALIZADO, igual que verified_by_name en la 0085: la policy de users es
-- `id = auth.uid() or has_module('gerencia')` (0006:82), así que un join dejaría a la farmacéutica
-- viendo su propio nombre y NULL en todo lo que anuló otra persona. Lo escribe esta función, que
-- es SECURITY DEFINER y sí puede leer users. Quinta vez que aparece el mismo muro.
--
-- voided_by es la TERCERA FK de medication_receptions a users (ya están received_by y
-- verified_by). Es seguro: ningún select del front embebe users desde esta tabla —la 0085
-- desnormalizó el nombre justamente para no hacerlo—, así que no hay embed que quede ambiguo
-- (PGRST201, el incidente de la 0076).
alter table public.medication_receptions
  add column if not exists voided_at      timestamptz,
  add column if not exists voided_by      uuid references public.users(id),
  add column if not exists voided_by_name text,
  add column if not exists void_reason    text;

comment on column public.medication_receptions.voided_at is
  'Cuándo se anuló la recepción. NULL = no está anulada. 0087.';
comment on column public.medication_receptions.voided_by is
  'Quién la anuló (auditable). Lo sella void_reception. 0087.';
comment on column public.medication_receptions.voided_by_name is
  'Snapshot del nombre de quien anuló (la RLS de users oculta las filas ajenas → no se puede joinear; lo escribe void_reception, que es SECURITY DEFINER). Mismo patrón que verified_by_name (0085). 0087.';
comment on column public.medication_receptions.void_reason is
  'Motivo de la anulación, obligatorio. Queda asentado también en el reason del movimiento compensatorio. 0087.';


-- 2 · Una anulada SIEMPRE tiene fecha y motivo --------------------------------
-- Ninguna fila existente la viola (no hay anuladas todavía), así que entra sin NOT VALID. El
-- bloque `do` la hace repetible: ADD CONSTRAINT no acepta IF NOT EXISTS.
do $blk$
begin
  if not exists (select 1 from pg_constraint where conname = 'medication_receptions_anulada_chk') then
    alter table public.medication_receptions
      add constraint medication_receptions_anulada_chk
      check (status <> 'anulada' or (voided_at is not null and void_reason is not null));
  end if;
end
$blk$;


-- 3 · void_reception ----------------------------------------------------------
create or replace function public.void_reception(p_reception_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_status    reception_status;
  v_tipo      reception_kind;
  v_protocol  uuid;
  v_kits      integer;
  v_recibido  integer;
  v_entregado integer;
  v_lot_id    uuid;
  v_en_lote   integer;
  v_name      text;
  it          record;
begin
  if not public.has_min_role('pharma','leader') then
    raise exception 'Sin permiso para anular recepciones' using errcode = '42501';
  end if;

  -- Mismo criterio que adjust_stock (0032): sin motivo no hay anulación.
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'La anulación requiere un motivo' using errcode = 'check_violation';
  end if;

  -- FOR UPDATE: lock anti-carrera con una verificación simultánea sobre la misma recepción.
  select r.status, r.tipo, r.protocol_id, r.total_kits
    into v_status, v_tipo, v_protocol, v_kits
    from public.medication_receptions r
   where r.id = p_reception_id
     for update;

  if v_status is null then
    raise exception 'Recepción % inexistente', p_reception_id using errcode = 'foreign_key_violation';
  end if;
  if v_status = 'anulada' then
    raise exception 'La recepción % ya está anulada', p_reception_id using errcode = 'check_violation';
  end if;

  -- Una PENDIENTE nunca tocó stock: se saltea todo esto y sólo se sella al final.
  if v_status = 'verificada' then

    if v_tipo = 'investigacion' then
      -- ── Rama IP ──────────────────────────────────────────────────────────────
      -- La rama se elige por TIPO y no por `total_kits is not null` a propósito: las recepciones
      -- IP viejas (modelo por-unidad, anterior a la 0038) tienen total_kits NULL y tampoco
      -- ingresaron nunca a medication_lots — la rama IP del trigger apply_reception_stock (0037)
      -- retorna temprano. Mandarlas al loop de renglones las haría fallar buscando lotes que no
      -- existen. Sin kits que descontar, anularlas es sólo cambiar el estado.
      if v_kits is not null then
        -- Las dos mitades de v_ip_stock (0071 §10), replicadas acá porque la vista es
        -- security_invoker y agrega POR PROTOCOLO, no por recepción.
        select coalesce(sum(r.total_kits), 0) into v_recibido
          from public.medication_receptions r
         where r.protocol_id = v_protocol and r.tipo = 'investigacion'
           and r.status = 'verificada' and r.total_kits is not null;

        select coalesce(sum(d.ip_kits), 0) into v_entregado
          from public.dispensations d
          join public.dispensation_requests dr on dr.id = d.request_id
         where dr.protocol_id = v_protocol and d.ip_kits is not null and d.status = 'entregada';

        if v_recibido - v_entregado < v_kits then
          raise exception
            'No se puede anular: al protocolo le quedan % kits disponibles y esta recepción ingresó %. Ya se dispensaron kits que dependen de ella.',
            v_recibido - v_entregado, v_kits using errcode = 'check_violation';
        end if;
      end if;

    else
      -- ── Rama base (protocolo / ambulatoria) ─────────────────────────────────
      -- PASADA 1 · validar TODOS los renglones antes de mover un solo número.
      -- El lote se ubica por (medication_id, lot_number) porque reception_items no guarda lot_id;
      -- es la misma clave del unique de medication_lots (0002:241) que usa el upsert del ingreso.
      -- El FOR UPDATE de acá sostiene el lock hasta el fin de la transacción, así que la pasada 2
      -- opera sobre lo mismo que se validó.
      for it in
        select i.medication_id, i.lot_number, i.quantity
          from public.reception_items i
         where i.reception_id = p_reception_id
      loop
        select l.id, l.quantity_on_hand into v_lot_id, v_en_lote
          from public.medication_lots l
         where l.medication_id = it.medication_id and l.lot_number = it.lot_number
           for update;

        if v_lot_id is null then
          raise exception 'El lote % ya no existe: no se puede revertir su ingreso', it.lot_number
            using errcode = 'foreign_key_violation';
        end if;
        if v_en_lote < it.quantity then
          raise exception
            'No se puede anular: del lote % quedan % unidades y esta recepción ingresó %. Ya se dispensaron unidades de ese lote.',
            it.lot_number, v_en_lote, it.quantity using errcode = 'check_violation';
        end if;
      end loop;

      -- PASADA 2 · aplicar.
      for it in
        select i.medication_id, i.lot_number, i.quantity
          from public.reception_items i
         where i.reception_id = p_reception_id
      loop
        select l.id into v_lot_id
          from public.medication_lots l
         where l.medication_id = it.medication_id and l.lot_number = it.lot_number;

        update public.medication_lots l
           set quantity_on_hand = l.quantity_on_hand - it.quantity,
               updated_at       = now()
         where l.id = v_lot_id;

        -- reference_type 'reception' + reference_id ya estaban permitidos por el check de la tabla
        -- (0002:335): el vínculo con la recepción, que es lo que hoy falta, no necesita ninguna
        -- columna nueva.
        insert into public.stock_movements
          (medication_id, lot_id, movement_type, quantity_delta,
           reference_id, reference_type, reason, created_by)
        values
          (it.medication_id, v_lot_id, 'anulacion_recepcion', -it.quantity,
           p_reception_id, 'reception', p_reason, auth.uid());
      end loop;
    end if;
  end if;

  -- El que anula es siempre el usuario actual, así que alcanza con resolver su propio nombre.
  select u.full_name into v_name
    from public.users u
   where u.id = auth.uid();

  update public.medication_receptions
     set status         = 'anulada',
         voided_at      = now(),
         voided_by      = auth.uid(),
         voided_by_name = v_name,
         void_reason    = p_reason
   where id = p_reception_id;
end;
$fn$;

comment on function public.void_reception is
  'Anula una recepción con motivo obligatorio. Pendiente → sella. Verificada de base → valida que el ingreso siga intacto, resta los lotes y escribe el compensatorio anulacion_recepcion. Verificada de IP → sólo estado (su stock lo deriva v_ip_stock). Bloquea si ya se dispensó. pharma leader+. SECURITY DEFINER. 0087.';

grant execute on function public.void_reception(uuid, text) to authenticated;
```

- [ ] **Paso 3: Comprobar la paridad del dollar-quoting de los dos archivos**

Es el chequeo que evita el error desconcertante del editor de Supabase (`42P01: relation "v_status"
does not exist`, a veinte líneas del comentario culpable). La cuenta tiene que dar **par**.

Correr:

```bash
node -e "for (const f of ['supabase/migrations/0086_reception_anulada_enum.sql','supabase/migrations/0087_anular_recepcion.sql']) { const s = require('fs').readFileSync(f,'utf8'); const n = (s.match(/\$[a-zA-Z_]*\$/g) || []).length; console.log(f, n, n % 2 === 0 ? 'OK (par)' : 'ROTO (impar)') }"
```

Esperado:

```
supabase/migrations/0086_reception_anulada_enum.sql 0 OK (par)
supabase/migrations/0087_anular_recepcion.sql 4 OK (par)
```

Si la `0087` da impar, hay un marcador suelto en un comentario: buscarlo y sacarlo antes de seguir.

- [ ] **Paso 4: Registrar las dos migraciones en el índice**

En `supabase/README.md`, agregar estas dos filas **inmediatamente después** de la fila de la `0085`.
Ojo: ese archivo está en **CRLF**; editalo sin convertirlo a LF o el diff sale entero.

```markdown
| 0086 | `reception_anulada_enum.sql` | Los dos valores de enum que la 0087 usa: `reception_status.anulada` y `stock_movement_type.anulacion_recepcion`. Archivo aparte **a propósito**: un valor recién creado con `ALTER TYPE ... ADD VALUE` no se puede usar en la misma transacción (trampa de la 0053). Aditiva, va ANTES del front. |
| 0087 | `anular_recepcion.sql` | **Anular una recepción** (`void_reception`, pharma leader+): las cuatro columnas de la anulación (`voided_at/by/by_name/reason`, el nombre desnormalizado por quinta vez del muro de `users`), el check de que una anulada siempre tiene motivo, y la RPC con sus tres ramas — pendiente sella; verificada de base valida en dos pasadas, resta los lotes y escribe el compensatorio `anulacion_recepcion`; verificada de IP sólo cambia de estado, porque su stock lo deriva `v_ip_stock` y no hay libro donde compensar. Bloquea si ya se dispensó. Aditiva, va ANTES del front. |
```

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/0086_reception_anulada_enum.sql supabase/migrations/0087_anular_recepcion.sql supabase/README.md
git commit -m "feat(pharma): anular una recepción, en la base (0086 + 0087)"
```

---

### Task 2: Las reglas puras de la pantalla

Lo único de esta feature que puede fallar **en silencio**: un total mal sumado se lee tan prolijo
como uno correcto. Va con TDD real — test primero, verlo fallar, implementar.

**Files:**
- Modify: `src/views/pharma/recepcion/derivados.ts`
- Modify: `src/views/pharma/recepcion/derivados.test.ts`
- Modify: `src/views/pharma/recepcion/ConfirmarVerificacion.tsx` (deja de usar el `replace`)

**Interfaces:**
- Consumes: `FilaRecepcion` (ya existe en `derivados.ts`).
- Produces: `contenidoDe(r: FilaRecepcion): string` · `armarMotivo(motivo: string, nota: string): string`
  · `resumenContenido` y `totalesDelDia` con su comportamiento nuevo.

- [ ] **Paso 1: Escribir los tests que fallan**

Agregar al final de `src/views/pharma/recepcion/derivados.test.ts`. Los helpers `fila`, `item` e
`ip` ya existen arriba en ese archivo — no los redefinas.

```ts
describe('contenidoDe', () => {
  it('devuelve el cuerpo SIN verbo, para que lo use el que arma la frase', () => {
    const r = fila({ items: [item({ med: 'm1', qty: 10 }), item({ med: 'm2', qty: 5 })] })
    expect(contenidoDe(r)).toBe('2 medicamentos · 15 unidades')
  })

  it('en IP habla de kits', () => {
    expect(contenidoDe(ip({ total_kits: 24 }))).toBe('24 kits')
  })
})

describe('resumenContenido · la voz de la anulada', () => {
  // La banda ya lleva el rótulo ANULADA al lado, así que el resumen no lo repite: lo dice el
  // VERBO, igual que distingue "trae" (pendiente) de "ingresadas" (verificada).
  it('habla en pasado: traía, no trae', () => {
    const r = fila({ status: 'anulada', items: [item({ qty: 15 })] })
    expect(resumenContenido(r)).toBe('traía 1 medicamento · 15 unidades')
  })

  it('una anulada NO dice que ingresó nada', () => {
    const r = fila({ status: 'anulada', items: [item({ qty: 15 })] })
    expect(resumenContenido(r)).not.toMatch(/ingresad/)
  })

  it('en IP anulada también va en pasado', () => {
    expect(resumenContenido(ip({ status: 'anulada', total_kits: 24 }))).toBe('traía 24 kits')
  })
})

describe('totalesDelDia · con una anulada en el grupo', () => {
  // Cuenta los DOCUMENTOS que hay a la vista —la anulada sigue en la lista (D3)— pero no suma sus
  // unidades, y nombra el descuento. Si contara 2 con tres cards en pantalla, se leería como un bug.
  it('cuenta la anulada como recepción, no como unidades, y la nombra', () => {
    const rows = [
      fila({ items: [item({ qty: 10 })] }),
      fila({ items: [item({ qty: 5 })] }),
      fila({ status: 'anulada', items: [item({ qty: 99 })] }),
    ]
    expect(totalesDelDia(rows)).toBe('3 recepciones · 15 unidades · 1 anulada')
  })

  it('no descuenta kits de una IP vigente, sí de una anulada', () => {
    const rows = [ip({ total_kits: 24 }), ip({ status: 'anulada', total_kits: 100 })]
    expect(totalesDelDia(rows)).toBe('2 recepciones · 24 kits · 1 anulada')
  })

  it('sin anuladas, el texto queda exactamente como antes', () => {
    expect(totalesDelDia([fila({ items: [item({ qty: 4 })] })])).toBe('1 recepción · 4 unidades')
  })

  it('un día entero de anuladas no inventa unidades', () => {
    const rows = [fila({ status: 'anulada', items: [item({ qty: 9 })] })]
    expect(totalesDelDia(rows)).toBe('1 recepción · 1 anulada')
  })
})

describe('armarMotivo', () => {
  it('pega la nota con raya', () => {
    expect(armarMotivo('Duplicada', 'la cargó también Ana')).toBe('Duplicada — la cargó también Ana')
  })

  it('sin nota, el motivo va solo: nada de rayas colgando', () => {
    expect(armarMotivo('Duplicada', '')).toBe('Duplicada')
    expect(armarMotivo('Duplicada', '   ')).toBe('Duplicada')
  })
})

describe('coincideBusqueda · una anulada se sigue encontrando', () => {
  // D3: la anulada queda en el talonario. Si el buscador la escondiera, el hueco en los folios no
  // se explicaría solo.
  it('la encuentra por folio y por lote', () => {
    const r = fila({ status: 'anulada', folio: 11, items: [item({ lote: 'L-2291' })] })
    expect(coincideBusqueda(r, '11')).toBe(true)
    expect(coincideBusqueda(r, 'L-2291')).toBe(true)
  })
})
```

Actualizar también la línea del `import` al tope del archivo de test para que traiga las funciones
nuevas:

```ts
import { armarMotivo, coincideBusqueda, contenidoDe, esCodigoDeBarras, medicamentosDistintos, resumenContenido, totalesDelDia, unidadesDe } from './derivados'
```

- [ ] **Paso 2: Correr los tests y verlos fallar**

Correr:

```bash
npx vitest run src/views/pharma/recepcion/derivados.test.ts
```

Esperado: **FAIL**. Los primeros errores son de importación —`contenidoDe` y `armarMotivo` no
existen todavía— y los de `resumenContenido`/`totalesDelDia` fallan por valor (dicen `trae` donde el
test espera `traía`, y suman las unidades de la anulada).

- [ ] **Paso 3: Implementar en `derivados.ts`**

Reemplazar la función `resumenContenido` y sus dos helpers de cabecera por esto, dejando el resto
del archivo intacto:

```ts
const esIp = (r: FilaRecepcion) => r.tipo === 'investigacion'
const verificada = (r: FilaRecepcion) => r.status === 'verificada'
const anulada = (r: FilaRecepcion) => r.status === 'anulada'

/**
 * El CUERPO del resumen, sin verbo: "2 medicamentos · 15 unidades" o "24 kits".
 *
 * Existe separado porque tres lugares necesitan el mismo cuerpo con frases distintas alrededor: la
 * banda de la card, la confirmación de verificar ("van a entrar…") y la de anular ("van a salir…").
 * Antes la confirmación se lo sacaba al resumen con un `.replace(/^trae /, '')`, que es un
 * acoplamiento invisible: el día que cambie el verbo, el replace deja de encontrarlo y el modal
 * empieza a mostrar la frase con verbo adentro, sin que nada falle.
 */
export function contenidoDe(r: FilaRecepcion): string {
  if (esIp(r)) {
    const kits = r.total_kits ?? 0
    return `${formatNumberAR(kits)} ${kits === 1 ? 'kit' : 'kits'}`
  }
  if (r.items.length === 0) return '0 renglones'

  const meds = medicamentosDistintos(r)
  const uds = unidadesDe(r)
  return (
    `${formatNumberAR(meds)} ${meds === 1 ? 'medicamento' : 'medicamentos'}` +
    ` · ${formatNumberAR(uds)} ${uds === 1 ? 'unidad' : 'unidades'}`
  )
}

/**
 * El resumen de contenido de la banda: "2 medicamentos · 15 unidades".
 *
 * El VERBO cambia con el estado y eso es el punto: hasta verificar, esas unidades todavía no
 * entraron a stock; una vez anulada, no entraron nunca y no van a entrar. El handoff resolvía la
 * distinción escondiendo el resumen en las pendientes, que son justo las cards sobre las que hay
 * que decidir algo; acá se resuelve diciéndolo.
 *
 * La anulada NO repite la palabra "anulada": el rótulo de la banda ya la lleva al lado, a dos
 * centímetros. Lo que la distingue es el tiempo verbal — "traía".
 */
export function resumenContenido(r: FilaRecepcion): string {
  const cuerpo = contenidoDe(r)

  if (esIp(r)) {
    if (anulada(r)) return `traía ${cuerpo}`
    const kits = r.total_kits ?? 0
    return verificada(r) ? `${cuerpo} ${kits === 1 ? 'ingresado' : 'ingresados'}` : `trae ${cuerpo}`
  }

  if (r.items.length === 0) {
    if (anulada(r)) return 'Sin renglones'
    return verificada(r) ? 'Sin renglones' : 'trae 0 renglones'
  }

  if (anulada(r)) return `traía ${cuerpo}`
  const uds = unidadesDe(r)
  return verificada(r) ? `${cuerpo} ${uds === 1 ? 'ingresada' : 'ingresadas'}` : `trae ${cuerpo}`
}
```

Reemplazar `totalesDelDia` por:

```ts
/**
 * El conteo de la barra de cada día: "3 recepciones · 15 unidades · 1 anulada".
 *
 * Las unidades y los kits NUNCA se suman entre sí (principio del Director Médico, 0038: la
 * composición de un kit la declara el sponsor y Spira no la reinterpreta). Si el día mezcla las
 * dos cosas, se enuncian las dos por separado.
 *
 * Las ANULADAS se cuentan como recepciones pero no aportan unidades ni kits. Las dos mitades de esa
 * decisión importan: son documentos que siguen a la vista (D3), así que descontarlas del conteo
 * dejaría tres cards bajo un rótulo que dice "2 recepciones" —se lee como un bug—; y sus unidades
 * nunca entraron a stock, así que sumarlas haría mentir al total. Por eso además se nombran: el
 * "· 1 anulada" es lo que explica por qué la cuenta de unidades no cierra con la de cards.
 */
export function totalesDelDia(rows: FilaRecepcion[]): string {
  const n = rows.length
  const vigentes = rows.filter((r) => !anulada(r))
  const anuladas = n - vigentes.length
  const uds = vigentes.filter((r) => !esIp(r)).reduce((s, r) => s + unidadesDe(r), 0)
  const kits = vigentes.filter(esIp).reduce((s, r) => s + (r.total_kits ?? 0), 0)

  const partes = [`${formatNumberAR(n)} ${n === 1 ? 'recepción' : 'recepciones'}`]
  if (uds > 0) partes.push(`${formatNumberAR(uds)} ${uds === 1 ? 'unidad' : 'unidades'}`)
  if (kits > 0) partes.push(`${formatNumberAR(kits)} ${kits === 1 ? 'kit' : 'kits'}`)
  if (anuladas > 0) partes.push(`${formatNumberAR(anuladas)} ${anuladas === 1 ? 'anulada' : 'anuladas'}`)
  return partes.join(' · ')
}

/**
 * El motivo que queda asentado: "Duplicada — la cargó también Ana", o sólo "Duplicada".
 *
 * Vive acá y no dentro del modal porque es texto que se escribe UNA vez y se lee para siempre —va
 * al `void_reason` de la recepción y al `reason` del movimiento compensatorio—, y una raya colgando
 * o un espacio de más no se ven mal en pantalla: se leen mal seis meses después, en la auditoría.
 */
export function armarMotivo(motivo: string, nota: string): string {
  const m = motivo.trim()
  const n = nota.trim()
  return n ? `${m} — ${n}` : m
}
```

- [ ] **Paso 4: Correr los tests y verlos pasar**

Correr:

```bash
npx vitest run src/views/pharma/recepcion/derivados.test.ts
```

Esperado: **PASS**, con los tests viejos del archivo también en verde (no se tocó ninguno de sus
comportamientos salvo el de `totalesDelDia`, que sólo agrega una parte cuando hay anuladas).

- [ ] **Paso 5: Sacar el `replace` de `ConfirmarVerificacion`**

En `src/views/pharma/recepcion/ConfirmarVerificacion.tsx`, cambiar el import y la línea del cuerpo:

```tsx
import { contenidoDe } from './derivados'
```

```tsx
  // El cuerpo sin verbo: acá la frase la arma el modal ("van a entrar…").
  const contenido = contenidoDe(r)
```

Borrar el `import { resumenContenido } from './derivados'` si queda sin uso.

- [ ] **Paso 6: Typecheck y commit**

Correr:

```bash
npm run typecheck
```

Esperado: sin errores.

```bash
git add src/views/pharma/recepcion/derivados.ts src/views/pharma/recepcion/derivados.test.ts src/views/pharma/recepcion/ConfirmarVerificacion.tsx
git commit -m "feat(pharma): las reglas puras de la anulación (contenido, verbo y totales)"
```

---

### Task 3: La capa de datos

**Files:**
- Modify: `src/data/pharma/receptions.ts`

**Interfaces:**
- Consumes: `void_reception(uuid, text)` de la Task 1.
- Produces: `voidReception(receptionId: string, reason: string): Promise<{ error: string | null; code?: string }>`
  · `ReceptionStatus` con `'anulada'` · `ReceptionRow` con `voided_at`, `voided_by_name`, `void_reason`.

- [ ] **Paso 1: Ampliar el tipo y las columnas**

En `src/data/pharma/receptions.ts`:

```ts
/** Estado de una recepción (enum `reception_status` de la base). `anulada` desde la 0086. */
export type ReceptionStatus = 'pendiente' | 'verificada' | 'anulada'
```

Agregar a `ReceptionRow`, después de `verified_by_name`:

```ts
  /** Cuándo se anuló. NULL = no está anulada. 0087. */
  voided_at: string | null
  /** Snapshot del nombre de quien anuló, desnormalizado por el mismo muro de RLS que
   *  `verified_by_name`: la policy de `users` sólo expone la fila propia. 0087. */
  voided_by_name: string | null
  /** Motivo de la anulación, obligatorio. Es el mismo texto que queda en el `reason` del
   *  movimiento compensatorio del libro. 0087. */
  void_reason: string | null
```

Y en `RECEPTION_COLS`, agregar las tres a la primera línea:

```ts
const RECEPTION_COLS =
  'id, folio, tipo, protocol_id, reception_date, status, verified_at, verified_by_name, notes, ' +
  'voided_at, voided_by_name, void_reason, ' +
```

- [ ] **Paso 2: Agregar la mutación**

Al final del archivo, después de `verifyReception`:

```ts
/**
 * Anula una recepción con motivo obligatorio (RPC `void_reception`, pharma leader+).
 *
 * Si estaba verificada, la RPC revierte el ingreso: resta los lotes y escribe el movimiento
 * compensatorio. **Puede fallar legítimamente** —y es el caso interesante— cuando de ese lote ya se
 * dispensaron unidades: la base contesta con el detalle (cuánto queda, cuánto haría falta) y ese
 * texto es el que se muestra, porque explica mejor que cualquier mensaje genérico nuestro.
 */
export async function voidReception(
  receptionId: string,
  reason: string,
): Promise<{ error: string | null; code?: string }> {
  const { error } = await supabase.rpc('void_reception', {
    p_reception_id: receptionId,
    p_reason: reason,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}
```

No hay que tocar `src/data/pharma/index.ts`: es un barrel con `export * from './receptions'`, así
que `voidReception` queda disponible en `data/pharma` sola.

- [ ] **Paso 3: Typecheck y commit**

Correr:

```bash
npm run typecheck
```

Esperado: sin errores.

```bash
git add src/data/pharma/receptions.ts
git commit -m "feat(pharma): voidReception y el estado anulada en la capa de datos"
```

---

### Task 4: El modal de anulación

**Files:**
- Create: `src/views/pharma/recepcion/AnularRecepcion.tsx`

**Interfaces:**
- Consumes: `contenidoDe` y `armarMotivo` (Task 2) · `ReceptionRow` (Task 3) · `Modal`,
  `FormField`, `fieldInput`, `SearchableSelect`, `btnOutline` (componentes existentes).
- Produces: `<AnularRecepcion r busy error onCancel onConfirmar />`, donde
  `onConfirmar: (reason: string) => void`.

- [ ] **Paso 1: Escribir el componente**

```tsx
import { useState } from 'react'
import { Modal } from '../../../components/Modal'
import { FormField, fieldInput } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline } from '../../../components/buttons'
import type { ReceptionRow } from '../../../data/pharma'
import { KIND_CHIP } from './ambitos'
import { armarMotivo, contenidoDe } from './derivados'

/** Motivos preestablecidos: desplegable, no texto libre. Menos error del operador y, sobre todo,
 *  motivos comparables entre sí cuando alguien audite por qué se anularon seis recepciones. */
const MOTIVOS = [
  'Cargada por error',
  'Duplicada',
  'Cargamento rechazado',
  'Datos incorrectos (lote o vencimiento)',
  'Otro',
]

/**
 * Confirmación antes de anular — el espejo de `ConfirmarVerificacion`.
 *
 * Dice el NÚMERO delante, igual que su hermana: "van a salir de stock 15 unidades" informa, "¿estás
 * seguro?" no informa nada. La diferencia con verificar es que acá el número puede no existir: una
 * pendiente nunca entró a stock, y decirlo es justamente lo que baja el susto de la operación.
 *
 * El error se muestra ACÁ ADENTRO y el modal queda abierto. Es lo contrario de lo que hace el de
 * verificar, y a propósito: el error típico de anular —"del lote quedan 2 y esta recepción ingresó
 * 5"— no se arregla reintentando, se lee y se decide otra cosa. Cerrar el modal para mostrarlo en
 * la banda obligaría a volver a abrirlo para leer con qué motivo se estaba intentando.
 */
export function AnularRecepcion({ r, busy, error, onCancel, onConfirmar }: {
  r: ReceptionRow
  busy: boolean
  /** Mensaje del intento fallido. Viene de la base y suele traer los números del bloqueo. */
  error: string | null
  onCancel: () => void
  onConfirmar: (reason: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [falta, setFalta] = useState(false)

  const ambito = KIND_CHIP[r.tipo] ?? KIND_CHIP.protocolo
  const verificada = r.status === 'verificada'

  const confirmar = () => {
    if (!motivo) { setFalta(true); return }
    setFalta(false)
    onConfirmar(armarMotivo(motivo, nota))
  }

  return (
    <Modal
      title={`Anular la recepción Nº ${r.folio}`}
      onClose={busy ? () => {} : onCancel}
      icon="x"
      accent="var(--spira-danger)"
      accentSoft="rgba(166,72,59,.12)"
      maxWidth={460}
    >
      <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.55, color: 'var(--spira-ink)' }}>
        {verificada
          ? <>Van a salir de stock <strong>{contenidoDe(r)}</strong>.</>
          : <>Esta recepción <strong>nunca entró a stock</strong>: no hay nada que revertir.</>}
      </p>

      <dl style={ficha}>
        <dt style={dt}>Ámbito</dt>
        <dd style={dd}>
          <span style={{ color: ambito.color, fontWeight: 600 }}>{ambito.label}</span>
          {r.protocol && <span className="spira-mono" style={{ marginLeft: 8, color: 'var(--spira-ink-2)' }}>{r.protocol.code}</span>}
        </dd>
        {r.items.length > 0 && (
          <>
            <dt style={dt}>Lotes</dt>
            <dd style={dd}>
              <span className="spira-mono">{r.items.map((it) => it.lot_number).join(' · ')}</span>
            </dd>
          </>
        )}
      </dl>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '0 0 16px' }}>
        <FormField label="Motivo">
          <SearchableSelect
            value={motivo}
            onChange={(v) => { setMotivo(v); setFalta(false) }}
            options={MOTIVOS.map((m) => ({ value: m, label: m }))}
            placeholder="Elegí un motivo"
            searchPlaceholder="Buscar motivo…"
            entity="motivo"
          />
        </FormField>
        <FormField label="Nota (opcional)">
          <input value={nota} onChange={(e) => setNota(e.target.value)} style={fieldInput} />
        </FormField>
      </div>

      <p style={{ margin: '0 0 18px', fontSize: 12.5, color: 'var(--spira-ink-soft)', lineHeight: 1.5 }}>
        {verificada
          ? 'La anulación queda asentada en el libro de stock junto con su motivo. La recepción no se borra: sigue en la lista, marcada como anulada.'
          : 'La recepción no se borra: sigue en la lista, marcada como anulada y con su motivo. No se puede reactivar.'}
      </p>

      {(falta || error) && (
        <div style={cajaError} role="alert">
          {falta ? 'Elegí un motivo para poder anular.' : error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} disabled={busy} style={{ ...btnOutline, height: 38 }}>
          Cancelar
        </button>
        <button type="button" onClick={confirmar} disabled={busy} style={{ ...btnAnular, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Anulando…' : 'Anular recepción'}
        </button>
      </div>
    </Modal>
  )
}

const ficha = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', margin: '0 0 16px' } as const
const dt = { fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)' } as const
const dd = { margin: 0, fontSize: 13.5, color: 'var(--spira-ink)', minWidth: 0, wordBreak: 'break-word' } as const
const cajaError = {
  fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166,72,59,.10)',
  borderRadius: 8, padding: '9px 12px', margin: '0 0 14px', lineHeight: 1.45,
} as const
const btnAnular = {
  height: 38, padding: '0 16px', border: 'none', borderRadius: 10, background: 'var(--spira-danger)',
  color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5,
  cursor: 'pointer',
} as const
```

Las props usadas están verificadas contra los componentes reales: `Modal` es
`({ title, onClose, children, maxWidth = 440, icon, accent, accentSoft })` (`Modal.tsx:32`) y el
uso de `SearchableSelect` con `entity`/`searchPlaceholder` es el mismo de `AdjustStockModal.tsx`.

- [ ] **Paso 2: Typecheck**

Correr:

```bash
npm run typecheck
```

Esperado: sin errores. El componente todavía no se usa en ningún lado; eso no rompe el typecheck.

- [ ] **Paso 3: Commit**

```bash
git add src/views/pharma/recepcion/AnularRecepcion.tsx
git commit -m "feat(pharma): el modal de anulación, con el número delante"
```

---

### Task 5: Anular de punta a punta

La card gana la banda gris y el botón; la vista los cablea. Van juntas porque la prop nueva de
`ReceptionCard` no compila sin quien se la pase.

**Files:**
- Modify: `src/views/pharma/recepcion/ReceptionCard.tsx`
- Modify: `src/views/pharma/RecepcionView.tsx`

**Interfaces:**
- Consumes: `voidReception` (Task 3) · `<AnularRecepcion />` (Task 4).
- Produces: `ReceptionCard` con la prop `onAnular: () => void`.

- [ ] **Paso 1: La banda de la card, con sus cuatro estados**

En `src/views/pharma/recepcion/ReceptionCard.tsx`, reemplazar la función `Banda` completa por:

```tsx
/* ── Banda de estado ─────────────────────────────────────────────────────────
   Tres elementos, no cuatro: rótulo · contexto · acción. La frase "La medicación todavía no
   entró a stock" del mock salió — repite lo que el rótulo ya dice y le quitaba aire al botón.

   La ANULADA va en gris neutro, no en rojo: el rojo de esta banda está tomado por "No se pudo
   verificar", que sí es una falla del sistema. Anular es una decisión deliberada de la
   farmacéutica, y pintarla de error la acusa de algo que no pasó. */
function Banda({ r, canManage, busy, error, onVerify, onAnular }: {
  r: ReceptionRow; canManage: boolean; busy: boolean; error: string | null
  onVerify: () => void; onAnular: () => void
}) {
  const verificada = r.status === 'verificada'
  const anulada = r.status === 'anulada'
  const resumen = resumenContenido(r)

  // Los tokens `acc-deep-*` y no un color-mix con la tinta: la familia acc-deep tiene versión
  // ACLARADA para tema oscuro, y una mezcla oscurecida ahí sería texto invisible sobre el tinte.
  const tinte = error ? 'rgba(166,72,59,.10)'
    : anulada ? 'var(--spira-surface)'
    : verificada ? 'rgba(92,138,90,.10)'
    : 'rgba(176,130,63,.13)'
  const tinta = error ? 'var(--spira-acc-deep-danger)'
    : anulada ? 'var(--spira-ink-soft)'
    : verificada ? 'var(--spira-acc-deep-good)'
    : 'var(--spira-acc-deep-warn)'

  const icono = error ? 'alertCircle' : anulada ? 'x' : verificada ? 'check' : 'clock'
  const rotulo = error ? 'No se pudo verificar'
    : anulada ? 'Anulada'
    : verificada ? 'Verificada'
    : 'Pendiente de verificar'

  return (
    <div style={{ ...banda, background: tinte, color: tinta }}>
      <Icon name={icono} size={15} color="currentColor" stroke={verificada && !error ? 2.6 : 2.2} />
      <span style={rotuloEstado}>{rotulo}</span>

      {error ? (
        <span style={{ ...textoBanda, color: 'var(--spira-acc-deep-danger)' }}>{error}</span>
      ) : (
        <>
          {anulada && <span style={textoBanda}>{anuladaPor(r)}</span>}
          {verificada && <span style={textoBanda}>{ingresadaPor(r)}</span>}
          <span style={{ ...textoBanda, marginLeft: 'auto' }}>{resumen}</span>
        </>
      )}

      {canManage && !anulada && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flex: '0 0 auto' }}>
          {!verificada && (
            <button
              type="button"
              onClick={onVerify}
              disabled={busy}
              style={{ ...btnVerificar, opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}
            >
              <Icon name="check" size={15} color="var(--spira-on-accent)" stroke={2.4} />
              {busy ? 'Verificando…' : error ? 'Reintentar' : 'Verificar e ingresar a stock'}
            </button>
          )}
          {/* Secundaria por PESO, no por color: el rojo aparece recién en el modal. Una lista no
              es un formulario de borrado. */}
          <button
            type="button"
            onClick={onAnular}
            disabled={busy}
            style={{ ...btnOutline, height: 38, fontSize: 13, opacity: busy ? 0.7 : 1 }}
          >
            Anular
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * "Anulada por Fulana · 17 ago 2026 14:22 · Duplicada". Hermana de `ingresadaPor`, con el mismo
 * cuidado con la fecha: sale del `Date` y NO de recortar el ISO. `voided_at` es un timestamptz que
 * llega en UTC, así que `slice(0, 10)` fecharía un día adelante todo lo anulado después de las
 * 21:00 hora argentina.
 */
function anuladaPor(r: ReceptionRow): string {
  const partes: string[] = []
  if (r.voided_at) {
    const fecha = formatDayMonthYear(dateToISO(new Date(r.voided_at)))
    const hora = formatTimeAR(r.voided_at)
    partes.push(r.voided_by_name ? `Anulada por ${r.voided_by_name} · ${fecha} ${hora}` : `Anulada · ${fecha} ${hora}`)
  } else {
    partes.push('Anulada')
  }
  if (r.void_reason) partes.push(r.void_reason)
  return partes.join(' · ')
}
```

Actualizar la firma del componente `ReceptionCard` y la llamada a `<Banda>`:

```tsx
export function ReceptionCard({ r, canManage, busy, highlight, error, onVerify, onAnular }: {
  r: ReceptionRow
  canManage: boolean
  busy: boolean
  highlight: boolean
  /** Mensaje del intento fallido de verificar ESTA recepción. Va en su banda, no en el tope de
   *  la lista: con las cards agrupadas por día, un error allá arriba puede quedar fuera de vista. */
  error: string | null
  onVerify: () => void
  onAnular: () => void
}) {
```

```tsx
      <Banda r={r} canManage={canManage} busy={busy} error={error} onVerify={onVerify} onAnular={onAnular} />
```

Y agregar el import de `btnOutline` al tope del archivo:

```tsx
import { btnOutline } from '../../../components/buttons'
```

- [ ] **Paso 2: Cablear la vista**

En `src/views/pharma/RecepcionView.tsx`:

Imports — agregar el modal y la mutación:

```tsx
import { AnularRecepcion } from './recepcion/AnularRecepcion'
```

```tsx
import { useReceptions, useMedications, verifyReception, voidReception, TECHO_RECEPCIONES } from '../../data/pharma'
```

Estado — junto a `confirmando`:

```tsx
  const [anulando, setAnulando] = useState<ReceptionRow | null>(null)
  /** Error del intento de anular. Vive aparte de `errorPorId` porque se muestra DENTRO del modal,
   *  que queda abierto: el bloqueo típico ("del lote quedan 2 y esta ingresó 5") no se arregla
   *  reintentando, se lee y se decide otra cosa. */
  const [errorAnular, setErrorAnular] = useState<string | null>(null)
```

Handler — debajo de `confirmarVerificacion`:

```tsx
  /** Paso 2 de la anulación: el usuario ya eligió motivo y confirmó. */
  const confirmarAnulacion = async (reason: string) => {
    const r = anulando
    if (!r) return
    setBusyId(r.id)
    const res = await voidReception(r.id, reason)
    setBusyId(null)
    if (res.error) { setErrorAnular(res.error); return }
    // Si la recepción venía de un intento fallido de verificar, ese error ya no aplica.
    setErrorPorId((prev) => { const n = { ...prev }; delete n[r.id]; return n })
    setAnulando(null)
    setErrorAnular(null)
    receptions.refetch()
    setToast(`Recepción Nº ${r.folio} anulada`)
  }
```

En el `<ReceptionCard>` del listado, agregar la prop:

```tsx
                    onAnular={() => { setErrorAnular(null); setAnulando(r) }}
```

Y montar el modal junto al de confirmación:

```tsx
      {anulando && (
        <AnularRecepcion
          r={anulando}
          busy={busyId === anulando.id}
          error={errorAnular}
          onCancel={() => { setAnulando(null); setErrorAnular(null) }}
          onConfirmar={confirmarAnulacion}
        />
      )}
```

- [ ] **Paso 3: Typecheck + suite completa**

Correr:

```bash
npm run build
```

Esperado: typecheck sin errores, los tests en verde y el build completo. Si aparecen errores de
consola raros justo después de editar, reiniciá el dev server antes de diagnosticar: suelen ser
stale de HMR.

- [ ] **Paso 4: Commit**

```bash
git add src/views/pharma/recepcion/ReceptionCard.tsx src/views/pharma/RecepcionView.tsx
git commit -m "feat(pharma): anular desde la card, con banda gris y motivo asentado"
```

---

### Task 6: El filtro de estado

**Files:**
- Modify: `src/views/pharma/RecepcionView.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: nada que consuman otras tareas.

- [ ] **Paso 1: Reemplazar el booleano por el estado de tres valores**

Dos chips toggle **excluyentes**, ninguno tildado = todas. No un radiogroup de tres: pondría un
segundo "Todas" pegado al "Todas" del eje de ámbito, que ya existe.

Estado — reemplazar `const [soloPendientes, setSoloPendientes] = useState(false)` por:

```tsx
  /** Eje de estado. Dos chips excluyentes; 'todas' es "ninguno tildado". */
  const [estado, setEstado] = useState<'todas' | 'pendientes' | 'anuladas'>('todas')
```

Filtro — dentro del `useMemo` de `rows`, reemplazar la línea de `soloPendientes` por:

```tsx
      if (estado === 'pendientes' && r.status !== 'pendiente') return false
      if (estado === 'anuladas' && r.status !== 'anulada') return false
```

y cambiar la dependencia `soloPendientes` por `estado` en el array del `useMemo`.

`hayFiltros` — reemplazar `soloPendientes` por `estado !== 'todas'`.

`onCreated` del wizard — reemplazar `setSoloPendientes(false)` por `setEstado('todas')`.

- [ ] **Paso 2: Los dos chips en la toolbar**

Reemplazar el bloque del chip "Pendientes" por:

```tsx
      {/* Eje 1: estado. Dos toggles excluyentes (ninguno = todas), como el rango 7/30 de la
          derecha. Un radiogroup con su propio "Todas" quedaría al lado del "Todas" del ámbito. */}
      <div style={{ display: 'flex', gap: 7 }}>
        <Chip
          toggle
          label="Pendientes"
          selected={estado === 'pendientes'}
          onClick={() => { setEstado((v) => (v === 'pendientes' ? 'todas' : 'pendientes')); setHighlightId(null) }}
          accent={accentSolid}
        />
        <Chip
          toggle
          label="Anuladas"
          selected={estado === 'anuladas'}
          onClick={() => { setEstado((v) => (v === 'anuladas' ? 'todas' : 'anuladas')); setHighlightId(null) }}
          accent={accentSolid}
        />
      </div>
```

- [ ] **Paso 3: Build y commit**

Correr:

```bash
npm run build
```

Esperado: verde.

```bash
git add src/views/pharma/RecepcionView.tsx
git commit -m "feat(pharma): filtrar la lista de Recepción por anuladas"
```

---

### Task 7: Verificación en el navegador y cierre

**Files:**
- Modify: `TODOS.md`

- [ ] **Paso 1: Levantar el preview**

Usá las preview tools nativas (`.claude/launch.json` fija el **5250**; el 5173 suele ser del
Director). **No** uses `preview_screenshot`: se cuelga casi siempre en este proyecto. Verificá por
snapshot del DOM, estilos computados y consola.

- [ ] **Paso 2: Recorrer los cuatro estados de la banda**

Con una recepción **pendiente** de prueba (creala vos, con lote `TEST-*`, y anulala al terminar —
así se prueba la feature y se limpia sola):

1. Card pendiente → botón "Anular" al lado del verde.
2. Anular sin elegir motivo → *"Elegí un motivo para poder anular."* dentro del modal.
3. Anular con motivo → toast, banda gris, rótulo `ANULADA`, la línea con nombre/fecha/motivo, y el
   resumen en pasado (*"traía …"*).
4. Chip "Anuladas" → la card aparece; chip "Pendientes" → desaparece.
5. La daybar del día dice *"N recepciones · … · 1 anulada"*.

- [ ] **Paso 3: Probar el bloqueo, que es el caso que define el diseño**

Sobre una recepción **verificada** de la que ya se dispensó: el modal tiene que quedar abierto
mostrando el texto de la base con los números (*"del lote X quedan N unidades y esta recepción
ingresó M"*). Si no tenés una a mano, alcanza con verificar una de prueba, dispensar una unidad de
ese lote y después intentar anularla.

- [ ] **Paso 4: Confirmar que el tema oscuro no rompe la banda**

La banda anulada usa `--spira-surface` + `--spira-ink-soft`, los dos con versión propia en oscuro.
Cambiá el tema y verificá el contraste del rótulo con estilos computados (no a ojo: en el preview,
documento oculto, `getComputedStyle` devuelve el valor inicial si hay transición — apagala antes de
medir).

- [ ] **Paso 5: Cerrar el TODO**

En `TODOS.md`:
- Borrar la entrada **"Pharma · anular una recepción cargada mal"** entera (con su separador `---`).
- En **"Pharma · Recepción no escala al día de volumen"**, reemplazar la línea
  `- **Depende de / bloqueado por:** conviene después de resolver la anulación: si anular existe, la confirmación previa puede aflojarse.`
  por:
  `- **Depende de / bloqueado por:** nada: la anulación ya existe (0086/0087), así que la confirmación previa a verificar se puede aflojar — la idea del "deshacer por 30 segundos desde el toast" quedó viable.`

- [ ] **Paso 6: Build final y commit**

Correr:

```bash
npm run build
```

Esperado: verde.

```bash
git add TODOS.md
git commit -m "docs: cerrar el TODO de anular una recepción"
```

- [ ] **Paso 7: Push y PR**

No hay `gh` en esta máquina: la PR se crea por la API REST con `git credential fill` (ver
`CLAUDE.md`). **El agente no puede self-mergear**: se crea la PR y la mergea el Director.

```bash
git push -u origin feat/anular-recepcion
```

El cuerpo de la PR tiene que decir, arriba de todo, que **las migraciones `0086` y `0087` van
aplicadas ANTES del deploy del front**, y que al confirmarse hay que anotar la fecha en el índice de
`supabase/README.md` (lo vigila `scripts/check-migraciones.mjs`).

---

## Qué NO hace este plan

- **Editar una recepción.** Anular y volver a cargar es el camino.
- **Anular con unidades ya dispensadas.** Bloquea y explica; para ese descuadre está el ajuste
  manual (D1).
- **Verificación en lote / aflojar la confirmación previa.** Queda destrabado, pero es otro PR.
- **Anular una dispensación.** Es la entrada hermana de `TODOS.md`, con comprobante y numeración
  de por medio.
