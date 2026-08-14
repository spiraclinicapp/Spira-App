import { Fragment, useEffect, useLayoutEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { Vilano } from '../components/Vilano'
import { useTheme } from '../lib/theme'
import { useAuth } from '../lib/auth'
import { MODULES } from '../modules/registry'
import { resolveView } from '../views/registry'
import type { NavTarget, ReturnTo, ViewHeader, ViewHeaderCrumb } from '../views/types'
import { CommandPalette } from './CommandPalette'
import { UserMenu } from './UserMenu'
import { NotificationsMenu } from './NotificationsMenu'
import { AboutMenu } from './AboutMenu'
import { FeedbackModal } from './FeedbackModal'
import { SettingsModal } from './settings/SettingsModal'
import type { SettingsSection } from './settings/SettingsModal'

/** Atajo del buscador global, según plataforma. */
const KBD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '') ? '⌘ K' : 'Ctrl K'

/* Crumb del breadcrumb del encabezado. Color uniforme tipo breadcrumb (sin acento):
   el actual (sin onClick) en tinta; los padres clickeables en gris. Subraya al hover. */
function Crumb({ crumb }: { crumb: ViewHeaderCrumb }) {
  const color = crumb.onClick ? 'var(--spira-muted)' : 'var(--spira-ink)'
  if (!crumb.onClick) {
    return <span className={crumb.mono ? 'spira-mono' : undefined} style={{ color, fontWeight: 600 }}>{crumb.label}</span>
  }
  return (
    <button
      onClick={crumb.onClick}
      className={'spira-no-press' + (crumb.mono ? ' spira-mono' : '')}
      onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
      onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
      style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color, fontWeight: 600, fontSize: 'inherit', fontFamily: 'inherit' }}
    >
      {crumb.label}
    </button>
  )
}

/* Etiqueta del botón de acción según módulo/submódulo (voseo, sentence case). */
const ACTION_LABELS: Record<string, string> = {
  'track/resumen': 'Nueva visita',
  'track/protocolos': 'Nuevo protocolo',
  'track/agenda': 'Nueva visita',
  'pharma/dispensaciones': 'Nueva dispensación',
  'pharma/medicamentos': 'Agregar medicamento',
  'pharma/protocolos': 'Nuevo protocolo',
  'pharma/reportes': 'Generar reporte',
}

/* Vistas portadas que traen sus propias acciones contextuales (o son de solo
   lectura): para ellas se suprime el botón de acción genérico del shell. */
const HIDE_ACTION = new Set(['inicio/resumen', 'inicio/tareas', 'inicio/alertas', 'track/resumen', 'track/protocolos', 'track/visitas', 'track/para-ver-medico', 'track/agenda', 'track/alertas', 'pharma/protocolos', 'pharma/recepcion', 'pharma/medicamentos'])

const iconBtn: CSSProperties = {
  width: 38, height: 38, borderRadius: 10, border: 'none',
  background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center',
  color: 'var(--spira-ink)',
}

/* Pasaje de vuelta del encabezado. Sobrio y en gris: es una salida, no la acción de la pantalla —
   la acción principal ya tiene su botón a la derecha y esto no puede competirle. Hereda del repo
   la micro-interacción de pulsable (levante de 1px al apuntarlo), que acá sí corresponde porque
   es un botón y no un dato. Ancho acotado: el label lleva el nombre del paciente y no puede
   empujar la miga. */
const backChip: CSSProperties = {
  height: 30, maxWidth: 280, padding: '0 12px 0 10px', borderRadius: 999,
  border: '1px solid var(--spira-line)', background: 'var(--spira-white)',
  color: 'var(--spira-muted)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, flex: '0 0 auto', minWidth: 0,
}

/* Botones de acción del encabezado (acciones que registra la vista activa). */
const ghostActionBtn: CSSProperties = {
  height: 38, padding: '0 15px', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
}
function primaryActionBtn(accentSolid: string): CSSProperties {
  return {
    height: 38, padding: '0 15px', border: 'none', borderRadius: 10, background: accentSolid,
    color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
  }
}

export function AppShell() {
  const { pref, theme, setPref, toggle } = useTheme()
  const { modules: userModules } = useAuth()
  const [moduleKey, setModuleKey] = useState('inicio')
  const [subKey, setSubKey] = useState('resumen')
  /* Entidad concreta a abrir en la vista destino (ej. la ficha de un paciente desde el
     buscador global). La pone `navigate(..., target)`; la vista la consume y avisa para
     limpiarla (onTargetConsumed) así no se reabre sola en refetchs. */
  const [navTarget, setNavTarget] = useState<NavTarget | null>(null)
  /* Pasaje de vuelta que dejó quien navegó hasta acá (ver `ReturnTo` en views/types). Va APARTE
     de navTarget porque la vista destino consume y limpia aquel al llegar; el botón de volver
     tiene que sobrevivir a eso. Lo borra cualquier navegación MANUAL: si te fuiste por tu cuenta
     a otro lado, el camino de vuelta que te habían dejado ya no describe de dónde venís. */
  const [returnTo, setReturnTo] = useState<ReturnTo | null>(null)
  /* Encabezado contextual que registra la vista activa (breadcrumb + acciones). */
  const [viewHeader, setViewHeader] = useState<ViewHeader | null>(null)
  /* Buscador global (command palette). Se monta lazy: sus hooks de datos (con PII)
     corren solo cuando el palette está abierto. */
  const [paletteOpen, setPaletteOpen] = useState(false)
  /* Modal "Dar feedback" (se abre desde el popover Acerca de, al pie del rail). */
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  /* Ajustes (menú de usuario). null = cerrado; string = sección abierta. Es un
     overlay: NO toca moduleKey/subKey, así cerrar vuelve a donde estabas. */
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null)
  /* Navegación izquierda plegable completa (riel de módulos + panel de submódulos). Se
     togglea con el botón «Menú» del top bar. Preferencia global persistida en localStorage;
     se lee en el initializer para no parpadear al montar. */
  const [navHidden, setNavHidden] = useState<boolean>(() => {
    try { return localStorage.getItem('spira:nav:oculto') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('spira:nav:oculto', navHidden ? '1' : '0') } catch { /* storage no disponible */ }
  }, [navHidden])

  /* Al cambiar de módulo/submódulo, limpiar el encabezado contextual (que no quede
     pegado de otra vista). Es un LAYOUT effect a propósito: flushea antes que los
     efectos pasivos de las vistas hijas, así esta limpieza nunca pisa el header que
     una vista recién montada registra en su useEffect (la primera consumidora
     on-mount es RecepcionView). La navegación INTERNA de una vista no cambia subKey,
     así que la vista conserva el control de su encabezado mientras esté en su submódulo. */
  useLayoutEffect(() => { setViewHeader(null) }, [moduleKey, subKey])

  /* 'inicio' siempre disponible; el resto, según los roles reales del usuario.
     Los módulos `proximamente` quedan bloqueados para todos, tengan rol o no. */
  const isAllowed = (key: string) =>
    key === 'inicio' ||
    (!MODULES.find((m) => m.key === key)?.proximamente && (userModules as string[]).includes(key))

  const mod = MODULES.find((m) => m.key === moduleKey) ?? MODULES[0]
  const sub = mod.submodules.find((s) => s.key === subKey) ?? mod.submodules[0]
  const accent = mod.accent

  const selectModule = (key: string) => {
    const m = MODULES.find((x) => x.key === key)
    if (!m || !isAllowed(m.key)) return
    setSettingsSection(null) // navegar cierra Ajustes (era un overlay encima)
    setNavTarget(null) // navegación manual: sin objetivo pendiente
    setReturnTo(null)  // …ni camino de vuelta: te fuiste por tu cuenta
    setModuleKey(key)
    setSubKey(m.submodules[0].key)
  }

  /* Navegación programática desde una vista o el buscador (ej. "Ver agenda del protocolo"
     → track/agenda; o un resultado de paciente → track/protocolos + ficha). `target` abre
     una entidad concreta al llegar; `back` deja el pasaje de vuelta que el encabezado muestra.
     Sin `back` el pasaje se limpia: cada navegación programática declara su propio retorno o
     no tiene ninguno — heredar el de un salto anterior ofrecería volver a un lugar equivocado. */
  const navigate = (mKey: string, sKey: string, target?: NavTarget, back?: ReturnTo) => {
    const m = MODULES.find((x) => x.key === mKey)
    if (!m || !isAllowed(m.key) || !m.submodules.some((s) => s.key === sKey)) return
    setSettingsSection(null) // navegar cierra Ajustes
    setNavTarget(target ?? null)
    setReturnTo(back ?? null)
    setModuleKey(mKey)
    setSubKey(sKey)
  }

  /* Atajo global Ctrl/⌘ K: togglea el buscador. Al ABRIR no lo hace si hay un overlay
     modal abierto (aria-modal) — no queremos el palette encima de un formulario a medio
     llenar. Al cerrar (palette ya abierto) siempre permite. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen((open) => {
          if (open) return false
          if (document.querySelector('[aria-modal="true"]')) return false
          return true
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const action = ACTION_LABELS[`${moduleKey}/${sub.key}`] ?? 'Nuevo'
  const showAction = !HIDE_ACTION.has(`${moduleKey}/${sub.key}`)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--spira-paper)', color: 'var(--spira-ink)' }}>
      {/* ===== top bar unificado ===== */}
      <header
        style={{
          height: 60, flex: '0 0 60px', borderBottom: '1px solid var(--spira-line)',
          background: 'var(--spira-white)', display: 'flex', alignItems: 'center',
          padding: '0 18px 0 20px', gap: 14, position: 'relative', zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          {/* Menú: colapsa/expande la navegación izquierda (riel de módulos + panel de submódulos). */}
          <button
            onClick={() => setNavHidden((v) => !v)}
            aria-pressed={!navHidden}
            aria-label={navHidden ? 'Mostrar navegación' : 'Ocultar navegación'}
            title={navHidden ? 'Mostrar navegación' : 'Ocultar navegación'}
            className="spira-no-press spira-menu-toggle"
            style={{ ...iconBtn, background: 'var(--spira-surface)', color: navHidden ? accent : 'var(--spira-ink)' }}
          >
            <Icon name="menu" size={20} stroke={2} color="currentColor" />
          </button>

          {/* Logo = hub: vuelve al inicio de Spira (inicio/resumen). */}
          <button
            onClick={() => selectModule('inicio')}
            title="Ir al inicio de Spira"
            className="spira-no-press"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 11, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}
          >
            <Vilano size={30} />
            <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 21, letterSpacing: '-0.02em' }}>Spira</span>
          </button>
          <span style={{ width: 1, height: 26, background: 'var(--spira-line)', margin: '0 5px' }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: accent + '18', display: 'grid', placeItems: 'center' }}>
              <Icon name={mod.icon} size={15} color={accent} stroke={2} />
            </span>
            <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17 }}>{mod.name}</span>
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="spira-search-trigger"
            onClick={() => setPaletteOpen(true)}
            title={`Buscar en Spira (${KBD})`}
          >
            <Icon name="search" size={16} color="var(--spira-muted)" />
            <span className="spira-search-label">Buscar…</span>
            <span className="spira-search-kbd">{KBD}</span>
          </button>
          <button onClick={toggle} style={iconBtn} title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} color="var(--spira-ink)" />
          </button>
          <NotificationsMenu onNavigate={navigate} isAllowed={isAllowed} />

          <span style={{ width: 1, height: 26, background: 'var(--spira-line)', margin: '0 4px' }} />

          <UserMenu onOpenSettings={setSettingsSection} />
        </div>
      </header>

      {/* ===== cuerpo: riel + panel + contenido ===== */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* riel de módulos */}
        <aside
          className="spira-navcol"
          style={{
            width: navHidden ? 0 : 64,
            flex: '0 0 auto',
            minWidth: 0,
            // Expandido: overflow visible, para NO recortar el popover de «Acerca de» (se abre
            // hacia la derecha, fuera del ancho del riel). Plegado: hidden, para clipar el
            // contenido de 64px mientras el ancho anima a 0. El popover solo se abre expandido.
            overflow: navHidden ? 'hidden' : 'visible',
            background: 'var(--spira-white)',
            borderRight: navHidden ? 'none' : '1px solid var(--spira-line)',
          }}
        >
          {/* height:100% para que el `marginTop:auto` del AboutMenu lo empuje al pie del riel. */}
          <div style={{ width: 64, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 6 }}>
          {MODULES.map((m) => {
            const on = m.key === moduleKey
            const locked = !isAllowed(m.key)
            /* Módulo aún no construido: no se muestra qué es. El ícono del módulo va
               difuminado y casi transparente (ilegible a propósito) y encima un candado
               más grande. Da la señal de "hay más, pero cerrado" sin revelar el módulo. */
            if (m.proximamente) {
              return (
                <button
                  key={m.key}
                  disabled
                  title={`${m.full} · próximamente`}
                  className="spira-no-press"
                  style={{
                    width: 46, height: 46, borderRadius: 12, border: 'none', cursor: 'default',
                    background: 'transparent', display: 'grid', placeItems: 'center',
                    position: 'relative',
                  }}
                >
                  <Icon
                    name={m.icon}
                    size={22}
                    stroke={1.9}
                    color="var(--spira-faint)"
                    style={{ filter: 'blur(3.5px)', opacity: 0.3, position: 'absolute' }}
                  />
                  <Icon name="lock" size={24} stroke={2} color="var(--spira-faint)" style={{ position: 'relative' }} />
                </button>
              )
            }
            return (
              <button
                key={m.key}
                onClick={() => selectModule(m.key)}
                disabled={locked}
                title={locked ? `${m.full} · sin acceso` : m.full}
                style={{
                  width: 46, height: 46, borderRadius: 12, border: 'none',
                  cursor: locked ? 'default' : 'pointer',
                  background: on ? m.accent + '16' : 'transparent',
                  display: 'grid', placeItems: 'center',
                }}
              >
                <Icon
                  name={locked ? 'lock' : m.icon}
                  size={21}
                  stroke={1.9}
                  color={locked ? 'var(--spira-faint)' : on ? m.accent : 'var(--spira-muted)'}
                />
              </button>
            )
          })}
          {/* «i» Acerca de Spira (versión + novedades + dar feedback). Reemplaza la
              tuerca: sus ítems (Preferencias, Roles y permisos, Ayuda) viven en el UserMenu. */}
          <AboutMenu accent={accent} onFeedback={() => setFeedbackOpen(true)} />
          </div>
        </aside>

        {/* panel de submódulos — oculto en Inicio: su única vista es Resumen (la home) */}
        {moduleKey !== 'inicio' && (
        <aside
          className="spira-navcol"
          style={{
            /* 220 y no 208: el descriptor de cada submódulo tiene que entrar en UNA línea.
               Con 208 quedaban 133px útiles y "Información de pacientes" mide 137,9px
               (Inter 11.5px) — envolvía. 220 deja 145px y entra todo con aire. */
            width: navHidden ? 0 : 220,
            flex: '0 0 auto',
            minWidth: 0,
            overflow: 'hidden',
            background: 'var(--spira-surface)',
            borderRight: navHidden ? 'none' : '1px solid var(--spira-line)',
          }}
        >
          <div style={{ width: 220, padding: '18px 12px', display: 'flex', flexDirection: 'column' }}>
            <div className="spira-eyebrow" style={{ padding: '2px 12px 0' }}>Submódulos</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 14 }}>
              {mod.submodules.map((s) => {
                const on = s.key === sub.key
                return (
                  <button
                    key={s.key}
                    onClick={() => { setSubKey(s.key); setSettingsSection(null); setNavTarget(null); setReturnTo(null) }}
                    /* El riel de módulos ya tenía `title`; el panel de submódulos era la única
                       capa de la navegación sin ayuda contextual. Sigue valiendo aunque el
                       descriptor esté a la vista: el panel se pliega (navHidden) y el rótulo
                       puede truncarse. */
                    title={s.hint ? `${s.name} — ${s.hint}` : s.name}
                    /* El activo también se anuncia: antes se distinguía SOLO por color y
                       fondo, así que un lector de pantalla leía seis botones idénticos. */
                    aria-current={on ? 'page' : undefined}
                    style={{
                      /* flex-start, no center: con dos líneas el ícono se tiene que alinear con
                         el RÓTULO, no con el bloque entero. */
                      display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', padding: '8px 12px',
                      border: 'none', borderRadius: 9, cursor: 'pointer',
                      /* El rótulo del activo va en TINTA, no en el acento. En acento no se leía:
                         sobre su propio fondo daba 2,17:1 en Pharma y 4,24:1 en Track (AA pide
                         4,5:1) — el ítem que dice "estás acá" era el menos legible del panel.
                         En tinta da 12,7:1 y el estado lo siguen marcando el fondo teñido, el
                         semibold y el ícono en acento: tres canales en vez de uno flojo.
                         El peso queda en 600 (no 700): el 700 se leía pesado — el realce del
                         activo lo carga el fondo, no la negrita. */
                      background: on ? accent + '14' : 'transparent', color: 'var(--spira-ink)',
                      fontFamily: 'var(--spira-font-text)', fontSize: 14, fontWeight: on ? 600 : 500,
                    }}
                  >
                    <Icon
                      /* accentSolid y no accent: es el mismo tono en Track, pero en Pharma el
                         dorado claro sobre el fondo activo daba 2,17:1 y el sólido llega a
                         3,16:1 — el mínimo de WCAG para elementos gráficos. */
                      name={s.icon} size={17} stroke={1.9} color={on ? mod.accentSolid : 'var(--spira-muted)'}
                      style={{ flex: '0 0 auto', marginTop: 1 }}
                    />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                      <span style={{ lineHeight: 1.35 }}>{s.name}</span>
                      {/* Descriptor: explica la pantalla sin estirar el rótulo (el ancho útil
                          son 133px). Va en `ink-soft` y NO en `muted`, que a 11.5px se queda
                          en 3.37:1 sobre el panel — por debajo del 4.5:1 de AA. */}
                      {s.hint && (
                        <span style={{ fontSize: 11.5, fontWeight: 400, lineHeight: 1.35, color: 'var(--spira-ink-soft)' }}>
                          {s.hint}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>
        </aside>
        )}

        {/* contenido */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 26px 4px', flexWrap: 'wrap' }}>
            {/* Pasaje de vuelta: lo dejó quien te mandó acá (ej. el nombre del paciente en el modal
                de una visita). Va ANTES de la miga y no adentro, porque no es un nivel del camino
                actual sino la salida del que veníais recorriendo. Desaparece solo, en cuanto
                navegás a otra cosa por tu cuenta. */}
            {returnTo && (
              <button
                type="button"
                onClick={() => navigate(returnTo.moduleKey, returnTo.subKey, returnTo.target)}
                title={returnTo.label}
                style={backChip}
              >
                <Icon name="arrowLeft" size={14} color="var(--spira-muted)" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{returnTo.label}</span>
              </button>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--spira-muted)', flexWrap: 'wrap' }}>
                {mod.full}
                <Icon name="chevronRight" size={13} color="var(--spira-faint)" />
                {/* nombre del submódulo: clickeable si la vista registró rootOnClick (vuelve a su raíz) */}
                <Crumb crumb={{ label: sub.name, onClick: viewHeader?.rootOnClick }} />
                {(viewHeader?.crumbs ?? []).map((c, i) => (
                  <Fragment key={i}>
                    <Icon name="chevronRight" size={13} color="var(--spira-faint)" />
                    <Crumb crumb={c} />
                  </Fragment>
                ))}
              </div>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em', marginTop: 1 }}>{sub.name}</div>
            </div>
            {viewHeader?.content ? (
              <div style={{ marginLeft: 'auto', flex: '0 0 auto' }}>{viewHeader.content}</div>
            ) : viewHeader?.actions && viewHeader.actions.length > 0 ? (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                {viewHeader.actions.map((a) => (
                  <button key={a.key} onClick={a.onClick} style={a.primary ? primaryActionBtn(mod.accentSolid) : ghostActionBtn}>
                    <Icon name={a.icon} size={16} color={a.primary ? 'var(--spira-on-accent)' : 'var(--spira-ink)'} /> {a.label}
                  </button>
                ))}
              </div>
            ) : showAction ? (
              <button style={{ ...primaryActionBtn(mod.accentSolid), marginLeft: 'auto' }}>
                <Icon name="plus" size={16} color="var(--spira-on-accent)" /> {action}
              </button>
            ) : null}
          </div>

          {/* contenido: router de vistas (fallback a Placeholder para lo aún no portado).
              Sin padding-bottom: la barra fija del wizard de recepción llega al borde inferior
              (un padding-bottom acá dejaba un hilo de paper debajo). Las vistas manejan su propio
              respiro inferior; el contenido corto igual queda con aire por el flex:1. */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 26px 0' }}>
            {(() => {
              const View = resolveView(moduleKey, sub.key)
              return (
                <View
                  module={mod}
                  submodule={sub}
                  onNavigate={navigate}
                  setHeader={setViewHeader}
                  navTarget={navTarget}
                  onTargetConsumed={() => setNavTarget(null)}
                  onNavigatedAway={() => setReturnTo(null)}
                />
              )
            })()}
          </div>
        </main>
      </div>

      {/* Buscador global (overlay). Lazy: se monta solo abierto → sus hooks (con PII)
          traen datos frescos en cada apertura y no retienen nada al cerrar. */}
      {paletteOpen && (
        <CommandPalette
          accent={accent}
          moduleKey={moduleKey}
          moduleName={mod.name}
          isAllowed={isAllowed}
          onNavigate={navigate}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {/* Modal "Dar feedback" (se abre desde el popover Acerca de del rail). */}
      {feedbackOpen && (
        <FeedbackModal
          moduleKey={moduleKey}
          moduleFull={mod.full}
          subKey={sub.key}
          accent={accent}
          accentSolid={mod.accentSolid}
          onClose={() => setFeedbackOpen(false)}
        />
      )}

      {/* Modal de Ajustes (se abre desde el menú de usuario). Overlay a nivel shell,
          junto a los demás. El tema (pref/setPref) es el único control ya "vivo". */}
      {settingsSection && (
        <SettingsModal
          section={settingsSection}
          setSection={setSettingsSection}
          onClose={() => setSettingsSection(null)}
          pref={pref}
          setPref={setPref}
        />
      )}
    </div>
  )
}
