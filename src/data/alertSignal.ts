import { useEffect, useState } from 'react'

/* Señal común de "lo que archiva alertas cambió": los descartes (0070) y las desviaciones
   documentadas (0131).

   Sin react-query no hay caché compartida: la campana, el resumen de Inicio y la vista de
   Pendientes tienen cada uno SU propia consulta. Si una pantalla refetchea sola después de
   archivar, la campana se queda con el número viejo — exactamente la incoherencia que este
   módulo existe para evitar (y que se vio en el QA: la lista bajó a 21 y el badge seguía en 22).

   Alcanza con volver a leer lo ARCHIVADO: descartar o documentar no cambia las alertas en sí,
   sólo cuáles están archivadas. Así que un contador que dispara esas consultas en todas las
   instancias montadas deja a los tres contando lo mismo, sin tocar nada más.

   VIVE EN SU PROPIO ARCHIVO DESDE LA 0131. Nació privada dentro de `alertDismissals.ts`, y las
   desviaciones necesitan LA MISMA señal, no una gemela: con dos contadores, documentar una
   desviación relee las desviaciones y deja los descartes —y la campana— con el número viejo, que
   es el mismo bug de siempre por la puerta de al lado. */
let version = 0
const subs = new Set<(v: number) => void>()

/** Avisa a todas las instancias montadas que tienen que releer lo archivado. */
export function bumpAlertArchives(): void {
  version += 1
  for (const notify of subs) notify(version)
}

export function useAlertArchivesVersion(): number {
  const [v, setV] = useState(version)
  useEffect(() => {
    const notify = (next: number) => setV(next)
    subs.add(notify)
    // Al montar puede haber perdido bumps previos (la campana vive siempre, pero una vista recién
    // montada no): sincronizamos con el valor actual.
    setV(version)
    return () => { subs.delete(notify) }
  }, [])
  return v
}
