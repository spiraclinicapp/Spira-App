/* shell.jsx — App shell + filtros + variantes de Visitas v2. */
const { useState, useEffect, useMemo, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "paciente",
  "tagStyle": "punto",
  "rail": true,
  "showRoute": false,
  "showTime": true,
  "density": "compacta",
  "group": "hora",
  "detailStyle": "modal",
  "anim": "suave",
  "dark": false
}/*EDITMODE-END*/;

const RAIL_NAV = [
  { icon: "dashboard", key: "inicio" }, { icon: "activity", key: "track", active: true },
  { icon: "flask", key: "lab" }, { icon: "pill", key: "pharma" }, { icon: "file", key: "contable" },
];
const SUBS = [
  { icon: "dashboard", name: "Resumen" }, { icon: "file", name: "Pacientes" },
  { icon: "activity", name: "Visitas", active: true }, { icon: "stethoscope", name: "Para ver médico" },
  { icon: "bell", name: "Alertas" },
];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const S = t.dark ? window.VX2.DARK : window.VX2.LIGHT;
  const compact = t.density === "compacta";
  const [visits, setVisits] = useState(() => JSON.parse(JSON.stringify(window.VX2.VISITS)).map(v => ({ ...v, procsDone: [] })));
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState([]);
  const [fProto, setFProto] = useState([]);
  const [fCoord, setFCoord] = useState([]);
  const [fMed, setFMed] = useState([]);

  const mut = (id, fn) => setVisits(vs => vs.map(v => v.id === id ? fn({ ...v }) : v));
  const handlers = {
    advance: (v, act) => mut(v.id, x => ({ ...x, estado: act.to })),
    noVino: (id) => mut(id, x => ({ ...x, estado: "no_vino" })),
    toggleProc: (id, k) => mut(id, x => ({ ...x, procsDone: (x.procsDone || []).includes(k) ? x.procsDone.filter(p => p !== k) : [...(x.procsDone || []), k] })),
    toggleDoctor: (id) => mut(id, x => ({ ...x, wantsDoctor: !x.wantsDoctor, doctorMotivo: x.wantsDoctor ? null : (x.doctorMotivo || "Consulta clínica") })),
    addComment: (id, txt) => mut(id, x => ({ ...x, comments: [...x.comments, { id: "c" + Date.now(), author: "Vos", initials: "VS", role: "Coordinación", at: "ahora", txt }] })),
  };

  const shown = useMemo(() => visits.filter(v => {
    if (fEstado.length && !fEstado.includes(v.estado)) return false;
    if (fProto.length && !fProto.includes(v.protoId)) return false;
    if (fCoord.length && !fCoord.includes(v.coordinador)) return false;
    if (fMed.length && !fMed.includes(v.medico)) return false;
    if (q.trim()) {
      const s = (v.patient.name + " " + v.patient.num + " " + window.VX2.proto(v.protoId).name + " " + v.visitTag).toLowerCase();
      if (!s.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  }), [visits, fEstado, fProto, fCoord, fMed, q]);

  const nFilters = fEstado.length + fProto.length + fCoord.length + fMed.length;
  const clearAll = () => { setFEstado([]); setFProto([]); setFCoord([]); setFMed([]); setQ(""); };

  const count = (key, val) => visits.filter(v => key === "estado" ? v.estado === val : key === "proto" ? v.protoId === val : key === "coord" ? v.coordinador === val : v.medico === val).length;
  const optEstado = [...window.VX2.STAGES, window.VX2.NO_VINO].map(s => ({ value: s.key, label: s.label, hint: count("estado", s.key) || "" }));
  const optProto = window.VX2.PROTOCOLS.map(p => ({ value: p.id, label: p.name, hint: count("proto", p.id) || "" }));
  const optCoord = window.VX2.COORDINADORES.map(c => ({ value: c, label: c, hint: count("coord", c) || "" }));
  const optMed = window.VX2.MEDICOS.map(m => ({ value: m, label: m, hint: count("med", m) || "" }));

  /* Agrupación */
  const groups = useMemo(() => {
    if (t.group === "ninguno") return [{ key: "all", label: null, items: shown }];
    if (t.group === "estado") {
      const order = [...window.VX2.STAGES.map(s => s.key), "no_vino"];
      return order.map(k => ({ key: k, label: stage2(k).label, items: shown.filter(v => v.estado === k) })).filter(g => g.items.length);
    }
    if (t.group === "protocolo") {
      return window.VX2.PROTOCOLS.map(p => ({ key: p.id, label: p.name, items: shown.filter(v => v.protoId === p.id) })).filter(g => g.items.length);
    }
    if (t.group === "coordinador") {
      return window.VX2.COORDINADORES.map(c => ({ key: c, label: c, items: shown.filter(v => v.coordinador === c) })).filter(g => g.items.length);
    }
    if (t.group === "medico") {
      return window.VX2.MEDICOS.map(m => ({ key: m, label: m, items: shown.filter(v => v.medico === m) })).filter(g => g.items.length);
    }
    const times = [...new Set(shown.map(v => v.time))].sort();
    return times.map(h => ({ key: h, label: h, items: shown.filter(v => v.time === h) }));
  }, [shown, t.group]);

  const flat = groups.flatMap(g => g.items);
  const openIdx = flat.findIndex(v => v.id === openId);
  const open = visits.find(v => v.id === openId);
  const step = d => { if (!flat.length) return; const i = openIdx < 0 ? 0 : (openIdx + d + flat.length) % flat.length; setOpenId(flat[i].id); };

  const resumen = {
    total: shown.length,
    pendientes: shown.filter(v => ["por_llegar"].includes(v.estado)).length,
    enSitio: shown.filter(v => ["en_el_sitio", "atendido", "listo"].includes(v.estado)).length,
    noVino: shown.filter(v => v.estado === "no_vino").length,
  };

  const animVal = ["suave", "resorte", "rapido"].includes(t.anim) ? t.anim : "suave";

  const TopIcon = ({ name, badge }) => (
    <button style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", position: "relative" }}>
      <V2Icon name={name} size={18} color={S.muted} />
      {badge && <span style={{ position: "absolute", top: 7, right: 8, width: 7, height: 7, borderRadius: "50%", background: S.danger, border: `1.5px solid ${S.white}` }} />}
    </button>
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", background: S.paper, color: S.ink, fontFamily: F2T, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* topbar */}
      <div style={{ height: 56, flex: "0 0 auto", borderBottom: `1px solid ${S.line}`, background: S.white, display: "flex", alignItems: "center", padding: "0 18px", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 25, height: 25, borderRadius: "50%", background: S.primary, color: S.paper, display: "grid", placeItems: "center", fontFamily: F2D, fontWeight: 700, fontSize: 13 }}>S</span>
          <span style={{ fontFamily: F2D, fontWeight: 700, fontSize: 20, letterSpacing: "-.02em" }}>Spira</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 12px 5px 8px", borderRadius: 99, border: `1px solid ${S.line}`, background: S.surface }}>
          <span style={{ width: 21, height: 21, borderRadius: "50%", background: S.accent + "22", display: "grid", placeItems: "center" }}><V2Icon name="activity" size={13} color={S.accent} /></span>
          <span style={{ fontFamily: F2D, fontWeight: 700, fontSize: 13.5 }}>Track</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3 }}>
          <button onClick={() => setTweak("dark", !t.dark)} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" }}>
            <V2Icon name={t.dark ? "sun" : "moon"} size={18} color={S.muted} />
          </button>
          <TopIcon name="bell" badge />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 6 }}>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: S.primary, color: S.paper, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11 }}>SC</span>
            <span style={{ fontSize: 13, color: S.muted }}>Spira Clinic</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: 58, flex: "0 0 auto", borderRight: `1px solid ${S.line}`, background: S.white, display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0", gap: 5 }}>
          {RAIL_NAV.map(r => (
            <div key={r.key} style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center",
              background: r.active ? S.accent + "18" : "transparent", cursor: "pointer" }}>
              <V2Icon name={r.icon} size={19} color={r.active ? S.accent : S.faint} />
            </div>
          ))}
          <div style={{ marginTop: "auto" }}><V2Icon name="settings" size={19} color={S.faint} /></div>
        </div>
        <div style={{ width: 216, flex: "0 0 auto", borderRight: `1px solid ${S.line}`, background: S.surface, display: "flex", flexDirection: "column", padding: "18px 12px" }}>
          <div style={{ fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: S.faint, fontWeight: 700, padding: "0 10px 10px" }}>Submódulos</div>
          {SUBS.map(s => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 10, marginBottom: 2, cursor: "pointer",
              background: s.active ? S.white : "transparent", border: `1px solid ${s.active ? S.line : "transparent"}`,
              color: s.active ? S.ink : S.muted, fontWeight: s.active ? 600 : 500, fontSize: 13 }}>
              <V2Icon name={s.icon} size={16} color={s.active ? S.accent : S.faint} />{s.name}
            </div>
          ))}
        </div>

        {/* contenido */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative" }}>
          {/* cabecera */}
          <div style={{ flex: "0 0 auto", padding: "20px 28px 0", background: S.paper }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: S.muted }}>
              Spira Track <V2Icon name="chevronRight" size={12} color={S.faint} /> <span style={{ color: S.ink, fontWeight: 600 }}>Visitas</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
              <h1 style={{ fontFamily: F2D, fontWeight: 700, fontSize: 30, letterSpacing: "-.02em", margin: 0, whiteSpace: "nowrap" }}>Visitas de hoy</h1>
              <span style={{ fontSize: 13, color: S.muted, paddingBottom: 5, fontVariantNumeric: "tabular-nums" }}>
                lunes 3 ago · {resumen.total} {resumen.total === 1 ? "visita" : "visitas"}
                {resumen.pendientes > 0 && <> · <span style={{ color: S.warn, fontWeight: 600 }}>{resumen.pendientes} por llegar</span></>}
                {resumen.enSitio > 0 && <> · <span style={{ color: S.accent, fontWeight: 600 }}>{resumen.enSitio} en el sitio</span></>}
                {resumen.noVino > 0 && <> · <span style={{ color: S.danger, fontWeight: 600 }}>{resumen.noVino} no vino</span></>}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, paddingBottom: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${S.line2}`, background: S.white, width: 230 }}>
                  <V2Icon name="search" size={15} color={S.faint} />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Paciente, N° o protocolo…"
                    style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: S.ink, fontFamily: F2T, fontSize: 13, minWidth: 0 }} />
                  {q && <button onClick={() => setQ("")} style={{ border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", padding: 0 }}><V2Icon name="x" size={13} color={S.faint} /></button>}
                </div>
              </div>
            </div>

            {/* filtros */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 0 14px", flexWrap: "wrap" }}>
              <FilterMenu2 S={S} label="Estado" icon="filter" options={optEstado} selected={fEstado} onChange={setFEstado} width={200} />
              <FilterMenu2 S={S} label="Protocolo" icon="file" options={optProto} selected={fProto} onChange={setFProto} width={200} />
              <FilterMenu2 S={S} label="Coordinador" icon="user" options={optCoord} selected={fCoord} onChange={setFCoord} width={220} />
              <FilterMenu2 S={S} label="Médico" icon="stethoscope" options={optMed} selected={fMed} onChange={setFMed} width={220} />
              <span style={{ width: 1, height: 22, background: S.line, margin: "0 4px" }} />
              <PickMenu2 S={S} label="Agrupar por" icon="dashboard" value={t.group} onChange={v => setTweak("group", v)} width={180}
                options={[{ value: "hora", label: "Hora" }, { value: "estado", label: "Estado" }, { value: "protocolo", label: "Protocolo" }, { value: "coordinador", label: "Coordinador" }, { value: "medico", label: "Médico" }, { value: "ninguno", label: "Sin agrupar" }]} />
              {nFilters > 0 && (
                <button onClick={clearAll}
                  style={{ height: 36, padding: "0 12px", borderRadius: 10, border: "none", background: "transparent", color: S.muted,
                    cursor: "pointer", fontFamily: F2T, fontWeight: 600, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <V2Icon name="x" size={13} />Limpiar {nFilters}
                </button>
              )}
              <span style={{ marginLeft: "auto", fontSize: 12, color: S.faint }}>Clic en la fila para abrir el detalle · ↑↓ para navegar</span>
            </div>
          </div>

          {/* lista */}
          <div style={{ flex: 1, overflow: "auto", padding: "18px 28px 40px" }}>
            <div style={{ maxWidth: 1480, minWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: compact ? 14 : 18 }}>
              {groups.map(g => (
                <div key={g.key}>
                  {g.label && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 2px 9px" }}>
                      <span style={{ fontFamily: F2D, fontSize: 13, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: S.muted, fontVariantNumeric: "tabular-nums" }}>{g.label}</span>
                      <span style={{ fontSize: 12, color: S.faint }}>{g.items.length}</span>
                      <span style={{ flex: 1, height: 1, background: S.line }} />
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 9 }}>
                    {g.items.map(v => (
                      <VisitRow2 key={v.id} S={S} v={t.showTime ? v : { ...v }} layout={t.layout} tagStyle={t.tagStyle}
                        rail={t.rail} showRoute={t.showRoute} compact={compact} hideTime={!t.showTime}
                        focused={openId === v.id} onOpen={setOpenId} onAdvance={handlers.advance} onNoVino={handlers.noVino}
                        onToggleDoctor={handlers.toggleDoctor} />
                    ))}
                  </div>
                </div>
              ))}
              {shown.length === 0 && (
                <div style={{ textAlign: "center", padding: "70px 20px", color: S.faint }}>
                  <div style={{ fontFamily: F2D, fontSize: 17, fontWeight: 700, color: S.muted }}>Ninguna visita coincide con los filtros</div>
                  <button onClick={clearAll} style={{ marginTop: 12, height: 36, padding: "0 16px", borderRadius: 10, border: `1px solid ${S.line2}`, background: S.white, color: S.accent, cursor: "pointer", fontFamily: F2T, fontWeight: 600, fontSize: 13 }}>Limpiar filtros</button>
                </div>
              )}
            </div>
          </div>

          {open && <Detail2 S={S} v={open} mode={t.detailStyle} anim={animVal} tagStyle={t.tagStyle}
            pos={`${openIdx + 1}/${flat.length}`} onPrev={() => step(-1)} onNext={() => step(1)}
            onClose={() => setOpenId(null)} handlers={handlers} />}
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Fila" />
        <TweakRadio label="Jerarquía" value={t.layout} options={["protocolo", "paciente", "tabla"]} onChange={v => setTweak("layout", v)} />
        <TweakRadio label="Tags" value={t.tagStyle} options={["letra", "solido", "punto"]} onChange={v => setTweak("tagStyle", v)} />
        <TweakRadio label="Densidad" value={t.density} options={["comoda", "compacta"]} onChange={v => setTweak("density", v)} />
        <TweakToggle label="Borde de estado" value={t.rail} onChange={v => setTweak("rail", v)} />
        <TweakToggle label="Mini ruta" value={t.showRoute} onChange={v => setTweak("showRoute", v)} />
        <TweakToggle label="Mostrar hora" value={t.showTime} onChange={v => setTweak("showTime", v)} />
        <TweakSection label="Lista" />
        <TweakSelect label="Agrupar por" value={t.group} options={["hora", "estado", "protocolo", "coordinador", "medico", "ninguno"]} onChange={v => setTweak("group", v)} />
        <TweakSection label="Detalle" />
        <TweakRadio label="Formato" value={t.detailStyle} options={["modal", "panel"]} onChange={v => setTweak("detailStyle", v)} />
        <TweakRadio label="Animación" value={animVal} options={["suave", "resorte", "rapido"]} onChange={v => setTweak("anim", v)} />
        <TweakSection label="Tema" />
        <TweakToggle label="Modo oscuro" value={t.dark} onChange={v => setTweak("dark", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
