import { INACTIVIDAD } from './idle'

/**
 * POR QUÉ te quedaste sin sesión, y qué se te dice al respecto.
 *
 * Hasta ahora toda pérdida de sesión era igual de muda: la app volvía al login sin una palabra, y
 * quien la usa no tiene forma de distinguir "cerré yo" de "se cayó sola" de "me sacaron". Acá vive
 * esa distinción, y el criterio de honestidad que la gobierna: **si no sabemos por qué se cerró, no
 * inventamos una causa**. Sólo afirmamos "inactividad" cuando la cerramos nosotros por inactividad.
 */

export type MotivoSalida =
  /** Apretó "Cerrar sesión". No hay nada que explicarle. */
  | 'usuario'
  /** La cerró el guardián de inactividad (ver `idle.ts` y `shell/IdleGuard.tsx`). */
  | 'inactividad'
  /** Se cayó sola y nadie la pidió: venció el token, falló el refresco, la revocaron desde otro
   *  lado. Es el DEFAULT — todo lo que no declaramos nosotros entra por acá. */
  | 'expirada'

/** Un aviso para el login. El tono decide el color: el sereno es el default de estos mensajes. */
export interface AvisoAuth {
  text: string
  /** `aviso` = tinte primario, no hiciste nada mal · `error` = rojo, algo salió mal de verdad. */
  tone: 'aviso' | 'error'
}

/** Los minutos del copy salen del umbral real, no escritos a mano: si mañana el cierre pasa a 20,
 *  el texto no puede quedar afirmando 30. Es un dato clínico-operativo, no una decoración. */
const MINUTOS_CIERRE = Math.round(INACTIVIDAD.cierreMs / 60_000)

/**
 * Qué se muestra en el login según por qué se salió. `null` = no se muestra nada.
 *
 * Los dos textos son serenos y en segunda persona, y ninguno culpa al usuario: que se venza una
 * sesión no es un error suyo, es el sistema cuidando una máquina compartida.
 */
export function avisoDeSalida(motivo: MotivoSalida): AvisoAuth | null {
  switch (motivo) {
    case 'usuario':
      // Cerró sesión a propósito: repetírselo sería ruido.
      return null
    case 'inactividad':
      return {
        text: `Cerramos tu sesión después de ${MINUTOS_CIERRE} minutos sin actividad. Volvé a ingresar para continuar.`,
        tone: 'aviso',
      }
    case 'expirada':
      return {
        text: 'Tu sesión se cerró por seguridad. Volvé a ingresar para continuar.',
        tone: 'aviso',
      }
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   LA INTENCIÓN DECLARADA

   Vive en una variable de MÓDULO y no en estado de React porque tiene que estar puesta ANTES de
   llamar a `supabase.auth.signOut()`: el evento `SIGNED_OUT` llega por el callback de auth-js, que
   no ve ningún `useState` de nadie y puede dispararse en el mismo tick. Un `setState` previo todavía
   no habría llegado.

   Se CONSUME al leerse. Si quedara pegada, el próximo cierre involuntario —el de mañana, cuando la
   máquina duerma— heredaría el motivo del logout de hoy y afirmaría una causa falsa.
   ───────────────────────────────────────────────────────────────────────────── */

let intencion: MotivoSalida | null = null

/** Declara por qué se va a cerrar la sesión. Llamalo JUSTO antes de cerrarla. */
export function declararSalida(motivo: MotivoSalida): void {
  intencion = motivo
}

/** Consume la intención. Sin ninguna declarada, la salida no la pidió nadie: `expirada`. */
export function tomarMotivoDeSalida(): MotivoSalida {
  const motivo = intencion ?? 'expirada'
  intencion = null
  return motivo
}
