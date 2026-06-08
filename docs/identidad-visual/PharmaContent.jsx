/* PharmaContent.jsx — real content for Spira Pharma (farmacia clínica).
   Renders a distinct view per submódulo. Themed with Pharma accent. */

const PH_ESTADOS = {
  pendiente:  { label: "Pendiente",          color: "#B0823F" },
  en_proceso: { label: "En proceso",         color: "#3A6B8C" },
  lista:      { label: "Lista para retirar", color: "#2E7D74" },
  entregada:  { label: "Entregada",          color: "#4E7A3F" },
};

function PharmaContent({ S, sub, accent }) {
  const D = S.pharmaData;
  const card = (extra) => ({ background: S.white, border: `1px solid ${S.line}`, borderRadius: 16, padding: "18px 20px", ...extra });
  const wrap = { flex: 1, margin: "12px 26px 22px", minHeight: 0, display: "flex", flexDirection: "column", gap: 14 };
  const k = sub ? sub.key : "resumen";

  const Chip = ({ color, children }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color, whiteSpace: "nowrap",
                   background: color + "16", padding: "3px 10px", borderRadius: 99 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />{children}
    </span>
  );
  const medBadge = (e) => {
    if (e === "vencido") return <Chip color={S.danger}>Vencido</Chip>;
    if (e === "bajo") return <Chip color={S.warn}>Stock bajo</Chip>;
    return <span style={{ fontSize: 12, color: S.faint }}>OK</span>;
  };

  /* ---------- RESUMEN ---------- */
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
          <div style={{ ...card(), display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 16 }}>Cola de dispensaciones</span>
              <span style={{ fontSize: 12.5, color: S.muted }}>Hoy · {D.queue.length}</span>
            </div>
            <div style={{ marginTop: 12 }}>
              {D.queue.map((q, i) => {
                const e = PH_ESTADOS[q.estado];
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 1fr 84px 150px", alignItems: "center",
                                         padding: "11px 0", borderTop: i ? `1px solid ${S.line}` : "none" }}>
                    <span style={{ fontFamily: S.mono, fontSize: 12.5, color: accent }}>{q.id}</span>
                    <span style={{ fontSize: 13.5, whiteSpace: "nowrap" }}>{q.paciente} <span style={{ color: S.faint }}>· {q.proto}</span></span>
                    <span style={{ fontSize: 12.5, color: S.muted, fontVariantNumeric: "tabular-nums" }}>{q.hora}</span>
                    <span><Chip color={e.color}>{e.label}</Chip></span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ ...card(), display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 16 }}>Alertas</span>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {D.meds.filter((m) => m.estado !== "ok").map((m, i) => {
                const c = m.estado === "vencido" ? S.danger : S.warn;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderRadius: 11,
                                         background: c + "0E", border: `1px solid ${c}30` }}>
                    <Icon name={m.estado === "vencido" ? "alert" : "clock"} size={18} color={c} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.nombre}</div>
                      <div style={{ fontSize: 12, color: S.muted }}>{m.proto} · lote {m.lote} · {m.estado === "vencido" ? "vence " + m.vto : "stock " + m.stock}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: "auto", paddingTop: 14, fontSize: 11.5, color: S.faint }}>
              Sponsors activos: Roche · Novartis · AstraZeneca
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- DISPENSACIONES ---------- */
  if (k === "dispensaciones") {
    const counts = Object.keys(PH_ESTADOS).map((key) => ({ key, n: D.queue.filter((q) => q.estado === key).length, ...PH_ESTADOS[key] }));
    return (
      <div style={wrap}>
        <div style={{ display: "flex", gap: 10 }}>
          {counts.map((c) => (
            <div key={c.key} style={{ ...card({ padding: "12px 16px" }), flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
              <div>
                <div style={{ fontSize: 12.5, color: S.muted }}>{c.label}</div>
                <div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 22 }}>{c.n}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ ...card({ padding: 0 }), flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 90px 170px 40px", padding: "12px 18px",
                        background: S.surface, borderBottom: `1px solid ${S.line}`, fontSize: 11, letterSpacing: "0.04em",
                        textTransform: "uppercase", color: S.muted, fontWeight: 700 }}>
            <span>ID</span><span>Paciente</span><span>Protocolo</span><span>Hora</span><span>Estado</span><span></span>
          </div>
          {D.queue.map((q, i) => {
            const e = PH_ESTADOS[q.estado];
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 90px 170px 40px", padding: "13px 18px",
                                     alignItems: "center", borderTop: i ? `1px solid ${S.line}` : "none", fontSize: 13.5 }}>
                <span style={{ fontFamily: S.mono, fontSize: 12.5, color: accent }}>{q.id}</span>
                <span>{q.paciente}</span>
                <span style={{ color: S.muted }}>{q.proto}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: S.muted }}>{q.hora}</span>
                <span><Chip color={e.color}>{e.label}</Chip></span>
                <span><button style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }}><Icon name="chevronRight" size={16} color={S.faint} /></button></span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---------- MEDICAMENTOS ---------- */
  if (k === "medicamentos") {
    return (
      <div style={wrap}>
        <div style={{ ...card({ padding: 0 }), flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 90px 90px 90px 80px 110px", padding: "12px 18px",
                        background: S.surface, borderBottom: `1px solid ${S.line}`, fontSize: 11, letterSpacing: "0.04em",
                        textTransform: "uppercase", color: S.muted, fontWeight: 700 }}>
            <span>Medicamento</span><span>Protocolo</span><span>Lote</span><span>Vence</span><span>Stock</span><span>Estado</span>
          </div>
          {D.meds.map((m, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 90px 90px 90px 80px 110px", padding: "13px 18px",
                                   alignItems: "center", borderTop: i ? `1px solid ${S.line}` : "none", fontSize: 13.5 }}>
              <span style={{ fontWeight: 500 }}>{m.nombre}</span>
              <span style={{ fontFamily: S.mono, fontSize: 12.5, color: S.muted }}>{m.proto}</span>
              <span style={{ fontFamily: S.mono, fontSize: 12.5, color: S.muted }}>{m.lote}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: m.estado === "vencido" ? S.danger : S.ink }}>{m.vto}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{m.stock}</span>
              <span>{medBadge(m.estado)}</span>
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
          <div style={{ display: "grid", gridTemplateColumns: "110px 110px 1fr 120px", padding: "12px 18px",
                        background: S.surface, borderBottom: `1px solid ${S.line}`, fontSize: 11, letterSpacing: "0.04em",
                        textTransform: "uppercase", color: S.muted, fontWeight: 700 }}>
            <span>Paciente</span><span>Protocolo</span><span>Medicación asignada</span><span>Estado</span>
          </div>
          {D.patients.map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 110px 1fr 120px", padding: "13px 18px",
                                   alignItems: "center", borderTop: i ? `1px solid ${S.line}` : "none", fontSize: 13.5 }}>
              <span style={{ fontFamily: S.mono, fontSize: 12.5, color: accent }}>{p.code}</span>
              <span style={{ fontFamily: S.mono, fontSize: 12.5, color: S.muted }}>{p.proto}</span>
              <span>{p.med}</span>
              <span>{p.activo ? <Chip color={S.good}>Activo</Chip> : <span style={{ fontSize: 12, color: S.faint }}>Inactivo</span>}</span>
            </div>
          ))}
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
                <span style={{ fontFamily: S.mono, fontSize: 13, color: accent, fontWeight: 500 }}>{p.code}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: S.muted, background: S.surface, border: `1px solid ${S.line}`, padding: "2px 9px", borderRadius: 99 }}>{p.sponsor}</span>
              </div>
              <div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 18, marginTop: 10 }}>{p.ensayo}</div>
              <div style={{ display: "flex", gap: 22, marginTop: 16 }}>
                <div><div style={{ fontSize: 11.5, color: S.muted }}>Pacientes</div><div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 22 }}>{p.pacientes}</div></div>
                <div><div style={{ fontSize: 11.5, color: S.muted }}>Medicamentos</div><div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 22 }}>{p.meds}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- REPORTES ---------- */
  const reports = [
    { t: "Comprobante de dispensación", d: "Por dispensación individual" },
    { t: "Reporte de dispensaciones", d: "Período filtrable" },
    { t: "Reporte de stock", d: "Por protocolo · badges Vencido / Stock bajo" },
    { t: "Informe de facturación al sponsor", d: "Resumen por medicamento + detalle" },
  ];
  return (
    <div style={wrap}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {reports.map((r, i) => (
          <div key={i} style={{ ...card(), display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 42, height: 42, borderRadius: 11, background: accent + "16", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
              <Icon name="file" size={20} color={accent} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 15.5 }}>{r.t}</div>
              <div style={{ fontSize: 12.5, color: S.muted, marginTop: 2 }}>{r.d}</div>
            </div>
            <button style={{ marginLeft: "auto", height: 38, padding: "0 14px", border: `1px solid ${S.line2}`, borderRadius: 9,
                             background: S.white, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, fontFamily: S.fontText, fontSize: 13, color: S.ink }}>
              <Icon name="arrowRight" size={15} color={S.muted} /> Generar
            </button>
          </div>
        ))}
      </div>
      <div style={{ ...card(), fontSize: 12.5, color: S.muted, display: "flex", alignItems: "center", gap: 9 }}>
        <Icon name="shield" size={15} color={S.muted} /> Documentos en papel oficial de la Fundación · listos para imprimir.
      </div>
    </div>
  );
}
window.PharmaContent = PharmaContent;
