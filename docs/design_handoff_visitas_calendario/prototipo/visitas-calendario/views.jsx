const { STAGES, TODAY } = window.VC_DATA;
const shortName = (n) => { const p = n.split(' '); return p[0][0] + '. ' + p[p.length - 1]; };

function StatusPill({ stage, bar = true }) {
  const s = STAGES[stage];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 104 }}>
      <span style={{ alignSelf: 'flex-start', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 99, fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink-2)', background: s.color + '1F' }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: s.color }}></span>{s.label}
      </span>
      {bar && <span style={{ height: 3, borderRadius: 99, background: 'var(--spira-line)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: s.pct + '%', background: s.color }}></span></span>}
    </div>
  );
}

function DayRow({ v }) {
  const s = STAGES[v.stage];
  return (
    <div className="vc-card vc-row">
      <StatusPill stage={v.stage} />
      <div className="vc-row-main" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17, color: 'var(--spira-ink)' }}>{v.name}</span>
          {v.arrived && <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap' }}>llegó {v.arrived}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
          <span className="vc-proto">{v.proto}</span>
          <span className="spira-mono" style={{ color: 'var(--spira-ink-soft)' }}>{v.code}</span>
          <span className="vc-tag">{v.tag}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink-2)' }}>
          <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Icon name="clipboard" size={14} color="var(--spira-track)" />{v.procs} proc.</span>
          <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Icon name="drop" size={13} color={v.blood ? 'var(--spira-danger)' : 'var(--spira-faint)'} />{v.blood ? 'Con sangre' : 'Sin sangre'}</span>
          {v.kit && <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Icon name="pill" size={14} color="var(--spira-warn)" />Kit IP</span>}
        </div>
      </div>
      <div className="vc-row-people" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', columnGap: 8, rowGap: 4, fontSize: 12.5, justifySelf: 'end' }}>
        <span style={{ color: 'var(--spira-ink-soft)', display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}><Icon name="user" size={13} />Coord.</span><span style={{ fontWeight: 600, color: v.coord ? 'var(--spira-ink-2)' : 'var(--spira-ink-soft)', fontWeight: v.coord ? 600 : 400 }}>{v.coord || 'Sin asignar'}</span>
        <span style={{ color: 'var(--spira-ink-soft)', display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}><Icon name="users" size={13} />Médico</span><span style={{ fontWeight: 600, color: 'var(--spira-ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.med}</span>
      </div>
      <div className="vc-row-cta" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
        {(() => { const on = v.stage === 'concurrio' || v.stage === 'inicio'; return (
          <button className="vc-btn vc-btn-med" disabled={!on} title={on ? 'Solicitar atención médica' : v.stage === 'por_llegar' ? 'Disponible cuando el paciente llegue' : 'La visita ya no está en el centro'}><Icon name="users" size={15} />Atención médica</button>
        ); })()}
        {s.cta ? <button className="vc-btn-primary" style={{ height: 38, width: 160, justifyContent: 'center' }}>{s.cta}<Icon name="arrowR" size={15} /></button>
          : v.stage === 'no_vino' ? <button className="vc-btn" style={{ width: 160 }}>Reprogramar</button> : <span aria-hidden="true" style={{ width: 160, flexShrink: 0 }}></span>}
      </div>
      <button className="vc-ibtn vc-row-more" style={{ width: 28, height: 28 }}><Icon name="more" size={18} /></button>
    </div>
  );
}

function DayView({ list }) {
  const groups = [['centro', 'En el centro'], ['llegar', 'Por llegar'], ['fin', 'Finalizadas']]
    .map(([k, l]) => ({ k, l, items: list.filter((v) => STAGES[v.stage].group === k) })).filter((g) => g.items.length);
  if (!list.length) return <Empty text="No hay visitas este día" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, containerType: 'inline-size' }}>
      {groups.map((g) => (
        <div key={g.k}>
          {groups.length > 1 && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px 9px' }}>
            <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 12.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap' }}>{g.l}</span>
            <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)' }}>{g.items.length}</span>
            <span style={{ flex: 1, height: 1, background: 'var(--spira-line)' }}></span>
          </div>}
          {g.items.map((v) => <DayRow key={v.id} v={v} />)}
        </div>
      ))}
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ textAlign: 'center', padding: '60px 20px', fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, color: 'var(--spira-ink-soft)' }}>{text}</div>;
}

function WeekCard({ v, onOpen }) {
  const s = STAGES[v.stage];
  const done = s.group === 'fin';
  return (
    <button className="vc-wcard" onClick={onOpen} style={{ opacity: done ? .78 : 1 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--spira-ink-soft)' }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: s.color }}></span>{s.label}
        {v.arrived && <span className="spira-mono" style={{ marginLeft: 'auto' }}>{v.arrived}</span>}
      </span>
      <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: v.stage === 'no_vino' ? 'line-through' : 'none' }}>{v.name}</span>
      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}><span className="vc-proto sm">{v.proto}</span><span className="vc-tag sm">{v.tag}</span></span>
    </button>
  );
}

function WeekView({ date, visits, weekend, onPickDay }) {
  const mon = D.monday(date);
  const days = Array.from({ length: weekend ? 7 : 5 }, (_, i) => D.add(mon, i));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))`, border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)', overflow: 'hidden' }}>
      {days.map((d, i) => {
        const dt = D.parse(d), list = visits.filter((v) => v.date === d), isT = d === TODAY, sel = d === date;
        return (
          <div key={d} style={{ display: 'flex', flexDirection: 'column', minHeight: 440, borderLeft: i ? '1px solid var(--spira-line)' : 'none', background: isT ? 'rgba(46,125,116,.04)' : 'transparent' }}>
            <button className="vc-dayhead" onClick={() => onPickDay(d)} style={{ boxShadow: sel ? 'inset 0 -2px 0 var(--spira-track)' : 'none' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: isT ? 'var(--spira-acc-deep-track)' : 'var(--spira-ink-soft)' }}>{DAYS_SHORT[dt.getDay()]}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 20, minWidth: 32, height: 32, borderRadius: 99, display: 'grid', placeItems: 'center', background: isT ? 'var(--spira-track)' : 'transparent', color: isT ? 'var(--spira-on-accent)' : 'var(--spira-ink)' }}>{dt.getDate()}</span>
                <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)', marginLeft: 'auto' }}>{list.length ? list.length + (list.length === 1 ? ' visita' : ' visitas') : '—'}</span>
              </span>
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }}>
              {list.map((v) => <WeekCard key={v.id} v={v} onOpen={() => onPickDay(d)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ date, visits, weekend, style, onPickDay }) {
  const d0 = D.parse(date), first = D.iso(new Date(d0.getFullYear(), d0.getMonth(), 1));
  const start = D.monday(first);
  const last = new Date(d0.getFullYear(), d0.getMonth() + 1, 0);
  const weeks = Math.ceil(((D.parse(first).getDay() + 6) % 7 + last.getDate()) / 7);
  const cols = weekend ? 7 : 5;
  const head = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].slice(0, cols);
  const cells = [];
  for (let w = 0; w < weeks; w++) for (let c = 0; c < cols; c++) cells.push(D.add(start, w * 7 + c));
  return (
    <div style={{ border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, borderBottom: '1px solid var(--spira-line)', background: 'var(--spira-surface)' }}>
        {head.map((h) => <div key={h} style={{ padding: '9px 12px', fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)' }}>{h}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {cells.map((d, i) => {
          const dt = D.parse(d), out = dt.getMonth() !== d0.getMonth(), isT = d === TODAY, sel = d === date;
          const list = visits.filter((v) => v.date === d);
          const count = (g) => list.filter((v) => STAGES[v.stage].group === g).length;
          return (
            <button key={d} className="vc-mcell" onClick={() => onPickDay(d)} style={{ borderLeft: i % cols ? '1px solid var(--spira-line)' : 'none', borderTop: i >= cols ? '1px solid var(--spira-line)' : 'none', background: sel ? 'rgba(46,125,116,.06)' : 'transparent', opacity: out ? .45 : 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14, minWidth: 26, height: 26, borderRadius: 99, display: 'grid', placeItems: 'center', background: isT ? 'var(--spira-track)' : 'transparent', color: isT ? 'var(--spira-on-accent)' : 'var(--spira-ink)' }}>{dt.getDate()}</span>
                {list.length > 0 && <span className="spira-mono" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--spira-ink-soft)' }}>{list.length}</span>}
              </span>
              {style === 'Lista' ? (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
                  {list.slice(0, 3).map((v) => (
                    <span key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--spira-ink-2)', minWidth: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: STAGES[v.stage].color }}></span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: v.stage === 'no_vino' ? 'line-through' : 'none' }}>{shortName(v.name)}</span>
                      <span className="spira-mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--spira-ink-soft)', flexShrink: 0 }}>{v.tag.split(' ')[0]}</span>
                    </span>
                  ))}
                  {list.length > 3 && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--spira-acc-deep-track)' }}>+{list.length - 3} más</span>}
                </span>
              ) : (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%', fontSize: 12 }}>
                  {[['centro', 'en el centro', '#2E7D74'], ['llegar', 'por llegar', '#B0823F'], ['fin', 'finalizadas', '#5C8A5A']].map(([g, l, c]) => count(g) > 0 && (
                    <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--spira-ink-2)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: c }}></span><b style={{ fontWeight: 700 }}>{count(g)}</b>{l}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
Object.assign(window, { DayView, WeekView, MonthView });
