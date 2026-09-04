import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useAuth } from '../../lib/auth'
import { usePrefs } from '../../lib/prefs'
import type { DateFormat, HomeView } from '../../lib/prefs'
import { modulosElegibles } from '../../lib/home'
import type { ThemePref } from '../../lib/theme'
import { MODULES } from '../../modules/registry'
import { StCard, StRow, StSeg } from './primitives'

/* ============================================================================
   Preferencias. Los TRES controles están vivos y se guardan en la cuenta
   (tabla `user_preferences`, migración 0093).

   Eran seis y cinco no hacían nada: el tema funcionaba y Densidad, Idioma, Formato de fecha, Zona
   horaria y Página de inicio eran `useState` que se evaporaban al cerrar el modal. De esos cinco,
   dos se cablearon de verdad (formato de fecha y página de inicio) y tres se sacaron porque no eran
   preferencias sino proyectos —Idioma es traducir la app entera, Densidad es tokenizar el espaciado
   de todas las pantallas, y Zona horaria cambia qué día es "hoy" en la Agenda, que en un sistema
   clínico auditable no es cosmético—. Los tres quedaron escritos en TODOS.md con su porqué.

   No queda ningún control que prometa algo que no pasa, así que tampoco queda banner de "vista
   previa": la sección dejó de ser una maqueta.
   ============================================================================ */

export function PrefsSection() {
  const { prefs, savePrefs, soloLocal } = usePrefs()
  const { modules } = useAuth()
  const [error, setError] = useState<string | null>(null)

  /* La pantalla de inicio se elige entre los módulos que ESTA persona puede abrir: ofrecerle
     Farmacia a quien no la tiene sería prometerle una puerta cerrada, igual que los candados que
     el riel dejó de mostrar. La regla es la misma que usa el riel (`lib/home.ts`), no una copia.
     "El último" va al final y aparte: no es un módulo sino una regla, y describe el ARRANQUE — el
     logo no la sigue (ver `resolveHome`). */
  const opcionesInicio = useMemo(
    () => [
      ...modulosElegibles(modules, MODULES).map((m) => ({ v: m.key as HomeView, l: m.name })),
      { v: 'ultimo' as HomeView, l: 'El último' },
    ],
    [modules],
  )

  /* Si lo guardado ya no está entre las opciones —te revocaron ese módulo— el control marca Inicio,
     que es a donde la app te lleva de verdad (`resolveHome` degrada). Un radiogroup sin ninguna
     opción marcada diría que no elegiste nada, y no es cierto: elegiste algo que hoy no se abre. */
  const valorInicio: HomeView = opcionesInicio.some((o) => o.v === prefs.homeView) ? prefs.homeView : 'inicio'

  /* Guardado inmediato por control: cada preferencia es una escritura chiquita e independiente, así
     que no hay estado pendiente que un cierre distraído pueda tirar. Si la escritura falla, el
     provider revierte el control además de devolver el error — el control nunca queda mostrando
     algo que no se guardó. */
  const guardar = async (cambios: Parameters<typeof savePrefs>[0]) => {
    setError(null)
    const { error } = await savePrefs(cambios)
    if (error) setError(error)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      {/* La app funciona igual sin la 0093 aplicada (el provider cae a la máquina), pero decirlo es
          obligatorio: sin este aviso, la persona elegiría un tema creyendo que la va a seguir a otra
          computadora y descubriría que no, sin ninguna pista de por qué. */}
      {soloLocal && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#B0823F', background: '#B0823F16', border: '1px solid #B0823F33', borderRadius: 10, padding: '10px 14px' }}>
          <Icon name="clock" size={15} color="#B0823F" />
          <span>Tus preferencias se están guardando solo en esta computadora. Falta aplicar una actualización del sistema para que viajen con tu cuenta.</span>
        </div>
      )}

      {error && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', border: '1px solid rgba(166, 72, 59, 0.20)', borderRadius: 10, padding: '10px 14px' }}>
          <Icon name="alert" size={15} color="var(--spira-danger)" />
          {error}
        </div>
      )}

      <StCard title="Apariencia">
        <StRow label="Tema" sub="Claro, oscuro o según tu sistema" last>
          <StSeg
            label="Tema"
            value={prefs.theme}
            onChange={(theme: ThemePref) => void guardar({ theme })}
            options={[{ v: 'light', l: 'Claro' }, { v: 'dark', l: 'Oscuro' }, { v: 'system', l: 'Sistema' }]}
          />
        </StRow>
      </StCard>

      <StCard title="Regional">
        {/* El sub avisa la recarga porque va a pasar y sorprende: es preferible decirlo antes que
            explicarlo después. El motivo técnico está en `lib/prefs.tsx`. */}
        <StRow label="Formato de fecha" sub="Cómo se escriben las fechas en toda la app · al cambiarlo, la pantalla se actualiza" last>
          <StSeg
            label="Formato de fecha"
            value={prefs.dateFormat}
            onChange={(dateFormat: DateFormat) => void guardar({ dateFormat })}
            /* Las tres etiquetas SON el formato, escrito: no hace falta explicar ninguna, se ve.
               La tercera lleva el mes abreviado en letras, que es como se leen las fechas en las
               fuentes clínicas y evita la ambigüedad de si el primer número es el día o el mes. */
            options={[{ v: 'dmy', l: '31/12/2026' }, { v: 'iso', l: '2026-12-31' }, { v: 'dmesy', l: '31 Ago 2026' }]}
          />
        </StRow>
      </StCard>

      {/* Antes se llamaba "Al iniciar sesión", y desde que esta preferencia también gobierna el
          logo del top bar el rótulo se quedó corto: ya no es sólo el arranque. */}
      <StCard title="Inicio">
        <StRow label="Página de inicio" sub="Dónde abre Spira al entrar, y a dónde te lleva el logo" last>
          <StSeg
            label="Página de inicio"
            value={valorInicio}
            onChange={(homeView: HomeView) => void guardar({ homeView })}
            options={opcionesInicio}
          />
        </StRow>
      </StCard>
    </div>
  )
}
