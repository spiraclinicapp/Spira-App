-- ============================================================================
-- 0109 · El padrón mínimo del equipo, para poder asignar una tarea
--
-- Plan: docs/plan-tareas.md (pieza 5). Acompaña a la 0108 y sale aparte por una razón de
-- proceso, no de diseño: cuando apareció el hueco, la 0108 ya estaba en el repo — y en este
-- proyecto el SQL se aplica apenas se ve. Una migración ya aplicada no se edita, así que lo que
-- falta va en un archivo nuevo aunque conceptualmente sea parte de la anterior.
--
-- ── EL HUECO ──
-- La 0108 deja que cualquiera le asigne una tarea a cualquiera. Pero el front NO PUEDE ARMAR EL
-- SELECTOR: la única fuente de nombres del equipo es `v_team_access` (0096), que está cerrada a
-- gerencia — quien no lo es recibe ÚNICAMENTE SU PROPIA FILA, en silencio y por RLS. Con eso, el
-- desplegable de "asignar a" mostraría una sola persona (uno mismo) y la feature de asignar sería
-- inaccesible para todo el mundo salvo gerencia, sin ningún error que lo explicara.
--
-- ── LO QUE ESTA VISTA EXPONE, Y LO QUE NO ──
-- Nombre, puesto e id de las cuentas ACTIVAS. Nada más: ni correo, ni accesos, ni fecha de alta,
-- ni el estado de la cuenta. Es una ampliación de privacidad real y acotada a propósito — para
-- asignarle trabajo a alguien hay que poder nombrarlo, y en un centro de diez personas saber
-- quién trabaja ahí no es un dato reservado. Lo que sí sigue cerrado a gerencia es el correo y,
-- sobre todo, QUIÉN TIENE ACCESO A QUÉ, que es lo sensible de `v_team_access`.
--
-- SÓLO LAS ACTIVAS: el padrón existe para elegir a quién asignarle algo, y una cuenta dada de baja
-- no puede recibir trabajo. Las tareas ya asignadas a alguien que después se da de baja no se
-- rompen — `task_assignees.user_name` es un snapshot y se sigue leyendo.
--
-- ADITIVA y NO BREAKING: una vista nueva, no toca nada. Va ANTES del front.
-- APLICAR: a mano en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0108. IDEMPOTENTE.
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================

-- `security_invoker = false` (el default) A PROPÓSITO, y es la única vista de la app que lo hace
-- de manera deliberada: con invoker heredaría la policy de `public.users` —"tu fila o gerencia"—
-- y devolvería exactamente el problema que viene a resolver. Corre como dueña y expone un
-- conjunto de columnas CERRADO Y MÍNIMO, que es lo que hace seguro el salteo: el riesgo de un
-- definer no es saltear la RLS, es saltearla mostrando de más.
create or replace view public.v_team_roster as
select u.id, u.full_name, u.puesto
  from public.users u
 where u.is_active;

comment on view public.v_team_roster is
  'Padrón mínimo (id, nombre, puesto) de las cuentas activas, legible por cualquier autenticado: '
  'sin esto nadie salvo gerencia puede armar el selector de "asignar a" (v_team_access está '
  'cerrada por RLS). NO expone correo ni accesos, que es lo sensible. 0109.';

revoke all on public.v_team_roster from anon;
grant select on public.v_team_roster to authenticated;
