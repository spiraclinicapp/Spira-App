/* atoms.jsx — íconos, helpers y piezas base de Visitas v2. */

const V2ICONS = {
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  search: ["M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "m21 21-4.3-4.3"],
  bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "m16 17 5-5-5-5", "M21 12H9"],
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
  sun: ["M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M12 2v2", "M12 20v2", "m4.9 4.9 1.4 1.4", "m17.7 17.7 1.4 1.4", "M2 12h2", "M20 12h2", "m6.3 17.7-1.4 1.4", "m19.1 4.9-1.4 1.4"],
  dashboard: ["M3 3h7v9H3z", "M14 3h7v5h-7z", "M14 12h7v9h-7z", "M3 16h7v5H3z"],
  file: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v5h5", "M9 13h6", "M9 17h4"],
  calendar: ["M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", "M16 2v4", "M8 2v4", "M3 10h18"],
  flask: ["M9 3h6", "M10 3v6.5L4.6 18.9A1.5 1.5 0 0 0 5.9 21.2h12.2a1.5 1.5 0 0 0 1.3-2.3L14 9.5V3", "M7.4 15h9.2"],
  pill: ["m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z", "m8.5 8.5 7 7"],
  box: ["M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z", "m3.3 7 8.7 5 8.7-5", "M12 22V12"],
  settings: ["M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 11 4.6V4.5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"],
  chevronRight: "m9 18 6-6-6-6",
  chevronDown: "m6 9 6 6 6-6",
  close: ["M18 6 6 18", "M6 6l12 12"],
  check: "M20 6 9 17l-5-5",
  arrowRight: ["M5 12h14", "m12 5 7 7-7 7"],
  plus: ["M12 5v14", "M5 12h14"],
  clock: ["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 7v5l3 2"],
  alert: ["M21.7 18 13.7 4a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z", "M12 9v4", "M12 17h.01"],
  stethoscope: ["M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3", "M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4", "M20 11m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
  cake: ["M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8", "M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1", "M2 21h20", "M7 8v3", "M12 8v3", "M17 8v3", "M7 4h.01", "M12 4h.01", "M17 4h.01"],
  venus: ["M12 9m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0", "M12 14v7", "M9 18h6"],
  mars: ["M10 14m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0", "M19 5l-5.4 5.4", "M15 5h4v4"],
  filter: "M22 3H2l8 9.5V19l4 2v-8.5L22 3Z",
  user: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"],
  dots: ["M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"],
  undo: ["M3 7v6h6", "M3.5 13a9 9 0 1 0 2.1-6.4L3 9"],
  message: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z",
  x: ["M18 6 6 18", "M6 6l12 12"],
};

function V2Icon({ name, size = 18, stroke = 1.8, color = "currentColor", style }) {
  const d = V2ICONS[name];
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

const F2D = "'Schibsted Grotesk', sans-serif";
const F2T = "'Inter', sans-serif";

const tone2 = (S, t) => S[t] || S.muted;
const stage2 = k => k === "no_vino" ? window.VX2.NO_VINO : window.VX2.STAGES.find(s => s.key === k);
const stageIdx2 = k => window.VX2.STAGES.findIndex(s => s.key === k);
const initials2 = n => n.replace(",", "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const shortName2 = n => n.includes(",") ? n.split(",")[0].trim() : n.split(" ").slice(-1)[0];

/* Chip de estado */
function Estado2({ S, estado, big }) {
  const m = stage2(estado); const c = tone2(S, m.tone);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: big ? "5px 12px" : "3px 9px",
      borderRadius: 999, background: c + "1A", color: c, fontSize: big ? 12.5 : 11.5, fontWeight: 700, whiteSpace: "nowrap", lineHeight: 1.5 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />{m.label}
    </span>
  );
}

/* Tag de procedimiento — tres tratamientos visuales */
function Proc2({ S, k, style: variant = "letra", size = "sm" }) {
  const p = window.VX2.PROCS[k]; if (!p) return null;
  const c = tone2(S, p.tone);
  const big = size === "lg";
  const fs = big ? 12.5 : 11.5;
  if (variant === "punto") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: fs, fontWeight: 600, color: S.muted, whiteSpace: "nowrap" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />{p.label}
      </span>
    );
  }
  if (variant === "solido") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", padding: big ? "4px 11px" : "3px 9px", borderRadius: 7,
        background: c, color: "#fff", fontSize: fs, fontWeight: 700, whiteSpace: "nowrap", lineHeight: 1.5 }}>{p.label}</span>
    );
  }
  return (
    <span title={p.detail} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: big ? "3px 11px 3px 4px" : "2px 9px 2px 3px",
      borderRadius: 999, background: c + "16", color: c, fontSize: fs, fontWeight: 600, whiteSpace: "nowrap", lineHeight: 1.6 }}>
      <span style={{ width: big ? 19 : 17, height: big ? 19 : 17, borderRadius: "50%", background: c, color: "#fff",
        display: "grid", placeItems: "center", fontSize: big ? 10.5 : 9.5, fontWeight: 800 }}>{p.letter}</span>
      {p.label}
    </span>
  );
}

/* Etiqueta de protocolo */
function ProtoTag2({ S, p, size = "sm" }) {
  const c = tone2(S, p.tone); const big = size === "lg";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: big ? "4px 12px" : "3px 10px", borderRadius: 7,
      background: c + "16", color: c, fontFamily: F2D, fontSize: big ? 15 : 13, fontWeight: 700, letterSpacing: ".01em", whiteSpace: "nowrap" }}>
      {p.name}
    </span>
  );
}

/* Mini ruta horizontal */
function Route2({ S, estado, w = 96 }) {
  const stages = window.VX2.STAGES;
  const ci = estado === "no_vino" ? -1 : stageIdx2(estado);
  return (
    <div style={{ display: "flex", alignItems: "center", width: w }}>
      {stages.map((s, i) => {
        const c = tone2(S, s.tone);
        const filled = ci >= 0 && i <= ci;
        return (
          <React.Fragment key={s.key}>
            <div style={{ width: i === ci ? 9 : 7, height: i === ci ? 9 : 7, borderRadius: "50%", flex: "0 0 auto",
              background: filled ? c : "transparent", border: `1.5px solid ${filled ? c : S.line2}`,
              boxShadow: i === ci ? `0 0 0 3px ${c}22` : "none" }} />
            {i < stages.length - 1 && <div style={{ flex: 1, height: 2, background: ci > i ? tone2(S, stages[i + 1].tone) : S.line, borderRadius: 2 }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* Persona a cargo */
function Persona2({ S, rol, nombre, icon }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: S.muted, whiteSpace: "nowrap" }}>
      <V2Icon name={icon} size={13} color={S.faint} />
      <span style={{ color: S.faint }}>{rol}</span>
      <span style={{ color: S.ink, fontWeight: 600 }}>{nombre}</span>
    </span>
  );
}

/* Filtro multi-selección */
function FilterMenu2({ S, label, icon, options, selected, onChange, width = 210 }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const n = selected.length;
  const active = n > 0;
  const toggle = val => onChange(selected.includes(val) ? selected.filter(x => x !== val) : [...selected, val]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ height: 36, padding: "0 12px", borderRadius: 10, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
          border: `1px solid ${active || open ? S.accent : S.line2}`, background: active ? S.accent + "12" : S.white,
          color: active ? S.accent : S.muted, fontFamily: F2T, fontWeight: 600, fontSize: 13 }}>
        {icon && <V2Icon name={icon} size={14} />}
        {label}
        {active && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: S.accent, color: "#fff",
          fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center" }}>{n}</span>}
        <V2Icon name="chevronDown" size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .16s" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: 42, left: 0, zIndex: 30, width, background: S.white, border: `1px solid ${S.line}`,
          borderRadius: 12, boxShadow: `0 14px 34px ${S.shadow}`, padding: 6, animation: "v2-menu .14s cubic-bezier(.2,.85,.25,1) both" }}>
          <div style={{ maxHeight: 264, overflow: "auto" }}>
            {options.map(o => {
              const on = selected.includes(o.value);
              return (
                <button key={o.value} onClick={() => toggle(o.value)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 9px", borderRadius: 8, border: "none",
                    background: on ? S.accent + "10" : "transparent", cursor: "pointer", textAlign: "left", fontFamily: F2T }}>
                  <span style={{ width: 16, height: 16, flex: "0 0 auto", borderRadius: 5, display: "grid", placeItems: "center",
                    border: `1.5px solid ${on ? S.accent : S.line2}`, background: on ? S.accent : "transparent" }}>
                    {on && <V2Icon name="check" size={11} color="#fff" stroke={3} />}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: on ? 600 : 500, color: on ? S.ink : S.muted, flex: 1 }}>{o.label}</span>
                  {o.hint && <span style={{ fontSize: 11.5, color: S.faint }}>{o.hint}</span>}
                </button>
              );
            })}
          </div>
          {n > 0 && (
            <button onClick={() => onChange([])}
              style={{ width: "100%", marginTop: 4, height: 30, borderRadius: 8, border: "none", borderTop: `1px solid ${S.line}`,
                background: "transparent", color: S.muted, cursor: "pointer", fontFamily: F2T, fontSize: 12.5, fontWeight: 600 }}>Limpiar</button>
          )}
        </div>
      )}
    </div>
  );
}

/* Selector simple (una opción) */
function PickMenu2({ S, label, icon, options, value, onChange, width = 190 }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const cur = options.find(o => o.value === value) || options[0];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ height: 36, padding: "0 12px", borderRadius: 10, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
          border: `1px solid ${open ? S.accent : S.line2}`, background: S.white, color: S.muted, fontFamily: F2T, fontWeight: 600, fontSize: 13 }}>
        {icon && <V2Icon name={icon} size={14} />}
        {label}<span style={{ color: S.ink }}>{cur.label}</span>
        <V2Icon name="chevronDown" size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .16s" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: 42, left: 0, zIndex: 30, width, background: S.white, border: `1px solid ${S.line}`,
          borderRadius: 12, boxShadow: `0 14px 34px ${S.shadow}`, padding: 6, animation: "v2-menu .14s cubic-bezier(.2,.85,.25,1) both" }}>
          {options.map(o => {
            const on = o.value === value;
            return (
              <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 9px", borderRadius: 8, border: "none",
                  background: on ? S.accent + "10" : "transparent", cursor: "pointer", textAlign: "left", fontFamily: F2T }}>
                <span style={{ width: 15, flex: "0 0 auto", display: "grid", placeItems: "center" }}>
                  {on && <V2Icon name="check" size={13} color={S.accent} stroke={2.6} />}
                </span>
                <span style={{ fontSize: 13, fontWeight: on ? 600 : 500, color: on ? S.ink : S.muted }}>{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  V2Icon, V2ICONS, F2D, F2T, tone2, stage2, stageIdx2, initials2, shortName2,
  Estado2, Proc2, ProtoTag2, Route2, Persona2, FilterMenu2, PickMenu2,
});
