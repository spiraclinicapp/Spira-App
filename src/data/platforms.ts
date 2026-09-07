import { supabase } from '../lib/supabase'
import type { PostgrestError } from '@supabase/supabase-js'
import type { PlatformEntry } from '../views/track/procedimientos/reportes'

/* ============================================================================
   El catálogo de plataformas (`report_platforms`, migración 0111).

   Los portales donde aparecen los reportes, con su URL. Hasta la 0111 esto vivía en DOS lugares
   —el check de la 0089 y un `Record` en `reportes.ts`— y las URLs en ninguno; ahora la tabla manda
   y se edita desde Ajustes › Plataformas.

   Lectura y escritura DIRECTAS (sin RPC): no hay ninguna regla que una policy no exprese bien, a
   diferencia de los accesos. La RLS de la 0111 decide sola — ver es amplio, editar pide track-leader
   o gerencia, porque cambiar la URL de Clario le cambia el link a todos los reportes de todos los
   estudios.
   ========================================================================== */

/** Fila de `report_platforms` (0111). Tipos a mano, como el resto de `data/`. */
export interface PlatformRow {
  key: string
  label: string
  /** `null` = todavía no cargada. Distinto de '' — ver el comentario de la columna en la 0111. */
  url: string | null
  color: string
  sort_order: number
  is_active: boolean
}

/** Traduce la fila de la base a lo que consume `reportes.ts`. */
export function aEntry(r: PlatformRow): PlatformEntry {
  return { key: r.key, label: r.label, color: r.color, url: r.url, activa: r.is_active }
}

const COLS = 'key, label, url, color, sort_order, is_active'

/**
 * Trae el catálogo entero, activas y retiradas.
 *
 * Las retiradas VIENEN A PROPÓSITO: un reporte histórico cargado con una plataforma que después se
 * dio de baja tiene que seguir mostrando su nombre. `platformList()` es quien filtra para el
 * desplegable; `platformMeta()` las resuelve igual.
 *
 * No es un hook: lo llama `PlatformsProvider` una sola vez y el resultado va a una variable de
 * módulo. Ver la nota del catálogo vivo en `reportes.ts`.
 */
export async function fetchPlatforms(): Promise<{ data: PlatformRow[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('report_platforms')
    .select(COLS)
    .order('sort_order', { ascending: true })
    .returns<PlatformRow[]>()
  if (error) return { data: null, error: leerErrorMessage(error) }
  return { data: data ?? [], error: null }
}

function leerErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST205' || code === '42P01') {
    // El caso real de esta migración: el front nuevo contra una base sin la 0111. No es una
    // pantalla rota — el catálogo de respaldo sigue funcionando, sólo que sin URLs.
    return 'Falta aplicar una actualización del sistema para configurar las plataformas. Avisale al administrador.'
  }
  if (code === '42501') return 'No tenés permiso para ver las plataformas.'
  return 'No pudimos traer las plataformas. Probá de nuevo en un momento.'
}

/**
 * Traduce los errores de ESCRITURA.
 *
 * `23505` merece su propio texto: es el índice único sobre el nombre en minúsculas, o sea alguien
 * cargando una plataforma que ya existe escrita distinto ("clario" vs "Clario"). El mensaje crudo
 * de Postgres nombra el índice y no ayuda a nadie.
 */
function escribirErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === '23505') return 'Ya hay una plataforma con ese nombre.'
  if (code === '23514') {
    // Los checks de la 0111: la clave, el nombre vacío y —el que se va a ver de verdad— la URL.
    return 'La dirección tiene que empezar con http:// o https://.'
  }
  if (code === '23503') return 'No se puede quitar: hay reportes que usan esta plataforma.'
  if (code === 'PGRST205' || code === '42P01') {
    return 'Falta aplicar una actualización del sistema para configurar las plataformas.'
  }
  if (code === '42501') return 'No tenés permiso para configurar las plataformas.'
  return 'No pudimos guardar el cambio. Probá de nuevo en un momento.'
}

export interface EditarPlataformaInput {
  key: string
  label: string
  /** '' se guarda como `null`: "sin cargar" y "cadena vacía" son el mismo hecho para el usuario, y
   *  el check de la 0111 rechazaría la cadena vacía. */
  url: string
  isActive: boolean
}

/**
 * Guarda los cambios de UNA plataforma.
 *
 * ⚠️ RLS FILTRA EN SILENCIO: un `update` sin permiso afecta CERO filas y no devuelve error. Por eso
 * el `.select('key')` y el chequeo de largo — sin eso, alguien sin nivel vería "guardado" y la URL
 * seguiría siendo la vieja. Mismo patrón que `updatePatient`.
 */
export async function editarPlataforma(
  input: EditarPlataformaInput,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('report_platforms')
    .update({
      label: input.label.trim(),
      url: input.url.trim() === '' ? null : input.url.trim(),
      is_active: input.isActive,
    })
    .eq('key', input.key)
    .select('key')
  if (error) return { error: escribirErrorMessage(error) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para configurar las plataformas.' }
  return { error: null }
}

/** Alta de una plataforma nueva. El color queda en el gris por defecto de la 0111: es identidad
 *  del proveedor y no configuración operativa, así que no se pide en el formulario. */
export async function crearPlataforma(
  key: string,
  label: string,
  url: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('report_platforms').insert({
    key,
    label: label.trim(),
    url: url.trim() === '' ? null : url.trim(),
    // Después de 'otro' (999) no, antes: 'otro' es la salida y se queda última.
    sort_order: 500,
  })
  return { error: error ? escribirErrorMessage(error) : null }
}
