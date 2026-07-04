import { Fragment, useLayoutEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { Vilano } from '../components/Vilano'
import { useTheme } from '../lib/theme'
import { useAuth } from '../lib/auth'
import { MODULES } from '../modules/registry'
import { resolveView } from '../views/registry'
import type { ViewHeader, ViewHeaderCrumb } from '../views/types'

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
const HIDE_ACTION = new Set(['inicio/resumen', 'inicio/tareas', 'inicio/alertas', 'track/resumen', 'track/protocolos', 'track/visitas', 'track/para-ver-medico', 'track/agenda', 'track/alertas', 'pharma/protocolos', 'pharma/recepcion'])

const iconBtn: CSSProperties = {
  width: 38, height: 38, borderRadius: 10, border: 'none',
  background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center',
  color: 'var(--spira-ink)',
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
  const { theme, toggle } = useTheme()
  const { profile, modules: userModules, signOut } = useAuth()
  const [moduleKey, setModuleKey] = useState('inicio')
  const [subKey, setSubKey] = useState('resumen')
  /* Encabezado contextual que registra la vista activa (breadcrumb + acciones). */
  const [viewHeader, setViewHeader] = useState<ViewHeader | null>(null)

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
    setModuleKey(key)
    setSubKey(m.submodules[0].key)
  }

  /* Navegación programática desde una vista (ej. "Ver agenda del protocolo" → track/agenda). */
  const navigate = (mKey: string, sKey: string) => {
    const m = MODULES.find((x) => x.key === mKey)
    if (!m || !isAllowed(m.key) || !m.submodules.some((s) => s.key === sKey)) return
    setModuleKey(mKey)
    setSubKey(sKey)
  }

  const action = ACTION_LABELS[`${moduleKey}/${sub.key}`] ?? 'Nuevo'
  const showAction = !HIDE_ACTION.has(`${moduleKey}/${sub.key}`)
  const userName = profile?.fullName ?? 'Usuario'
  const initial = userName.trim().charAt(0).toUpperCase() || 'U'

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
          <button onClick={toggle} style={iconBtn} title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} color="var(--spira-ink)" />
          </button>
          <button style={iconBtn} title="Buscar">
            <Icon name="search" size={18} color="var(--spira-ink)" />
          </button>
          <button style={{ ...iconBtn, position: 'relative' }} title="Notificaciones">
            <Icon name="bell" size={18} color="var(--spira-ink)" />
            <span style={{ position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--spira-danger)', border: '2px solid var(--spira-white)' }} />
          </button>

          <span style={{ width: 1, height: 26, background: 'var(--spira-line)', margin: '0 4px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 42, padding: '0 4px 0 6px' }}>
            <span
              style={{
                width: 32, height: 32, borderRadius: 9, background: 'var(--spira-primary)', color: 'var(--spira-on-accent)',
                display: 'grid', placeItems: 'center', fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 13,
              }}
            >
              {initial}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--spira-muted)' }}>{userName}</span>
          </div>
          <button onClick={() => { void signOut() }} style={iconBtn} title="Cerrar sesión">
            <Icon name="logout" size={18} color="var(--spira-muted)" />
          </button>
        </div>
      </header>

      {/* ===== cuerpo: riel + panel + contenido ===== */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* riel de módulos */}
        <aside
          style={{
            width: 64, flex: '0 0 64px', background: 'var(--spira-white)', borderRight: '1px solid var(--spira-line)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 6,
          }}
        >
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
          <button style={{ ...iconBtn, marginTop: 'auto', width: 46, height: 46, color: 'var(--spira-muted)' }} title="Ajustes">
            <Icon name="settings" size={21} stroke={1.9} color="var(--spira-muted)" />
          </button>
        </aside>

        {/* panel de submódulos — oculto en Inicio: su única vista es Resumen (la home) */}
        {moduleKey !== 'inicio' && (
        <aside style={{ width: 208, flex: '0 0 208px', background: 'var(--spira-surface)', borderRight: '1px solid var(--spira-line)', padding: '18px 12px', display: 'flex', flexDirection: 'column' }}>
          <div className="spira-eyebrow" style={{ padding: '2px 12px 0' }}>Submódulos</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 14 }}>
            {mod.submodules.map((s) => {
              const on = s.key === sub.key
              return (
                <button
                  key={s.key}
                  onClick={() => setSubKey(s.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px',
                    border: 'none', borderRadius: 9, cursor: 'pointer',
                    background: on ? accent + '14' : 'transparent', color: on ? accent : 'var(--spira-ink)',
                    fontFamily: 'var(--spira-font-text)', fontSize: 14, fontWeight: on ? 600 : 500,
                  }}
                >
                  <Icon name={s.icon} size={17} stroke={1.9} color={on ? accent : 'var(--spira-muted)'} />
                  {s.name}
                </button>
              )
            })}
          </nav>
          {/* versión: info de sistema, al pie, discreta (mono + faint) */}
          <div className="spira-mono spira-no-press" style={{ marginTop: 'auto', padding: '0 12px', fontSize: 11, letterSpacing: '0.02em', color: 'var(--spira-faint)' }} title="Versión de Spira">
            v{__APP_VERSION__}
          </div>
        </aside>
        )}

        {/* contenido */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 26px 4px' }}>
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
            {viewHeader?.actions && viewHeader.actions.length > 0 ? (
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
              return <View module={mod} submodule={sub} onNavigate={navigate} setHeader={setViewHeader} />
            })()}
          </div>
        </main>
      </div>
    </div>
  )
}
