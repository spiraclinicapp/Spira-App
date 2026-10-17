import { useSyncExternalStore } from 'react'
import type { AyudaApi } from './AyudaProvider'

/* ============================================================================
   El puente de la Ayuda hacia `Pistas` (T5b del plan de tutoriales).

   `Pistas` está montada en `App`, AFUERA de `AppShell`: también atiende los `title` del login, y moverla adentro
   cambiaría a quién cubre. Pero la tarjeta con el tutorial necesita lo que sabe la Ayuda (qué está publicado, de
   dónde se baja, qué se vio, cómo abrir el panel en un tutorial), y eso vive en `AppShell`. AppShell lo PUBLICA acá y
   `Pistas` lo lee: sin sesión (el login) no hay Ayuda, y todo `title` sale como pista de texto.
   ============================================================================ */

let actual: AyudaApi | null = null
const suscriptos = new Set<() => void>()

export function publicarAyuda(api: AyudaApi | null) {
  actual = api
  suscriptos.forEach((avisar) => avisar())
}

export function useAyudaPublicada(): AyudaApi | null {
  return useSyncExternalStore(
    (avisar) => { suscriptos.add(avisar); return () => { suscriptos.delete(avisar) } },
    () => actual,
  )
}
