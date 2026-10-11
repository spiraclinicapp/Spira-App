const I = {
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>,
  steth: <><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1M5 2v2M11 2v2M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/></>,
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>,
  chevD: <path d="m6 9 6 6 6-6"/>, chevL: <path d="m15 18-6-6 6-6"/>, chevR: <path d="m9 18 6-6-6-6"/>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
  check: <path d="M20 6 9 17l-5-5"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  filter: <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>,
  file: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6"/>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  sliders: <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  fileText: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6"/>,
  clipboard: <path d="M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4"/>,
  bar: <path d="M3 3v18h18M8 17v-6M13 17V7M18 17v-4"/>,
  pill: <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7ZM8.5 8.5l7 7"/>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></>,
  arrowR: <path d="M5 12h14M12 5l7 7-7 7"/>,
  more: <><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>,
  week: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M9 4v17M15 4v17"/></>,
  month: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M3 15.5h18M9 10v11M15 10v11"/></>,
  drop: <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z"/>,
};
function Icon({ name, size = 18, color = 'currentColor', sw = 1.8, style }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>{I[name]}</svg>;
}

const DAYS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const D = {
  parse: (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
  iso: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
  add: (s, n) => { const d = D.parse(s); d.setDate(d.getDate() + n); return D.iso(d); },
  addMonths: (s, n) => { const d = D.parse(s); d.setDate(1); d.setMonth(d.getMonth() + n); return D.iso(d); },
  monday: (s) => { const d = D.parse(s); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return D.iso(d); },
  cap: (t) => t.charAt(0).toUpperCase() + t.slice(1),
};

function Shell({ children }) {
  const subs = [
    ['grid','Resumen','Cómo viene el día'],['users','Estudios y pacientes','Información de pacientes'],
    ['activity','Visitas','Las visitas de hoy',true],['clock','Para ver médico','Cola de atención'],
    ['bell','Pendientes','Lo que hay que resolver'],['fileText','Reportes','Informes por evolucionar'],
    ['clipboard','Tareas','Lo que anotaste vos'],['bar','Estadísticas','Los números del período'],
  ];
  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateRows: '58px minmax(0,1fr)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', background: 'var(--spira-surface)', borderBottom: '1px solid var(--spira-line)' }}>
        <button className="vc-ibtn" style={{ background: 'var(--spira-paper)' }}><Icon name="menu" size={20} /></button>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 21, color: 'var(--spira-ink)' }}>
          <span style={{ width: 28, height: 28, borderRadius: 99, border: '1.5px dashed var(--spira-primary)', opacity: .5 }}></span>Spira
        </span>
        <span style={{ width: 1, height: 26, background: 'var(--spira-line)' }}></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17 }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--spira-tint-track)', display: 'grid', placeItems: 'center' }}><Icon name="activity" size={15} color="var(--spira-track)" /></span>Coordinación
        </span>
        <span style={{ flex: 1 }}></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 210, height: 38, padding: '0 8px 0 12px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-muted)', fontSize: 14 }}>
          <Icon name="search" size={16} /><span style={{ flex: 1 }}>Buscar…</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, border: '1px solid var(--spira-line-2)', borderRadius: 6, padding: '1px 6px', color: 'var(--spira-ink-soft)' }}>Ctrl K</span>
        </div>
        <button className="vc-ibtn"><Icon name="moon" /></button>
        <button className="vc-ibtn"><Icon name="bell" /></button>
        <span style={{ width: 1, height: 26, background: 'var(--spira-line)' }}></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap', flexShrink: 0 }}>
          <span style={{ width: 32, height: 32, borderRadius: 99, border: '2px solid var(--spira-avatar-ring)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--spira-primary)', background: 'var(--spira-tint-track)' }}>SC</span>
          Spira Clinic<Icon name="chevD" size={15} color="var(--spira-muted)" />
        </span>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '64px 232px minmax(0,1fr)', minHeight: 0 }}>
        <nav style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 0', background: 'var(--spira-surface)', borderRight: '1px solid var(--spira-line)' }}>
          <button className="vc-ibtn" style={{ width: 46, height: 46 }}><Icon name="grid" size={20} /></button>
          <button className="vc-ibtn" style={{ width: 46, height: 46, background: 'var(--spira-tint-track)', color: 'var(--spira-track)' }}><Icon name="activity" size={20} /></button>
          <button className="vc-ibtn" style={{ width: 46, height: 46 }}><Icon name="pill" size={20} /></button>
          <span style={{ flex: 1 }}></span>
          <button className="vc-ibtn"><Icon name="info" size={20} /></button>
        </nav>
        <aside style={{ padding: '20px 12px', borderRight: '1px solid var(--spira-line)', background: 'var(--spira-surface)', overflow: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--spira-ink-soft)', padding: '0 12px 12px' }}>SUBMÓDULOS</div>
          {subs.map(([ic, t, s, on]) => (
            <div key={t} className="vc-sub" style={{ display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 10, background: on ? 'rgba(124,140,135,.14)' : 'transparent' }}>
              <Icon name={ic} size={17} style={{ marginTop: 2 }} />
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap' }}>{t}</div><div style={{ fontSize: 12, color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s}</div></div>
            </div>
          ))}
        </aside>
        <main style={{ overflow: 'auto', minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
Object.assign(window, { Icon, D, DAYS, DAYS_SHORT, MONTHS, Shell });
