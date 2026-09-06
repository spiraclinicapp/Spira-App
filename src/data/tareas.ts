import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import type { PostgrestError } from '@supabase/supabase-js'

/* ============================================================================
   Tareas — la capa de datos de `Inicio › Tareas` (migraciones 0108 y 0109).

   TODA ESCRITURA VA POR RPC, sin excepción, y no por prolijidad: las tablas sólo tienen
   `grant select`. Cada escritura tiene una regla que una policy no expresa bien — crear toca dos
   tablas y tiene que ser atómico, y editar depende de la CANTIDAD de asignados. Con las reglas en
   el servidor hay un solo lugar donde leerlas y ninguno donde saltearlas.

   LA LECTURA NO FILTRA POR USUARIO, y eso es correcto: la RLS de la 0108 ya devuelve únicamente
   las tareas donde sos autor o asignado. Agregar un `.eq('created_by', …)` acá sería más estrecho
   que la regla real y escondería las que te asignaron.
   ========================================================================== */

/** Fila de `task_assignees` (0108). Una por persona asignada. */
export interface TaskAssigneeRow {
  task_id: string
  user_id: string
  /** Snapshot: la RLS de `users` sólo deja ver la fila propia, así que un join daría null. */
  user_name: string
  /** Cuándo cerró SU parte. Sólo se usa con `completion_mode = 'cada_uno'`. */
  completed_at: string | null
}

/** Cómo se cierra una tarea, elegido al crearla (0108). */
export type CompletionMode = 'cualquiera' | 'cada_uno'

/** Fila de `tasks` (0108) con sus asignados embebidos. */
export interface TaskRow {
  id: string
  title: string
  detail: string | null
  /** `YYYY-MM-DD`. Null = sin fecha; es una tarea válida ("cuando pueda"). */
  due_date: string | null
  estimated_minutes: number | null
  completion_mode: CompletionMode
  /** El "hecha" de `cualquiera`. En `cada_uno` es null y el hecho vive en cada asignado. */
  completed_at: string | null
  completed_by: string | null
  patient_id: string | null
  visit_id: string | null
  protocol_id: string | null
  created_by: string
  created_by_name: string
  created_at: string
  updated_at: string | null
  /** Embed de `task_assignees`. Nunca vacío: los RPC no dejan crear una tarea sin asignados. */
  task_assignees: TaskAssigneeRow[]
}

/** Fila de `v_team_roster` (0109): el padrón mínimo para el selector de "asignar a". */
export interface RosterRow {
  id: string
  full_name: string
  puesto: string | null
}

/**
 * Traduce los errores de LECTURA. El caso que hace falta de verdad es el de la migración sin
 * aplicar: sin esto, `useSupabaseQuery` muestra el `message` crudo de PostgREST —en inglés y
 * nombrando tablas del schema— en la cara de quien abre la pantalla.
 */
function tareasReadErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01') {
    return 'Falta aplicar una actualización del sistema para ver tus tareas. Avisale al administrador.'
  }
  if (code === '42501') return 'No tenés permiso para ver estas tareas.'
  return 'No pudimos traer tus tareas. Probá de nuevo en un momento.'
}

/**
 * Mis tareas: las que creé y las que me asignaron. **La RLS decide cuáles son** (0108).
 *
 * ORDEN: primero las que tienen fecha, de la más próxima a la más lejana, y al final las que no
 * tienen — `nullsFirst: false` es lo que las manda abajo. Una tarea sin fecha no es más urgente
 * que una que vence mañana, y con el default de Postgres (nulls last en asc) igual quedarían al
 * final; se escribe explícito porque de esto depende el orden de la pantalla y no conviene que
 * dependa de un default que nadie ve.
 *
 * TRAE LAS HECHAS TAMBIÉN. La pantalla las separa y las muestra plegadas: filtrarlas acá haría
 * imposible deshacer un tilde equivocado, que es el error más común de una lista de pendientes.
 */
export function useMyTasks(): QueryResult<TaskRow[]> {
  return useSupabaseQuery<TaskRow[]>(
    (c) =>
      c
        .from('tasks')
        .select('*, task_assignees(*)')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .returns<TaskRow[]>(),
    [],
    tareasReadErrorMessage,
  )
}

/**
 * El padrón para el selector de "asignar a" (0109).
 *
 * NO se usa `v_team_access`: está cerrada a gerencia por RLS y devuelve una sola fila —la propia—
 * para todos los demás, en silencio. Con esa fuente, el selector mostraría una única persona y
 * asignarle a otro sería imposible sin ningún error que lo explicara.
 */
export function useTeamRoster(): QueryResult<RosterRow[]> {
  return useSupabaseQuery<RosterRow[]>(
    (c) =>
      c
        .from('v_team_roster')
        .select('id, full_name, puesto')
        .order('full_name', { ascending: true })
        .returns<RosterRow[]>(),
    [],
    tareasReadErrorMessage,
  )
}

/**
 * Traduce los errores de ESCRITURA a un texto sereno en castellano.
 *
 * Los `42501` de estos RPC ya vienen redactados desde el servidor y en castellano ("Sólo podés
 * marcarla como hecha: esta tarea te la asignó otra persona"), así que se pasan tal cual: el
 * mensaje del servidor sabe CUÁL de las tres reglas se rompió y acá no. Reescribirlos con un
 * genérico sería perder el único dato útil.
 */
function tareasWriteErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01') {
    return 'Falta aplicar una actualización del sistema. Avisale al administrador.'
  }
  if (code === '42501' || code === '23502' || code === '23503' || code === '22023') {
    return e.message || 'No se pudo guardar la tarea.'
  }
  if (code === '23514') return 'Falta completar algún dato de la tarea.'
  return 'No pudimos guardar la tarea. Probá de nuevo.'
}

/** Lo que el modal de alta necesita mandar. Todo opcional salvo el título. */
export interface NuevaTarea {
  title: string
  /** Vacío = para mí. El RPC se encarga (no hay que elegirse a uno mismo en una lista). */
  assignees?: string[]
  completionMode?: CompletionMode
  detail?: string | null
  dueDate?: string | null
  estimatedMinutes?: number | null
  patientId?: string | null
  visitId?: string | null
  protocolId?: string | null
  /** `true` = una tarea INDEPENDIENTE por persona, en vez de una grupal. */
  replicar?: boolean
}

/** Crea una tarea (o N, con `replicar`). Devuelve los ids creados. */
export async function createTask(t: NuevaTarea): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await supabase.rpc('create_task', {
    p_title: t.title,
    p_assignees: t.assignees?.length ? t.assignees : null,
    p_completion_mode: t.completionMode ?? 'cada_uno',
    p_detail: t.detail ?? null,
    p_due_date: t.dueDate ?? null,
    p_estimated_minutes: t.estimatedMinutes ?? null,
    p_patient_id: t.patientId ?? null,
    p_visit_id: t.visitId ?? null,
    p_protocol_id: t.protocolId ?? null,
    p_replicar: t.replicar ?? false,
  })
  if (error) return { ids: [], error: tareasWriteErrorMessage(error) }
  return { ids: (data as string[] | null) ?? [], error: null }
}

/**
 * Marca hecha (o deshace). **Qué toca depende del modo**, y lo resuelve el servidor: en
 * `cualquiera` cierra la tarea; en `cada_uno`, sólo TU parte. Acá no se decide nada.
 */
export async function setTaskDone(taskId: string, done = true): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_task_done', { p_task_id: taskId, p_done: done })
  return { error: error ? tareasWriteErrorMessage(error) : null }
}

/** Lo que se puede editar. `limpiar` es cómo se BORRA un dato opcional que ya estaba. */
export interface EdicionDeTarea {
  title?: string
  detail?: string | null
  dueDate?: string | null
  estimatedMinutes?: number | null
  /** Reemplaza la lista entera. Sólo el autor puede. */
  assignees?: string[]
  /** Columnas a poner en null: `'detail'`, `'due_date'`, `'estimated_minutes'`. */
  limpiar?: string[]
}

/**
 * Edita una tarea. **La regla de quién puede vive en el RPC** (autor siempre; un asignado sólo si
 * la tarea es grupal): repetirla acá sería una segunda copia que se desincroniza, y la del
 * servidor es la que manda igual. El front la consulta con `puedeEditar` sólo para no OFRECER un
 * botón que va a rebotar — que no es lo mismo que decidir el permiso.
 */
export async function updateTask(taskId: string, e: EdicionDeTarea): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_task', {
    p_task_id: taskId,
    p_title: e.title ?? null,
    p_detail: e.detail ?? null,
    p_due_date: e.dueDate ?? null,
    p_estimated_minutes: e.estimatedMinutes ?? null,
    p_assignees: e.assignees ?? null,
    p_limpiar: e.limpiar ?? null,
  })
  return { error: error ? tareasWriteErrorMessage(error) : null }
}

/** Elimina una tarea. Sólo el autor; el `audit_log` guarda el delete con su `before`. */
export async function deleteTask(taskId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_task', { p_task_id: taskId })
  return { error: error ? tareasWriteErrorMessage(error) : null }
}
