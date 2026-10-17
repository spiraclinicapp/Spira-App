-- ============================================================================
-- 0162 · Coordinación lee quién coordina el estudio (list_protocol_coordinators)
--
-- ── EL PROBLEMA (visto en prod el 2026-10-16) ──
-- Al querer poner a Lautaro Molina como coordinador de una visita de LTS17231, el selector salía
-- vacío aunque él está asignado al estudio. list_protocol_coordinators nació en la 0038 para la
-- recepción de IP y sólo autoriza a Farmacia y gerencia. Track la empezó a usar después en dos lugares,
-- por useProtocolCoordinators:
--   · el selector de coordinador del encabezado de la visita (CoordinatorChip, set_visit_coordinator),
--   · «¿Quién la atendió?» de «Vino otro día» (registrar_visita_en_otra_fecha, 0158-0160).
-- Quien trabaja en Coordinación sin Farmacia ni gerencia recibe 42501 «Sin permiso». El selector le
-- ofrece sólo «— Sin asignar —» y «Vino otro día» le dice «No se pudo leer quién coordina el estudio».
-- A gerencia no le pasa, y por eso no se vio antes: casi todas las pruebas se hicieron con esa cuenta.
--
-- ── EL CRITERIO: quien VE el estudio ve quién lo coordina ──
-- La guarda nueva repite, cláusula por cláusula, la policy "ver protocolos asignados" sobre
-- public.protocols (viva: 0146), menos contable, que nunca usó este RPC:
--   · gerencia                                         → has_module('gerencia')
--   · quien coordina el estudio, con cualquier nivel   → is_assigned_coordinator(p_protocol_id)
--   · Coordinación de líder para arriba                → has_min_role('track', 'leader')
--     (la policy dice has_role leader OR has_min_role admin, que es lo mismo: admin > leader)
--   · Farmacia, dentro de su alcance                   → has_module('pharma') and pharma_alcanza_protocolo
-- Por qué ésa y no otra:
--   · Cubre a todos los que pueden ESCRIBIR con la lista. set_visit_coordinator (0065) deja a gerencia, a
--     Coordinación admin en cualquier estudio y a un operador que lo coordina. registrar_visita_en_otra_fecha
--     (0160) deja a gerencia y a un operador que lo coordina. Las tres caben en la guarda.
--   · No abre nada que no estuviera abierto. Líderes y admins ya ven todos los estudios (0028, 0139) y los
--     líderes ya leen protocol_coordinators de cualquier estudio por RLS ("ver asignaciones", 0006). Los
--     nombres ya son de todo autenticado por v_team_roster (0109). Lo único que agrega este RPC es juntar
--     las dos cosas, y lo hace sólo para quien ya ve el estudio.
--   · Un coordinador viewer del estudio también lee: ya ve sus visitas, con el coordinador de cada una
--     ("ver visitas de mis protocolos" pide pertenencia sin nivel). Escribir sigue pidiendo operador; eso
--     lo deciden las RPC que escriben, no ésta.
-- Por qué is_assigned_coordinator y no las funciones de pertenencia de la 0146: protocolos_que_coordino()
-- existe para que una POLICY pregunte una vez por consulta y no una vez por fila. Acá la guarda corre una
-- sola vez por llamada y es la misma que usan set_visit_coordinator y registrar_visita_en_otra_fecha.
--
-- ── LA GUARDA DE ALCANCE DE FARMACIA (0142) QUEDA, y ahora hace lo que decía su comentario ──
-- La 0142 decía «sólo corta a quien entra únicamente por Farmacia a un estudio fuera de su alcance», pero
-- el código cortaba a CUALQUIERA con Farmacia acotada, aunque entrara por Coordinación. Una persona con
-- los dos módulos que coordina un estudio fuera de su alcance de Farmacia recibía «No tenés acceso a este
-- estudio.» (en el banco, el perfil `mixta`). Ahora el alcance acota sólo el camino de Farmacia: quien
-- entra únicamente por Farmacia a un estudio fuera de su alcance sigue recibiendo ese mismo 42501, con el
-- mismo mensaje. pharma_alcanza_protocolo sigue en el cuerpo (scripts/check-alcance-farmacia.mjs lo exige).
--
-- ── DOS CAMBIOS DE PASO ──
--   · Sin sesión responde 'No autenticado', como set_visit_coordinator.
--   · Se le revoca a public y a anon. La 0038 sólo le daba permiso a authenticated, pero el permiso
--     implícito de public (y el que Supabase le da a anon por defecto en el schema) quedaba en pie. El
--     front la llama sólo con sesión.
--   El revoke es además lo que deja confirmar «aplicada» por la API sin sesión: antes de esta migración
--   un anon recibe 42501 «Sin permiso» (lo dice el cuerpo); después, 42501 «permission denied for
--   function list_protocol_coordinators» (lo dice Postgres, sin entrar al cuerpo). El código es el mismo;
--   lo que cambia es el mensaje.
--
-- Misma firma y mismo resultado: create or replace la reemplaza sin dejar sobrecargas.
--
-- ── ADITIVA Y NO BREAKING ──
-- Sólo amplía quién puede leer, salvo anon, que no la llama. El front desplegado ya la llama: con la
-- migración aplicada, el selector de coordinador y «Vino otro día» empiezan a andar para Coordinación sin
-- ningún deploy. Va ANTES del front que muestra el error de lectura en CoordinatorChip.
--
-- Probada en el banco PGlite (scripts/banco-rls/casos-0162.mjs): cada perfil antes y después de aplicarla
-- sobre los mismos datos.
--
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0161. IDEMPOTENTE. Con la
-- copia SIN COMENTARIOS (node scripts/sql-sin-comentarios.mjs). Registrar en supabase/README.md recién
-- con la sonda por la API sin sesión.
-- ============================================================================

create or replace function public.list_protocol_coordinators(p_protocol_id uuid)
returns table (id uuid, full_name text)
language plpgsql security definer set search_path = public stable as $fn$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  -- Quien ve el estudio ve quién lo coordina: las cláusulas de "ver protocolos asignados" (0146), menos
  -- contable. El alcance de Farmacia acota sólo el camino de Farmacia (0142).
  if not (
       public.has_module('gerencia')
    or public.is_assigned_coordinator(p_protocol_id)
    or public.has_min_role('track', 'leader')
    or (public.has_module('pharma') and public.pharma_alcanza_protocolo(p_protocol_id))
  ) then
    -- Quien tiene Farmacia y no llega por otro lado se quedó afuera por el alcance: el mensaje de la 0142.
    if public.has_module('pharma') then
      raise exception 'No tenés acceso a este estudio.' using errcode = '42501';
    end if;
    raise exception 'Sin permiso' using errcode = '42501';
  end if;

  return query
    select u.id, u.full_name
      from public.protocol_coordinators pc
      join public.users u on u.id = pc.user_id
     where pc.protocol_id = p_protocol_id and u.is_active
     order by u.full_name;
end;
$fn$;

revoke all on function public.list_protocol_coordinators(uuid) from public, anon;
grant execute on function public.list_protocol_coordinators(uuid) to authenticated;

comment on function public.list_protocol_coordinators(uuid) is
  'Coordinadores activos de un protocolo (id + nombre). Lo lee quien ve el estudio: gerencia, quien lo '
  'coordina, Coordinacion de lider para arriba y Farmacia dentro de su alcance. 0038, 0142, 0162.';

notify pgrst, 'reload schema';
