import { buildUrl, homeUrl, parseHref } from './router'
import type { UrlState } from './router'

/**
 * El rastro que una sesión caída deja en la pestaña: **adónde volver** y **que hubo alguien acá**.
 *
 * Existe por la regla que el logout voluntario ya cumple (ver el comentario de `onLogout` en
 * `shell/UserMenu.tsx`): en una máquina compartida de clínica, la barra de direcciones no puede
 * quedar mostrando el protocolo y el IVRS del paciente que miraba el anterior. Pero borrarla a secas
 * rompería algo que hoy funciona: un link profundo compartido por WhatsApp, que sobrevive el login
 * porque la URL se queda quieta mientras ingresás. Así que en vez de perder el destino, lo guardamos
 * acá y lo reponemos del otro lado.
 *
 * Va en `sessionStorage` —el mismo lugar donde vive la sesión de Supabase, ver `lib/supabase.ts`— y
 * eso es deliberado: sobrevive un F5, muere al cerrar el navegador. El rastro no puede durar más que
 * la sesión que lo dejó.
 */

const CLAVE_DESTINO = 'spira:regreso'
const CLAVE_SESION = 'spira:hubo-sesion'

export interface RegresoStore {
  /** Deja constancia de que en esta pestaña hay (o hubo) una sesión viva. */
  marcarSesion(): void
  /**
   * ¿Hubo una sesión en esta pestaña? Es lo que permite distinguir, al abrir la app SIN sesión,
   * entre "recién llegás" y "se te cayó mientras no mirabas" — sin esto, un F5 sobre una sesión ya
   * vencida saludaría con el login mudo de siempre, que es justo el problema a resolver.
   */
  huboSesion(): boolean
  /** Guarda adónde volver. Ignora la raíz (no hay nada que reponer) y las rutas que no parsean. */
  guardarDestino(href: string): void
  /** Devuelve el destino y lo BORRA. Consumirlo una sola vez es lo que evita el teletransporte
   *  fantasma: un destino viejo que sobreviva te muda de pantalla en un ingreso posterior. */
  tomarDestino(): UrlState | null
  /** Borra todo el rastro. Es lo que hace la salida voluntaria: apretaste "Cerrar sesión", no hay
   *  nada que reponerte, y el que venga después no tiene por qué heredar tu última pantalla. */
  limpiar(): void
}

/**
 * `storage` puede ser `null` (en los tests no hay DOM) y CUALQUIER acceso puede lanzar: el modo
 * privado de Safari y las políticas de cookies de terceros tiran `SecurityError` con sólo tocar
 * `sessionStorage`. Nada de esto puede impedir que alguien entre a la app, así que todo va envuelto
 * y el peor caso es perder la comodidad de volver a la pantalla donde estabas.
 */
export function crearRegresoStore(storage: Storage | null): RegresoStore {
  const leer = (clave: string): string | null => {
    try {
      return storage?.getItem(clave) ?? null
    } catch {
      return null
    }
  }
  const escribir = (clave: string, valor: string): void => {
    try {
      storage?.setItem(clave, valor)
    } catch {
      /* sin rastro, la app funciona igual */
    }
  }
  const borrar = (clave: string): void => {
    try {
      storage?.removeItem(clave)
    } catch {
      /* ídem */
    }
  }

  return {
    marcarSesion: () => escribir(CLAVE_SESION, '1'),
    huboSesion: () => leer(CLAVE_SESION) === '1',

    guardarDestino: (href) => {
      const estado = parseHref(href)
      // Una ruta que no parsea no es un destino: reponerla sería mandar a alguien a la pantalla de
      // "esa dirección no existe" como premio por volver a ingresar.
      if (!estado) return
      // La raíz no se guarda: es adónde se cae por default, no hay nada que reponer.
      if (buildUrl(estado) === homeUrl()) return
      escribir(CLAVE_DESTINO, buildUrl(estado))
    },

    tomarDestino: () => {
      const crudo = leer(CLAVE_DESTINO)
      // Se borra SIEMPRE, incluso si no parsea: un destino que no se puede usar tampoco puede
      // quedar esperando en el próximo ingreso.
      borrar(CLAVE_DESTINO)
      return crudo ? parseHref(crudo) : null
    },

    limpiar: () => {
      borrar(CLAVE_DESTINO)
      borrar(CLAVE_SESION)
    },
  }
}

/** La instancia de la app. En node (los tests) no hay `window`: el store queda inerte. */
export const regreso: RegresoStore = crearRegresoStore(
  typeof window === 'undefined' ? null : window.sessionStorage,
)
