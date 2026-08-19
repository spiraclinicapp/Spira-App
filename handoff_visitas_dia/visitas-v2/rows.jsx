/* rows.jsx — variantes de fila para Visitas v2. */

const NEXT2 = {
  por_llegar:  { label: "Marcar en sitio", short: "En sitio", to: "en_el_sitio" },
  en_el_sitio: { label: "Marcar atendido", short: "Atendido", to: "atendido" },
  atendido:    { label: "Listo para irse", short: "Listo",    to: "listo" },
  listo:       { label: "Marcar salida",   short: "Salida",   to: "fuera" },
};
const nextAct2 = v => NEXT2[v.estado] || null;

/* Botón primario de la fila */
function RowAction2({ S, v, onAdvance, onNoVino, compact }) {
  const act = nextAct2(v);
  const w = compact ? 150 : 158, h = compact ? 34 : 38;
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const stopKey = e => e.stopPropagation();
  if (v.estado === "no_vino") {
    return (
      <button onClick={stop(() => onAdvance(v, { to: "por_llegar" }))} onKeyDown={stopKey}
        style={{ width: w, height: h, borderRadius: 10, border: `1px solid ${S.line2}`, background: S.white, color: S.muted,
          cursor: "pointer", fontFamily: F2T, fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
        <V2Icon name="undo" size={14} />Deshacer
      </button>
    );
  }
  if (!act) {
    return (
      <div style={{ width: w, height: h, borderRadius: 10, background: S.good + "14", color: S.good,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 13, fontWeight: 600 }}>
        <V2Icon name="check" size={14} color={S.good} />Finalizada
      </div>
    );
  }
  return (
    <button onClick={stop(() => onAdvance(v, act))} onKeyDown={stopKey}
      style={{ width: w, height: h, borderRadius: 10, border: "none", background: S.accent, color: "#fff", cursor: "pointer",
        boxShadow: `0 2px 8px ${S.accent}3D`, fontFamily: F2T, fontWeight: 700, fontSize: 13,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
      {act.label}<V2Icon name="arrowRight" size={14} color="#fff" />
    </button>
  );
}

function Dots2({ S, v, onNoVino }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const item = (label, fn, tone) => (
    <button onClick={e => { e.stopPropagation(); fn(); setOpen(false); }}
      style={{ width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "none", background: "transparent",
        cursor: "pointer", fontFamily: F2T, fontSize: 13, fontWeight: 500, color: tone || S.ink }}>{label}</button>
  );
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }} onKeyDown={e => e.stopPropagation()}
        style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${open ? S.line2 : "transparent"}`, background: open ? S.surface : "transparent",
          cursor: "pointer", display: "grid", placeItems: "center", color: S.faint }}>
        <V2Icon name="dots" size={17} />
      </button>
      {open && (
        <div onMouseDown={e => e.stopPropagation()} style={{ position: "absolute", top: 38, right: 0, zIndex: 25, width: 186, padding: 5,
          background: S.white, border: `1px solid ${S.line}`, borderRadius: 11, boxShadow: `0 14px 34px ${S.shadow}`,
          animation: "v2-menu .14s cubic-bezier(.2,.85,.25,1) both" }}>
          {v.estado !== "no_vino" && item("Marcar como no vino", () => onNoVino(v.id), S.danger)}
          {item("Reprogramar visita", () => {})}
          {item("Ver ficha del paciente", () => {})}
          {item("Copiar N° de paciente", () => {})}
        </div>
      )}
    </div>
  );
}

/* Bloque de hora + estado (columna izquierda, como en la agenda) */
function TimeCol2({ S, v, compact, hideTime }) {
  const m = stage2(v.estado); const c = tone2(S, m.tone);
  if (hideTime) return <div style={{ width: compact ? 84 : 92, flex: "0 0 auto" }}><Estado2 S={S} estado={v.estado} /></div>;
  return (
    <div style={{ width: compact ? 66 : 74, flex: "0 0 auto" }}>
      <div style={{ fontFamily: F2D, fontSize: compact ? 17 : 19, fontWeight: 700, letterSpacing: "-.01em",
        fontVariantNumeric: "tabular-nums", color: S.ink, lineHeight: 1.15 }}>{v.time}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: c, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.short}</div>
    </div>
  );
}

/* Botón "Quiere médico" — ancho fijo, los tres estados ocupan lo mismo */
function DocBtn2({ S, v, onToggleDoctor, compact }) {
  const h = compact ? 34 : 38, w = compact ? 134 : 148;
  const base = { width: w, height: h, flex: "0 0 auto", borderRadius: 10, fontFamily: F2T, fontWeight: 600, fontSize: 13,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, whiteSpace: "nowrap" };
  if (v.doctorSeen) {
    return (
      <div title={`Visto por ${v.medico}`} style={{ ...base, background: S.good + "14", color: S.good, border: "1px solid transparent" }}>
        <V2Icon name="stethoscope" size={15} />Visto por médico
      </div>
    );
  }
  const on = v.wantsDoctor;
  return (
    <button onClick={e => { e.stopPropagation(); onToggleDoctor(v.id); }} onKeyDown={e => e.stopPropagation()}
      title={on ? "Quitar de Para ver médico" : "Marcar para ver médico"}
      style={{ ...base, cursor: "pointer", border: `1px solid ${on ? S.accent : S.line2}`,
        background: on ? S.accent + "12" : S.white, color: on ? S.accent : S.muted }}>
      <V2Icon name="stethoscope" size={15} />{on ? "Espera médico" : "Quiere médico"}
    </button>
  );
}

function DocFlag2({ S, v }) {
  if (!v.wantsDoctor) return null;
  const seen = v.doctorSeen; const c = seen ? S.good : S.accent;
  return (
    <span title={seen ? "Visto por el médico" : "Esperando médico"}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px 2px 7px", borderRadius: 999,
        background: c + "16", color: c, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", lineHeight: 1.6 }}>
      {!seen && <span style={{ width: 5, height: 5, borderRadius: "50%", background: c, animation: "v2-pulse 1.6s ease-in-out infinite" }} />}
      <V2Icon name="stethoscope" size={12} />{seen ? "Visto" : "Espera médico"}
    </span>
  );
}

/* ====================== FILA ====================== */
function VisitRow2({ S, v, layout, tagStyle, rail, showRoute, compact, hideTime, onOpen, onAdvance, onNoVino, onToggleDoctor, focused }) {
  const [hov, setHov] = React.useState(false);
  const p = window.VX2.proto(v.protoId);
  const m = stage2(v.estado);
  const railC = tone2(S, m.tone);
  const pad = compact ? "11px 16px" : "15px 18px";
  const shell = {
    position: "relative", background: S.white, borderRadius: 14, cursor: "pointer",
    border: `1px solid ${focused ? S.accent : hov ? S.line2 : S.line}`,
    boxShadow: hov ? `0 6px 18px ${S.shadow}` : `0 1px 2px ${S.shadow}`,
    transform: hov ? "translateY(-1px)" : "none",
    transition: "box-shadow .18s ease, transform .18s ease, border-color .18s ease",
    outline: focused ? `2px solid ${S.accent}44` : "none", overflow: "hidden",
  };
  const railEl = rail && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: railC }} />;
  const bind = {
    onClick: () => onOpen(v.id), onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false),
    role: "button", tabIndex: 0,
    onKeyDown: e => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(v.id); }
    },
  };
  const procs = (size) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {v.procs.map(k => <Proc2 key={k} S={S} k={k} style={tagStyle} size={size} />)}
    </div>
  );
  const acciones = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
      <DocBtn2 S={S} v={v} onToggleDoctor={onToggleDoctor} compact={compact} />
      <RowAction2 S={S} v={v} onAdvance={onAdvance} onNoVino={onNoVino} compact={compact} />
      <Dots2 S={S} v={v} onNoVino={onNoVino} />
    </div>
  );
  const personas = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flex: "0 0 auto", width: 206, overflow: "hidden" }}>
      <Persona2 S={S} rol="Coord." nombre={v.coordinador} icon="user" />
      <Persona2 S={S} rol="Médico" nombre={v.medico} icon="stethoscope" />
    </div>
  );

  /* ---- A · Protocolo primero ---- */
  if (layout === "protocolo") {
    return (
      <div {...bind} style={{ ...shell, padding: pad, paddingLeft: rail ? 22 : undefined, display: "flex", alignItems: "center", gap: 16 }}>
        {railEl}
        <TimeCol2 S={S} v={v} compact={compact} hideTime={hideTime} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: F2D, fontSize: compact ? 19 : 22, fontWeight: 700, letterSpacing: "-.015em", color: S.ink, lineHeight: 1.15, whiteSpace: "nowrap" }}>{p.name}</span>
            <span style={{ fontSize: 12, color: S.faint, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p.code} · {p.phase}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: S.ink, whiteSpace: "nowrap" }}>{v.patient.name}</span>
            <span style={{ fontSize: 12.5, color: S.muted, fontVariantNumeric: "tabular-nums" }}>#{v.patient.num}</span>
            <span style={{ padding: "2px 9px", borderRadius: 6, background: S.ink, color: S.paper, fontSize: 11.5, fontWeight: 800, letterSpacing: ".02em" }}>{v.visitTag}</span>
            <span style={{ fontSize: 12.5, color: S.muted }}>{v.visitName}</span>
          </div>
          <div style={{ marginTop: 9 }}>{procs("sm")}</div>
        </div>
        {showRoute && <div style={{ flex: "0 0 auto" }}><Route2 S={S} estado={v.estado} w={92} /></div>}
        {personas}
        {acciones}
      </div>
    );
  }

  /* ---- B · Paciente primero (como la agenda) ---- */
  if (layout === "paciente") {
    return (
      <div {...bind} style={{ ...shell, padding: pad, paddingLeft: rail ? 22 : undefined, display: "flex", alignItems: "center", gap: 16 }}>
        {railEl}
        <TimeCol2 S={S} v={v} compact={compact} hideTime={hideTime} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: F2D, fontSize: compact ? 17 : 19, fontWeight: 700, letterSpacing: "-.01em", color: S.ink, lineHeight: 1.2, whiteSpace: "nowrap" }}>{v.patient.name}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <ProtoTag2 S={S} p={p} />
            <span style={{ fontSize: 12.5, color: S.muted, fontVariantNumeric: "tabular-nums" }}>#{v.patient.num}</span>
            <span style={{ padding: "2px 9px", borderRadius: 6, background: S.ink, color: S.paper, fontSize: 11.5, fontWeight: 800 }}>{v.visitTag}</span>
            <span style={{ fontSize: 12.5, color: S.faint }}>{v.visitName}</span>
          </div>
          <div style={{ marginTop: 9 }}>{procs("sm")}</div>
        </div>
        {showRoute && <div style={{ flex: "0 0 auto" }}><Route2 S={S} estado={v.estado} w={92} /></div>}
        {personas}
        {acciones}
      </div>
    );
  }

  /* ---- C · Tabla densa ---- */
  return (
    <div {...bind} style={{ ...shell, borderRadius: 11, padding: "0 14px 0 0", paddingLeft: rail ? 18 : 14,
      display: "grid", gridTemplateColumns: `${hideTime ? 0 : 56}px minmax(140px,1.1fr) minmax(170px,1.4fr) 74px minmax(120px,1fr) 150px auto`,
      alignItems: "center", gap: 14, height: 56 }}>
      {railEl}
      <span style={{ fontFamily: F2T, fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: S.ink }}>{hideTime ? "" : v.time}</span>
      <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontFamily: F2D, fontSize: 15.5, fontWeight: 700, color: S.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
        <span style={{ fontSize: 11, color: S.faint, whiteSpace: "nowrap" }}>{p.code}</span>
      </span>
      <span style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: S.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.patient.name}</div>
        <div style={{ fontSize: 11.5, color: S.faint, fontVariantNumeric: "tabular-nums" }}>#{v.patient.num}</div>
      </span>
      <span style={{ padding: "2px 8px", borderRadius: 6, background: S.ink, color: S.paper, fontSize: 11.5, fontWeight: 800, justifySelf: "start" }}>{v.visitTag}</span>
      <span style={{ display: "flex", gap: 5, minWidth: 0, overflow: "hidden" }}>
        {v.procs.map(k => {
          const pr = window.VX2.PROCS[k]; const c = tone2(S, pr.tone);
          return <span key={k} title={pr.label} style={{ width: 20, height: 20, flex: "0 0 auto", borderRadius: "50%", background: c + "1F", color: c,
            display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 800 }}>{pr.letter}</span>;
        })}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11.5, color: S.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.coordinador}</span>
        <span style={{ fontSize: 11.5, color: S.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.medico}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Estado2 S={S} estado={v.estado} />
        <DocBtn2 S={S} v={v} onToggleDoctor={onToggleDoctor} compact />
        <RowAction2 S={S} v={v} onAdvance={onAdvance} onNoVino={onNoVino} compact />
        <Dots2 S={S} v={v} onNoVino={onNoVino} />
      </span>
    </div>
  );
}

Object.assign(window, { VisitRow2, RowAction2, Dots2, TimeCol2, DocFlag2, DocBtn2, nextAct2, NEXT2 });
