/* TrackContent.jsx — real content for Spira Track (CliniTrack · gestión de visitas).
   One view per submódulo. Themed with Track accent (teal). */

const TK_ESTADOS = {
  futura:          { label: "Futura",          color: "#7C8C87" },
  proxima:         { label: "Próxima",         color: "#2E7D74" },
  realizada:       { label: "Realizada",       color: "#3A6B8C" },
  completa:        { label: "Completa",        color: "#4E7A3F" },
  item_vencido:    { label: "Ítem vencido",    color: "#B0823F" },
  ventana_vencida: { label: "Ventana vencida", color: "#A6483B" },
};

function TrackContent({ S, sub, accent }) {
  const D = S.trackData;
  const card = (extra) => ({ background: S.white, border: `1px solid ${S.line}`, borderRadius: 16, padding: "18px 20px", ...extra });
  const wrap = { flex: 1, margin: "12px 26px 22px", minHeight: 0, display: "flex", flexDirection: "column", gap: 14 };
  const k = sub ? sub.key : "resumen";

  const Chip = ({ estado }) => {
    const e = TK_ESTADOS[estado] || TK_ESTADOS.futura;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: e.color, whiteSpace: "nowrap",
                     background: e.color + "16", padding: "3px 10px", borderRadius: 99 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: e.color }} />{e.label}
      </span>
    );
  };

  /* ---------- RESUMEN (Dashboard) ---------- */
  if (k === "resumen") {
    return (
      <div style={wrap}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
          {D.stats.map((st, i) => {
            const c = st.tone === "danger" ? S.danger : st.tone === "warn" ? S.warn : accent;
            return (
              <div key={i} style={card()}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: S.muted }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{st.label}
                </div>
                <div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 38, letterSpacing: "-0.02em", marginTop: 6 }}>{st.value}</div>
                <div style={{ fontSize: 12.5, color: S.faint, marginTop: 2 }}>{st.sub}</div>
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, minHeight: 0 }}>
          {/* próximas visitas 7 días agrupadas por día */}
          <div style={{ ...card(), display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 16 }}>Próximas visitas · 7 días</span>
              <span style={{ fontSize: 12.5, color: S.muted }}>agrupadas por día</span>
            </div>
            <div style={{ marginTop: 6, overflow: "auto" }}>
              {D.upcoming.map((g, gi) => (
                <div key={gi}>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: S.faint, fontWeight: 700, padding: "12px 0 6px" }}>{g.dia}</div>
                  {g.visitas.map((v, vi) => (
                    <div key={vi} style={{ display: "grid", gridTemplateColumns: "1fr 96px 64px 124px", alignItems: "center", padding: "9px 0", borderTop: `1px solid ${S.line}` }}>
                      <span style={{ fontSize: 13.5 }}>{v.paciente} <span style={{ color: S.faint }}>· {v.proto}</span></span>
                      <span style={{ fontSize: 12.5, color: S.muted }}>{v.tipo}</span>
                      <span style={{ fontSize: 12.5, color: S.muted, fontVariantNumeric: "tabular-nums" }}>{v.hora}</span>
                      <span><Chip estado={v.estado} /></span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {/* alertas */}
          <div style={{ ...card(), display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 16 }}>Alertas</span>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {D.alerts.map((a, i) => {
                const c = TK_ESTADOS[a.estado].color;
                return (
                  <div key={i} style={{ display: "flex", gap: 11, padding: "12px 13px", borderRadius: 11, background: c + "0E", border: `1px solid ${c}30` }}>
                    <Icon name={a.estado === "ventana_vencida" ? "alert" : "clock"} size={18} color={c} style={{ flex: "0 0 auto", marginTop: 1 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.paciente} <span style={{ color: S.faint, fontWeight: 400 }}>· {a.proto}</span></div>
                      <div style={{ fontSize: 12.5, color: S.muted, marginTop: 2, lineHeight: 1.4 }}>{a.motivo}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: "auto", paddingTop: 14, fontSize: 11.5, color: S.faint }}>
              Ventana vencida (roja) · Ítem vencido (amarilla)
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- PROTOCOLOS ---------- */
  if (k === "protocolos") {
    return (
      <div style={wrap}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          {D.protocols.map((p, i) => (
            <div key={i} style={card()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 20, letterSpacing: "-0.01em", color: accent }}>{p.code}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: S.muted, background: S.surface, border: `1px solid ${S.line}`, padding: "2px 9px", borderRadius: 99 }}>{p.sponsor}</span>
              </div>
              <div style={{ fontSize: 13.5, color: S.muted, marginTop: 8 }}>{p.fase}</div>
              <div style={{ display: "flex", gap: 22, marginTop: 18 }}>
                <div><div style={{ fontSize: 11.5, color: S.muted }}>Pacientes</div><div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 24 }}>{p.pacientes}</div></div>
                <div><div style={{ fontSize: 11.5, color: S.muted }}>Visitas/protocolo</div><div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 24 }}>{p.visitas}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- PACIENTES ---------- */
  if (k === "pacientes") {
    return (
      <div style={wrap}>
        <div style={{ ...card({ padding: 0 }), flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px 100px 140px", padding: "12px 18px", background: S.surface, borderBottom: `1px solid ${S.line}`, fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: S.muted, fontWeight: 700 }}>
            <span>Código</span><span>Paciente</span><span>Protocolo</span><span>Próxima</span><span>Estado</span>
          </div>
          {D.patients.map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px 100px 140px", padding: "13px 18px", alignItems: "center", borderTop: i ? `1px solid ${S.line}` : "none", fontSize: 13.5 }}>
              <span style={{ fontFamily: S.mono, fontSize: 12.5, color: accent }}>{p.code}</span>
              <span>{p.nombre} <span style={{ color: S.faint, fontSize: 12 }}>· enrol. {p.enrol}</span></span>
              <span style={{ color: S.muted }}>{p.proto}</span>
              <span style={{ color: S.muted, fontVariantNumeric: "tabular-nums" }}>{p.prox}</span>
              <span><Chip estado={p.estado} /></span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- AGENDA (semanal Lun–Vie) ---------- */
  if (k === "agenda") {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${S.line2}`, background: S.white, cursor: "pointer", display: "grid", placeItems: "center" }}><Icon name="chevronRight" size={16} color={S.muted} style={{ transform: "rotate(180deg)" }} /></button>
          <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 16 }}>Semana del 03 al 07 de junio</span>
          <button style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${S.line2}`, background: S.white, cursor: "pointer", display: "grid", placeItems: "center" }}><Icon name="chevronRight" size={16} color={S.muted} /></button>
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, minHeight: 0 }}>
          {D.week.map((d, i) => (
            <div key={i} style={{ ...card({ padding: "12px 12px" }), display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: S.ink, paddingBottom: 10, borderBottom: `1px solid ${S.line}` }}>{d.dia}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10, overflow: "auto" }}>
                {d.visitas.length === 0 && <div style={{ fontSize: 12, color: S.faint, padding: "4px 0" }}>Sin visitas</div>}
                {d.visitas.map((v, vi) => {
                  const c = TK_ESTADOS[v.estado].color;
                  return (
                    <div key={vi} style={{ borderRadius: 10, border: `1px solid ${c}30`, background: c + "0E", padding: "9px 10px" }}>
                      <div style={{ fontFamily: S.mono, fontSize: 12, color: c, fontWeight: 500 }}>{v.p}</div>
                      <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>{v.t}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- PLANTILLAS (checklist) ---------- */
  const T = D.template;
  return (
    <div style={wrap}>
      <div style={{ ...card(), flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 16 }}>{T.visita}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: accent, background: accent + "14", padding: "3px 10px", borderRadius: 99 }}>{T.proto}</span>
          <span style={{ marginLeft: "auto", fontSize: 12.5, color: S.muted }}>{T.items.length} ítems</span>
        </div>
        <div style={{ marginTop: 14, overflow: "auto" }}>
          {T.items.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 0", borderTop: i ? `1px solid ${S.line}` : "none" }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${S.line2}`, flex: "0 0 auto" }} />
              <span style={{ fontSize: 14, flex: 1 }}>{it.txt}</span>
              <span style={{ fontFamily: S.mono, fontSize: 12, color: it.plazo === "0 h" ? S.muted : S.warn, background: S.surface, border: `1px solid ${S.line}`, padding: "3px 9px", borderRadius: 99 }}>
                plazo {it.plazo}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.TrackContent = TrackContent;
