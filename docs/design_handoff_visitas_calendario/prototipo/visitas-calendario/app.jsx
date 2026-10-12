const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "header": "A · Barra",
  "filtros": "Un solo botón",
  "panel": "Dos columnas",
  "weekend": false,
  "monthStyle": "Lista",
  "showCounts": true
}/*EDITMODE-END*/;
const { visits: ALL, TODAY: HOY, STAGES: ST } = window.VC_DATA;

function periodOf(view, date, weekend) {
  if (view === 'dia') return [date, date];
  if (view === 'semana') { const m = D.monday(date); return [m, D.add(m, weekend ? 6 : 4)]; }
  const d = D.parse(date);
  return [D.iso(new Date(d.getFullYear(), d.getMonth(), 1)), D.iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
}
function periodLabel(view, date, weekend) {
  const d = D.parse(date);
  if (view === 'dia') return { main: D.cap(DAYS[d.getDay()]) + ' ' + d.getDate() + ' de ' + MONTHS[d.getMonth()], sub: String(d.getFullYear()) };
  if (view === 'mes') return { main: D.cap(MONTHS[d.getMonth()]), sub: String(d.getFullYear()) };
  const [a, b] = periodOf(view, date, weekend).map(D.parse);
  const same = a.getMonth() === b.getMonth();
  return { main: a.getDate() + (same ? '' : ' ' + MONTHS[a.getMonth()].slice(0, 3)) + ' – ' + b.getDate() + ' ' + MONTHS[b.getMonth()].slice(0, 3), sub: String(b.getFullYear()) };
}

function MiniPicker({ date, onPick, onClose }) {
  const [cur, setCur] = React.useState(date);
  const d0 = D.parse(cur), first = D.iso(new Date(d0.getFullYear(), d0.getMonth(), 1)), start = D.monday(first);
  const cells = Array.from({ length: 42 }, (_, i) => D.add(start, i));
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 20 }}></div>
      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 21, width: 268, padding: 12, borderRadius: 12, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', boxShadow: '0 12px 32px rgba(20,48,46,.14)', animation: 'vc-menu .14s ease-out' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <button className="vc-ibtn" style={{ width: 28, height: 28 }} onClick={() => setCur(D.addMonths(cur, -1))}><Icon name="chevL" size={16} /></button>
          <span style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 13.5 }}>{D.cap(MONTHS[d0.getMonth()])} {d0.getFullYear()}</span>
          <button className="vc-ibtn" style={{ width: 28, height: 28 }} onClick={() => setCur(D.addMonths(cur, 1))}><Icon name="chevR" size={16} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, textAlign: 'center' }}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((h, i) => <span key={i} style={{ fontSize: 11, fontWeight: 700, color: 'var(--spira-ink-soft)', padding: '4px 0' }}>{h}</span>)}
          {cells.map((c) => {
            const dt = D.parse(c), out = dt.getMonth() !== d0.getMonth(), sel = c === date, has = ALL.some((v) => v.date === c);
            return (
              <button key={c} className="vc-pday" onClick={() => onPick(c)} style={{ background: sel ? 'var(--spira-track)' : 'transparent', color: sel ? 'var(--spira-on-accent)' : out ? 'var(--spira-faint)' : 'var(--spira-ink)', fontWeight: c === HOY || sel ? 700 : 500, boxShadow: c === HOY && !sel ? 'inset 0 0 0 1.5px var(--spira-track)' : 'none' }}>
                {dt.getDate()}
                {has && <span style={{ position: 'absolute', bottom: 3, left: '50%', width: 3, height: 3, marginLeft: -1.5, borderRadius: 9, background: sel ? 'var(--spira-on-accent)' : 'var(--spira-track)' }}></span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

const FCATS = [
  ['estado', 'Estado', 'filter', (v) => v.stage, (k) => ST[k].label],
  ['proto', 'Protocolo', 'file', (v) => v.proto, (k) => k],
  ['med', 'Médico', 'users', (v) => v.med, (k) => k],
  ['coord', 'Coordinador', 'user', (v) => v.coord || '∅', (k) => k === '∅' ? 'Sin asignar' : k],
];
const applyF = (list, f, skip) => list.filter((v) => FCATS.every(([k, , , get]) => k === skip || !f[k].length || f[k].includes(get(v))));

function FilterPanel({ base, f, setF, onClose }) {
  const [cat, setCat] = React.useState('estado');
  const c = FCATS.find((x) => x[0] === cat);
  const pool = applyF(base, f, cat);
  const keys = [...new Set(base.map(c[3]))].sort((a, b) => c[4](a).localeCompare(c[4](b)));
  const toggle = (k) => setF({ ...f, [cat]: f[cat].includes(k) ? f[cat].filter((x) => x !== k) : [...f[cat], k] });
  const total = FCATS.reduce((n, x) => n + f[x[0]].length, 0);
  const result = applyF(base, f).length;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 20 }}></div>
      <div role="dialog" aria-label="Filtros" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 21, width: 'min(500px, calc(100vw - 40px))', borderRadius: 14, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', boxShadow: '0 16px 40px rgba(20,48,46,.16)', animation: 'vc-menu .14s ease-out', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '170px minmax(0,1fr)', minHeight: 260 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 8, background: 'var(--spira-surface)', borderRight: '1px solid var(--spira-line)' }}>
            {FCATS.map(([k, l, ic]) => (
              <button key={k} className="vc-fcat" onClick={() => setCat(k)} style={{ background: cat === k ? 'var(--spira-white)' : 'transparent', boxShadow: cat === k ? '0 0 0 1px var(--spira-line)' : 'none', color: cat === k ? 'var(--spira-ink)' : 'var(--spira-ink-2)' }}>
                <Icon name={ic} size={15} color={cat === k ? 'var(--spira-track)' : 'currentColor'} /><span style={{ flex: 1 }}>{l}</span>
                {f[k].length > 0 && <span className="spira-mono" style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 99, background: 'var(--spira-track)', color: 'var(--spira-white)', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{f[k].length}</span>}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 6px' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)' }}>{c[1]}</span>
              {f[cat].length > 0 && <button onClick={() => setF({ ...f, [cat]: [] })} style={{ marginLeft: 'auto', border: 0, background: 'transparent', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-track)', padding: 0 }}>Quitar</button>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', padding: '0 6px 8px', overflow: 'auto', maxHeight: 240 }}>
              {keys.map((k) => {
                const on = f[cat].includes(k), cnt = pool.filter((v) => c[3](v) === k).length;
                return (
                  <label key={k} className="vc-fopt" style={{ opacity: cnt || on ? 1 : .5 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: 'grid', placeItems: 'center', border: on ? '0' : '1.5px solid var(--spira-line-2)', background: on ? 'var(--spira-track)' : 'var(--spira-white)' }}>{on && <Icon name="check" size={12} color="#fff" sw={3} />}</span>
                    <input type="checkbox" checked={on} onChange={() => toggle(k)} style={{ display: 'none' }} />
                    {cat === 'estado' && <span style={{ width: 7, height: 7, borderRadius: 9, background: ST[k].color }}></span>}
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: on ? 600 : 500 }}>{c[4](k)}</span>
                    <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)' }}>{cnt}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--spira-line)' }}>
          <button onClick={() => setF({ estado: [], proto: [], med: [], coord: [] })} disabled={!total} style={{ border: 0, background: 'transparent', fontSize: 13, fontWeight: 600, padding: '0 4px', color: total ? 'var(--spira-ink-2)' : 'var(--spira-faint)', cursor: total ? 'pointer' : 'default' }}>Limpiar todo</button>
          <span style={{ flex: 1 }}></span>
          <button className="vc-btn-primary" style={{ height: 34 }} onClick={onClose}>Ver {result} {result === 1 ? 'visita' : 'visitas'}</button>
        </div>
      </div>
    </>
  );
}

const fKeys = (base, c) => [...new Set(base.map(c[3]))].sort((a, b) => c[4](a).localeCompare(c[4](b)));
const fBadge = (n) => <span className="spira-mono" style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 99, background: 'var(--spira-track)', color: 'var(--spira-white)', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{n}</span>;
function PanelShell({ width, onClose, f, setF, base, children, footer = true }) {
  const total = FCATS.reduce((n, x) => n + f[x[0]].length, 0), result = applyF(base, f).length;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 20 }}></div>
      <div role="dialog" aria-label="Filtros" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 21, width: `min(${width}px, calc(100vw - 40px))`, borderRadius: 14, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', boxShadow: '0 16px 40px rgba(20,48,46,.16)', animation: 'vc-menu .14s ease-out', overflow: 'hidden' }}>
        {children}
        {footer && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--spira-line)' }}>
          <button onClick={() => setF({ estado: [], proto: [], med: [], coord: [] })} disabled={!total} style={{ border: 0, background: 'transparent', fontSize: 13, fontWeight: 600, padding: '0 4px', color: total ? 'var(--spira-ink-2)' : 'var(--spira-faint)', cursor: total ? 'pointer' : 'default' }}>Limpiar todo</button>
          <span style={{ flex: 1 }}></span>
          <button className="vc-btn-primary" style={{ height: 34 }} onClick={onClose}>Ver {result} {result === 1 ? 'visita' : 'visitas'}</button>
        </div>}
      </div>
    </>
  );
}
function FilterChipsPanel({ base, f, setF, onClose }) {
  return (
    <PanelShell width={460} {...{ base, f, setF, onClose }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '14px 16px 16px', maxHeight: 380, overflow: 'auto' }}>
        {FCATS.map((c) => {
          const [k, l] = c, pool = applyF(base, f, k);
          return (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)' }}>{l}</span>
                {f[k].length > 0 && <button onClick={() => setF({ ...f, [k]: [] })} style={{ marginLeft: 'auto', border: 0, background: 'transparent', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-track)', padding: 0 }}>Quitar</button>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {fKeys(base, c).map((key) => {
                  const on = f[k].includes(key), cnt = pool.filter((v) => c[3](v) === key).length;
                  return (
                    <button key={key} className="vc-chip" aria-pressed={on} onClick={() => setF({ ...f, [k]: on ? f[k].filter((x) => x !== key) : [...f[k], key] })}
                      style={{ background: on ? 'var(--spira-white)' : 'rgba(124,140,135,.10)', color: on ? 'var(--spira-ink)' : 'var(--spira-ink-2)', boxShadow: on ? '0 1px 2px rgba(20,48,46,.10), 0 4px 10px rgba(20,48,46,.12)' : 'none', transform: on ? 'translateY(-1px)' : 'none', opacity: cnt || on ? 1 : .5 }}>
                      {on && <Icon name="check" size={13} color="var(--spira-track)" sw={2.6} />}
                      {k === 'estado' && <span style={{ width: 7, height: 7, borderRadius: 9, background: ST[key].color }}></span>}
                      {c[4](key)}<span className="spira-mono" style={{ fontSize: 11.5, opacity: .75 }}>{cnt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}
function FilterMenuPanel({ base, f, setF, onClose }) {
  const [cat, setCat] = React.useState(null);
  const c = cat && FCATS.find((x) => x[0] === cat);
  return (
    <PanelShell width={260} footer={false} {...{ base, f, setF, onClose }}>
      {!c ? (
        <div style={{ display: 'flex', flexDirection: 'column', padding: 6 }}>
          {FCATS.map(([k, l, ic]) => (
            <button key={k} className="vc-fcat" onClick={() => setCat(k)}>
              <Icon name={ic} size={15} color="var(--spira-ink-soft)" /><span style={{ flex: 1 }}>{l}</span>
              {f[k].length > 0 && fBadge(f[k].length)}<Icon name="chevR" size={15} color="var(--spira-muted)" />
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <button onClick={() => setCat(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 10px', border: 0, borderBottom: '1px solid var(--spira-line)', background: 'var(--spira-surface)', fontSize: 13.5, fontWeight: 700, color: 'var(--spira-ink)', textAlign: 'left' }}>
            <Icon name="chevL" size={16} />{c[1]}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', padding: 6, maxHeight: 280, overflow: 'auto' }}>
            {fKeys(base, c).map((key) => {
              const on = f[cat].includes(key), cnt = applyF(base, f, cat).filter((v) => c[3](v) === key).length;
              return (
                <label key={key} className="vc-fopt" style={{ opacity: cnt || on ? 1 : .5 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: 'grid', placeItems: 'center', border: on ? '0' : '1.5px solid var(--spira-line-2)', background: on ? 'var(--spira-track)' : 'var(--spira-white)' }}>{on && <Icon name="check" size={12} color="#fff" sw={3} />}</span>
                  <input type="checkbox" checked={on} onChange={() => setF({ ...f, [cat]: on ? f[cat].filter((x) => x !== key) : [...f[cat], key] })} style={{ display: 'none' }} />
                  {cat === 'estado' && <span style={{ width: 7, height: 7, borderRadius: 9, background: ST[key].color }}></span>}
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: on ? 600 : 500 }}>{c[4](key)}</span>
                  <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)' }}>{cnt}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </PanelShell>
  );
}
function ActiveChips({ f, setF }) {
  const items = FCATS.flatMap((c) => f[c[0]].map((key) => [c, key]));
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: -8 }}>
      {items.map(([c, key]) => (
        <span key={c[0] + key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 4px 0 10px', borderRadius: 99, background: 'var(--spira-tint-track)', fontSize: 12.5, color: 'var(--spira-acc-deep-track)' }}>
          <span style={{ color: 'var(--spira-ink-soft)' }}>{c[1]}:</span><b style={{ fontWeight: 600 }}>{c[4](key)}</b>
          <button title="Quitar" onClick={() => setF({ ...f, [c[0]]: f[c[0]].filter((x) => x !== key) })} style={{ width: 20, height: 20, border: 0, borderRadius: 99, background: 'transparent', color: 'var(--spira-acc-deep-track)', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
        </span>
      ))}
      <button onClick={() => setF({ estado: [], proto: [], med: [], coord: [] })} style={{ border: 0, background: 'transparent', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink-soft)', padding: '0 6px' }}>Limpiar todo</button>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const saved = JSON.parse(localStorage.getItem('vc-state') || '{}');
  const [view, setView] = React.useState(saved.view || 'dia');
  const [date, setDate] = React.useState(saved.date || HOY);
  const [q, setQ] = React.useState('');
  const [picker, setPicker] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [f, setF] = React.useState({ estado: [], proto: [], med: [], coord: [] });
  const [fOpen, setFOpen] = React.useState(false);
  React.useEffect(() => { localStorage.setItem('vc-state', JSON.stringify({ view, date })); }, [view, date]);

  const step = (n) => setDate(view === 'dia' ? D.add(date, n) : view === 'semana' ? D.add(date, 7 * n) : D.addMonths(date, n));
  React.useEffect(() => {
    const k = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 't' || e.key === 'h') setDate(HOY);
      else if (e.key === 'd') setView('dia'); else if (e.key === 's') setView('semana'); else if (e.key === 'm') setView('mes');
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  const term = q.trim().toLowerCase();
  const searched = term ? ALL.filter((v) => `${v.name} ${v.code} ${v.proto} ${v.tag}`.toLowerCase().includes(term)) : ALL;
  const visits = applyF(searched, f);
  const nF = FCATS.reduce((n, x) => n + f[x[0]].length, 0);
  const [a, b] = periodOf(view, date, t.weekend);
  const inPeriod = visits.filter((v) => v.date >= a && v.date <= b);
  const n = (g) => inPeriod.filter((v) => ST[v.stage].group === g).length;
  const lbl = periodLabel(view, date, t.weekend);
  const [ta, tb] = periodOf(view, HOY, t.weekend);
  const showsToday = HOY >= a && HOY <= b;
  const pickDay = (d) => { setDate(d); setView('dia'); };

  const views = [['mes', 'Mes', 'month', 'M'], ['semana', 'Semana', 'week', 'S'], ['dia', 'Día', 'list', 'D']];
  const stats = [
    [inPeriod.length, inPeriod.length === 1 ? 'visita' : 'visitas', null],
    [n('llegar'), 'por llegar', 'var(--spira-warn)'],
    [n('centro'), 'en el centro', 'var(--spira-track)'],
    [n('fin'), view === 'dia' ? 'finalizadas' : 'finalizadas', 'var(--spira-good)'],
  ].filter((s, i) => i === 0 || s[0] > 0);

  const Crumb = () => <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--spira-ink-soft)' }}>Spira Coordinación<Icon name="chevR" size={13} /><b style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>Visitas</b></div>;
  const Title = ({ size = 28 }) => <h1 style={{ margin: 0, fontFamily: 'var(--spira-font-display)', fontSize: size, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--spira-ink)' }}>Visitas</h1>;
  const AddBtn = () => <button className="vc-btn-primary" style={{ height: 40, fontSize: 14.5, padding: '0 18px', flexShrink: 0 }}><Icon name="plus" size={17} />Agregar visita</button>;
  const Nav = () => (
    <div style={{ display: 'flex', alignItems: 'center', height: 38, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', overflow: 'hidden', flexShrink: 0 }}>
      <button className="vc-navbtn" onClick={() => step(-1)} title="Anterior (←)"><Icon name="chevL" size={17} /></button>
      <button className="vc-navbtn" onClick={() => setDate(HOY)} disabled={showsToday} style={{ width: 'auto', padding: '0 14px', fontWeight: 600, fontSize: 13.5, borderLeft: '1px solid var(--spira-line)', borderRight: '1px solid var(--spira-line)', color: showsToday ? 'var(--spira-ink-soft)' : 'var(--spira-acc-deep-track)' }}>Hoy</button>
      <button className="vc-navbtn" onClick={() => step(1)} title="Siguiente (→)"><Icon name="chevR" size={17} /></button>
    </div>
  );
  const Stats = () => t.showCounts ? (
    <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap', overflow: 'hidden', maxWidth: '100%', whiteSpace: 'nowrap', fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
      {stats.map(([num, l, c]) => (
        <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {c && <span style={{ width: 6, height: 6, borderRadius: 9, background: c }}></span>}
          <b className="spira-mono" style={{ fontWeight: 700, color: 'var(--spira-ink-2)' }}>{num}</b>{l}
        </span>
      ))}
    </span>
  ) : null;
  const Period = ({ size = 20, withStats = true }) => (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <button className="vc-period" onClick={() => setPicker(!picker)}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, maxWidth: '100%' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, fontFamily: 'var(--spira-font-display)', fontSize: size, fontWeight: size > 22 ? 800 : 700, letterSpacing: size > 22 ? '-.01em' : 0, color: 'var(--spira-ink)', whiteSpace: 'nowrap' }}>{lbl.main}</span>
          <span style={{ fontSize: size > 22 ? 18 : 14, color: 'var(--spira-ink-soft)' }}>{lbl.sub}</span>
          <Icon name="chevD" size={15} color="var(--spira-muted)" style={{ alignSelf: 'center' }} />
        </span>
        {withStats && <Stats />}
      </button>
      {picker && <MiniPicker date={date} onClose={() => setPicker(false)} onPick={(d) => { setDate(d); setPicker(false); }} />}
    </div>
  );
  const Switch = () => (
    <div role="tablist" style={{ display: 'flex', padding: 3, gap: 2, borderRadius: 11, background: 'rgba(124,140,135,.14)', flexShrink: 0 }}>
      {views.map(([k, l, ic, key]) => (
        <button key={k} role="tab" aria-selected={view === k} title={`${l} (${key})`} className="vc-seg" onClick={() => setView(k)}
          style={{ background: view === k ? 'var(--spira-white)' : 'transparent', color: view === k ? 'var(--spira-ink)' : 'var(--spira-ink-soft)', boxShadow: view === k ? '0 1px 2px rgba(20,48,46,.12), 0 0 0 1px var(--spira-line)' : 'none' }}>
          <Icon name={ic} size={15} /><span className="vc-seglabel">{l}</span>
        </button>
      ))}
    </div>
  );
  const Sep = () => <span style={{ width: 1, alignSelf: 'stretch', minHeight: 28, background: 'var(--spira-line)' }}></span>;

  let header;
  if (t.header === 'A · Barra') header = (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><Crumb /><Title /></div>
        <AddBtn />
      </div>
      <div style={{ containerType: 'inline-size' }}><div className="vc-tbar" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', alignItems: 'center', gap: 16, padding: '12px 14px', borderRadius: 14, background: 'var(--spira-surface)', border: '1px solid var(--spira-line)' }}>
        <Nav /><Period /><Switch />
      </div></div>
    </>
  );
  else if (t.header === 'B · Una línea') header = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Crumb />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Title size={26} /><Sep /><Nav /><Period withStats={false} />
        <span style={{ flex: 1 }}></span><Switch /><AddBtn />
      </div>
      <div style={{ paddingTop: 2 }}><Stats /></div>
    </div>
  );
  else header = (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', paddingBottom: 16, borderBottom: '1px solid var(--spira-line)' }}>
      <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Crumb />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap', minWidth: 0, marginLeft: -6 }}>
          <button className="vc-ibtn" style={{ width: 34, height: 34 }} onClick={() => step(-1)} title="Anterior (←)"><Icon name="chevL" size={20} /></button>
          <Period size={28} withStats={false} />
          <button className="vc-ibtn" style={{ width: 34, height: 34 }} onClick={() => step(1)} title="Siguiente (→)"><Icon name="chevR" size={20} /></button>
          {showsToday
            ? <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 99, background: 'var(--spira-tint-track)', color: 'var(--spira-acc-deep-track)', fontSize: 12.5, fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: 9, background: 'var(--spira-track)' }}></span>{view === 'dia' ? 'Hoy' : view === 'semana' ? 'Esta semana' : 'Este mes'}</span>
            : <button onClick={() => setDate(HOY)} title="Volver a hoy (T)" style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 11px', borderRadius: 99, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-acc-deep-track)', fontSize: 12.5, fontWeight: 700 }}><Icon name="chevL" size={13} />Volver a hoy</button>}
        </div>
        <div style={{ paddingLeft: 2 }}><Stats /></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Switch /><AddBtn />
      </div>
    </div>
  );

  return (
    <Shell>
      <div style={{ padding: '22px 26px 40px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1240 }}>
        {header}
        <div style={{ containerType: 'inline-size' }}><div className={'vc-frow ' + ({ 'Íconos': 'm-iconos', 'Buscador compacto': 'm-compacto', 'Un solo botón': 'm-uno' }[t.filtros] || 'm-iconos')} style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span className="vc-fwide" style={{ display: 'flex', gap: 8 }}>
              {[['filter', 'Estado'], ['file', 'Protocolo'], ['users', 'Médico'], ['user', 'Coordinador']].map(([ic, l]) => (
                <button key={l} className="vc-filter" title={l}><Icon name={ic} size={15} /><span className="vc-flabel">{l}</span><Icon name="chevD" size={14} color="var(--spira-muted)" /></button>
              ))}
            </span>
            <span className="vc-fnarrow" style={{ position: 'relative' }}>
              <button className="vc-filter" aria-expanded={fOpen} onClick={() => setFOpen(!fOpen)} title="Estado, protocolo, médico y coordinador" style={{ boxShadow: fOpen ? '0 1px 2px rgba(20,48,46,.08), 0 6px 16px rgba(20,48,46,.14)' : nF ? '0 1px 2px rgba(20,48,46,.08), 0 3px 8px rgba(20,48,46,.10)' : 'none', transform: fOpen ? 'translateY(-1px)' : 'none' }}>
                <Icon name="filter" size={15} />Filtros
                {nF > 0 && <span className="spira-mono" style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 99, background: 'var(--spira-track)', color: 'var(--spira-white)', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{nF}</span>}
                <Icon name="chevD" size={14} color="var(--spira-muted)" />
              </button>
              {fOpen && (() => { const P = t.panel === 'Fichas' ? FilterChipsPanel : t.panel === 'Menú por pasos' ? FilterMenuPanel : FilterPanel; return <P base={searched.filter((v) => v.date >= a && v.date <= b)} f={f} setF={setF} onClose={() => setFOpen(false)} />; })()}
            </span>
            {view === 'dia' && <>
              <span style={{ width: 1, height: 22, background: 'var(--spira-line)', margin: '0 2px' }}></span>
              <button className="vc-filter" title="Ordenar por: En el centro" style={{ fontWeight: 500 }}><Icon name="sliders" size={15} /><span className="vc-oprefix">Ordenar por:</span> <b className="vc-fval">En el centro</b><Icon name="chevD" size={14} color="var(--spira-muted)" /></button>
            </>}
          </div>
          {t.filtros === 'Buscador compacto' ? (
            <>
              <span style={{ flex: 1 }}></span>
              {searchOpen || q ? (
                <label className="vc-search" style={{ position: 'absolute', right: 0, top: 0, width: 'min(320px, 100%)', boxShadow: '0 8px 24px rgba(20,48,46,.14)', animation: 'vc-menu .14s ease-out', zIndex: 5 }}>
                  <Icon name="search" size={15} color="var(--spira-muted)" />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setSearchOpen(false)} onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); e.target.blur(); } }} placeholder="Paciente o protocolo…" className="vc-sinput" />
                  {q && <button onMouseDown={(e) => { e.preventDefault(); setQ(''); }} style={{ border: 0, background: 'transparent', color: 'var(--spira-ink-soft)', fontSize: 16, padding: 0, lineHeight: 1 }} title="Borrar">×</button>}
                </label>
              ) : (
                <button className="vc-filter" title="Buscar paciente o protocolo" onClick={() => setSearchOpen(true)} style={{ width: 38, padding: 0, justifyContent: 'center', flexShrink: 0 }}><Icon name="search" size={16} /></button>
              )}
            </>
          ) : (
            <label className="vc-search" style={{ flex: '1 1 220px', minWidth: 120, maxWidth: 340, marginLeft: 'auto' }}>
              <Icon name="search" size={15} color="var(--spira-muted)" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Paciente o protocolo…" className="vc-sinput" />
            </label>
          )}
        </div></div>
        {t.filtros === 'Un solo botón' && <ActiveChips f={f} setF={setF} />}

        {view === 'dia' && <DayView list={inPeriod} />}
        {view === 'semana' && <WeekView date={date} visits={visits} weekend={t.weekend} onPickDay={pickDay} />}
        {view === 'mes' && <MonthView date={date} visits={visits} weekend={t.weekend} style={t.monthStyle} onPickDay={pickDay} />}
      </div>
      <div style={{ position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 30, display: 'flex', flexDirection: 'column', gap: 4, padding: 4, borderRadius: 14, background: 'var(--spira-ink)', boxShadow: '0 10px 30px rgba(20,48,46,.28)' }}>
      {[['Encabezado', 'header', ['A · Barra', 'B · Una línea', 'C · Fecha protagonista']], ['Filtros angostos', 'filtros', ['Íconos', 'Buscador compacto', 'Un solo botón']], ['Panel de filtros', 'panel', ['Dos columnas', 'Fichas', 'Menú por pasos']]].map(([title, key, opts]) => (
      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 118, padding: '0 10px 0 8px', fontSize: 12, fontWeight: 600, color: 'rgba(244,241,234,.7)', whiteSpace: 'nowrap' }}>{title}</span>
        {opts.map((o) => (
          <button key={o} onClick={() => { setTweak(key, o); if (key === 'panel') { setTweak('filtros', 'Un solo botón'); setFOpen(true); } }} style={{ height: 30, padding: '0 12px', border: 0, borderRadius: 8, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', background: t[key] === o ? 'var(--spira-paper)' : 'transparent', color: t[key] === o ? 'var(--spira-ink)' : 'var(--spira-paper)' }}>{o}</button>
        ))}
      </div>
      ))}
      </div>
      <TweaksPanel>
        <TweakSection label="Encabezado" />
        <TweakSelect label="Variante" value={t.header} options={['A · Barra', 'B · Una línea', 'C · Fecha protagonista']} onChange={(v) => setTweak('header', v)} />
        <TweakSelect label="Filtros en pantallas angostas" value={t.filtros} options={['Íconos', 'Buscador compacto', 'Un solo botón']} onChange={(v) => setTweak('filtros', v)} />
        <TweakSelect label="Panel de filtros" value={t.panel} options={['Dos columnas', 'Fichas', 'Menú por pasos']} onChange={(v) => setTweak('panel', v)} />
        <TweakSection label="Calendario" />
        <TweakToggle label="Mostrar sábado y domingo" value={t.weekend} onChange={(v) => setTweak('weekend', v)} />
        <TweakRadio label="Celda del mes" value={t.monthStyle} options={['Lista', 'Resumen']} onChange={(v) => setTweak('monthStyle', v)} />
        <TweakToggle label="Contadores del período" value={t.showCounts} onChange={(v) => setTweak('showCounts', v)} />
      </TweaksPanel>
    </Shell>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
