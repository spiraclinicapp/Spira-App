import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { Vilano } from '../components/Vilano'
import { useTheme } from '../lib/theme'
import { useAuth } from '../lib/auth'
import { MODULES } from '../modules/registry'
import { resolveView } from '../views/registry'

/* Etiqueta del botón de acción según módulo/submódulo (voseo, sentence case). */
const ACTION_LABELS: Record<string, string> = {
  'track/resumen': 'Nueva visita',
  'track/protocolos': 'Nuevo protocolo',
  'track/agenda': 'Nueva visita',
  'track/plantillas': 'Nuevo ítem',
  'pharma/dispensaciones': 'Nueva dispensación',
  'pharma/medicamentos': 'Agregar medicamento',
  'pharma/protocolos': 'Nuevo protocolo',
  'pharma/reportes': 'Generar reporte',
}

/* Vistas portadas que traen sus propias acciones contextuales (o son de solo
   lectura): para ellas se suprime el botón de acción genérico del shell. */
const HIDE_ACTION = new Set(['track/resumen', 'track/protocolos', 'track/agenda', 'pharma/protocolos'])

const iconBtn: CSSProperties = {
  width: 38, height: 38, borderRadius: 10, border: 'none',
  background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center',
  color: 'var(--spira-ink)',
}

export function AppShell() {
  const { theme, toggle } = useTheme()
  const { profile, modules: userModules, signOut } = useAuth()
  const [moduleKey, setModuleKey] = useState('inicio')
  const [subKey, setSubKey] = useState('resumen')

  /* 'inicio' siempre disponible; el resto, según los roles reales del usuario. */
  const isAllowed = (key: string) => key === 'inicio' || (userModules as string[]).includes(key)

  const mod = MODULES.find((m) => m.key === moduleKey) ?? MODULES[0]
  const sub = mod.submodules.find((s) => s.key === subKey) ?? mod.submodules[0]
  const accent = mod.accent

  const selectModule = (key: string) => {
    const m = MODULES.find((x) => x.key === key)
    if (!m || !isAllowed(m.key)) return
    setModuleKey(key)
    setSubKey(m.submodules[0].key)
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
          <Vilano size={30} />
          <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 21, letterSpacing: '-0.02em' }}>Spira</span>
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

        {/* panel de submódulos */}
        <aside style={{ width: 208, flex: '0 0 208px', background: 'var(--spira-surface)', borderRight: '1px solid var(--spira-line)', padding: '18px 12px' }}>
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
        </aside>

        {/* contenido */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 26px 4px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--spira-muted)' }}>
                {mod.full}
                <Icon name="chevronRight" size={13} color="var(--spira-faint)" />
                <span style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>{sub.name}</span>
              </div>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em', marginTop: 1 }}>{sub.name}</div>
            </div>
            {showAction && (
              <button
                style={{
                  marginLeft: 'auto', height: 38, padding: '0 15px', border: 'none', borderRadius: 10,
                  background: mod.accentSolid, color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)',
                  fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
                }}
              >
                <Icon name="plus" size={16} color="var(--spira-on-accent)" /> {action}
              </button>
            )}
          </div>

          {/* contenido: router de vistas (fallback a Placeholder para lo aún no portado) */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 26px 26px' }}>
            {(() => {
              const View = resolveView(moduleKey, sub.key)
              return <View module={mod} submodule={sub} />
            })()}
          </div>
        </main>
      </div>
    </div>
  )
}
