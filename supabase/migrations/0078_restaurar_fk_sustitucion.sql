-- 0078 · Restaurar la FK de sustitución, ahora que el front desambigua el embed
-- ============================================================================
-- ⚠️ APLICAR SOLO DESPUÉS DE DESPLEGAR EL FRONT QUE TRAE `medications!medication_id`.
--    Aplicarla antes vuelve a tirar el tablero de Farmacia. Ver por qué abajo.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ QUÉ PASÓ EL 2026-08-13, PARA QUE NO VUELVA A PASAR                        │
-- │                                                                           │
-- │ La 0076 agregó `substituted_from_medication_id uuid references            │
-- │ medications(id)`. Se declaró "aditiva y no breaking" porque no tocaba     │
-- │ ninguna columna ni función existente. ERA FALSO, y por un motivo que no   │
-- │ tiene que ver con las columnas sino con PostgREST:                        │
-- │                                                                           │
-- │   dispensation_request_items pasó a tener DOS claves foráneas a           │
-- │   medications, y el embed `medication:medications(...)` —que el front     │
-- │   YA DESPLEGADO venía pidiendo— quedó AMBIGUO.                            │
-- │                                                                           │
-- │ PostgREST responde 300 / PGRST201 y voltea la consulta ENTERA, no solo    │
-- │ el embed. El tablero de Farmacia quedó en "No pudimos cargar el tablero"  │
-- │ apenas se aplicó la migración, sin que ninguna columna vieja cambiara.    │
-- │                                                                           │
-- │ Se restauró en el momento dropeando la constraint (una sola sentencia,    │
-- │ sin deploy), y esta migración la repone una vez que el front sabe pedir   │
-- │ el embed desambiguado.                                                    │
-- │                                                                           │
-- │ LA LECCIÓN, que vale para toda migración futura:                          │
-- │   Agregar una FK a una tabla que YA está embebida en algún select del     │
-- │   front ES BREAKING, aunque sea puramente aditiva en el schema. La regla  │
-- │   de CLAUDE.md §3 ("front primero cuando la base empieza a emitir algo    │
-- │   que el código viejo no entiende") aplica de lleno: acá la base empezó a │
-- │   ofrecer DOS caminos donde antes había uno, y el código viejo no sabe    │
-- │   elegir. Antes de agregar una FK, buscar la tabla en los `select(...)`   │
-- │   del front; si aparece embebida, el front va primero.                    │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Por qué reponerla en vez de dejar la columna suelta: es una referencia a una
-- fila real de `medications` y sin la FK nada impide que quede apuntando a un
-- medicamento borrado. El grafo de borrado del catálogo es casi todo `restrict`
-- (0019), pero justo el medicamento SUSTITUIDO deja de estar referenciado por
-- `medication_id` —ese renglón ahora apunta al nuevo— así que sin esta FK
-- volvería a ser borrable y el rastro de la sustitución quedaría colgado.

alter table public.dispensation_request_items
  drop constraint if exists dispensation_request_items_substituted_from_medication_id_fkey;

alter table public.dispensation_request_items
  add constraint dispensation_request_items_substituted_from_medication_id_fkey
  foreign key (substituted_from_medication_id)
  references public.medications(id)
  on delete restrict;

comment on column public.dispensation_request_items.substituted_from_medication_id is
  'Qué medicamento se había pedido antes de sustituir (0076). NULL = el renglón es el original. OJO: esta FK hace que dispensation_request_items tenga DOS relaciones con medications, así que TODO embed de medications sobre esta tabla debe desambiguar (`medications!medication_id`). Ver 0078.';
