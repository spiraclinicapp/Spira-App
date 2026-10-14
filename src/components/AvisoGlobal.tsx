import { useCallback, useEffect, useState } from 'react'
import { Toast } from './Toast'

/**
 * Un aviso al pie que NO depende de quién lo pidió: `avisar('Visita eliminada')` desde cualquier lado,
 * y `<AvisoGlobal />` —montado una sola vez en el shell— lo muestra.
 *
 * Existe por el botón de etapa (handoff `design_handoff_boton_etapa`): «Eliminar visita» desde el modal
 * de la visita cierra el modal, y un `Toast` montado adentro se iba con él antes de que se leyera. Lo
 * mismo pasa con cualquier aviso cuya pantalla se desmonta por la acción que confirma. Los toasts que
 * viven en una vista y confirman algo de esa vista (Farmacia) siguen siendo locales.
 *
 * Un solo aviso a la vez: el nuevo reemplaza al anterior, que es lo que se espera de un «listo».
 */
type Oyente = (mensaje: string) => void
const oyentes = new Set<Oyente>()

export function avisar(mensaje: string): void {
  for (const o of oyentes) o(mensaje)
}

export function AvisoGlobal() {
  /* La cuenta (`n`) hace que el mismo texto dos veces seguidas reinicie el aviso: si no, el segundo
     «ID copiado» no cambiaría nada y el toast se iría con el tiempo del primero. */
  const [aviso, setAviso] = useState<{ mensaje: string; n: number } | null>(null)
  useEffect(() => {
    const oyente: Oyente = (mensaje) => setAviso((a) => ({ mensaje, n: (a?.n ?? 0) + 1 }))
    oyentes.add(oyente)
    return () => { oyentes.delete(oyente) }
  }, [])
  /* Estable a propósito: `Toast` reinicia su temporizador cada vez que cambia `onDone`, y con uno nuevo
     en cada render del shell el aviso no vencería nunca. */
  const cerrar = useCallback(() => setAviso(null), [])
  if (!aviso) return null
  return <Toast key={aviso.n} message={aviso.mensaje} onDone={cerrar} />
}
