/**
 * Reglas puras del perfil propio ("Mi cuenta"). Sin React y sin Supabase, para poder testearlas:
 * son de las que fallan EN SILENCIO —un signo invertido no se ve mal en pantalla, deja el campo
 * bloqueado para siempre o abierto para siempre, y las dos cosas parecen normales—.
 *
 * El guard DURO de estas reglas vive en la base (RPCs `update_my_name` / `stamp_email_change` de la
 * migración 0045, que hacen `raise` desde el servidor). Lo de acá es la cara visible: bloquear el
 * input y decir desde cuándo se puede de nuevo, para que el usuario no descubra la regla chocándose
 * con un error.
 */

/** Ventana de la regla "un cambio cada 30 días". En un solo lugar: la UI y el copy salen de acá. */
export const DIAS_ENTRE_CAMBIOS = 30

const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Momento en que un campo bloqueado por la regla de 30 días vuelve a estar disponible.
 *
 * `null` significa "se puede cambiar ahora" — y cubre los dos casos en que eso es cierto: nunca se
 * cambió (`iso` nulo) y ya pasaron los 30 días. `now` se inyecta para poder testear ambos bordes sin
 * depender del reloj de quien corre los tests.
 *
 * Una fecha ilegible se trata como "se puede": ante un dato corrupto, preferimos dejar al usuario
 * editar su propio nombre antes que bloquearlo con una fecha `Invalid Date` que nunca vence — la
 * comparación contra `NaN` da siempre false y el campo quedaría abierto igual, pero por accidente.
 * Acá es una decisión, no una casualidad.
 */
export function unlockDate(iso: string | null, now: number = Date.now()): Date | null {
  if (!iso) return null
  const ultimo = new Date(iso).getTime()
  if (!Number.isFinite(ultimo)) return null
  const proximo = ultimo + DIAS_ENTRE_CAMBIOS * MS_POR_DIA
  return proximo > now ? new Date(proximo) : null
}

/**
 * Lo mismo que `unlockDate`, ya formateado para la pantalla (`dd/mm/aaaa`), o `null` si el campo
 * está disponible. Es lo que consume el formulario de "Mi cuenta".
 */
export function lockedUntil(iso: string | null, now: number = Date.now()): string | null {
  return unlockDate(iso, now)?.toLocaleDateString('es-AR') ?? null
}
