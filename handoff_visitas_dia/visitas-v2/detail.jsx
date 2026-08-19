/* detail.jsx — modal / panel de detalle de una visita (v2). */

function Card2({ S, title, right, children, pad = "16px 18px" }) {
  return (
    <div style={{ background: S.white, border: `1px solid ${S.line}`, borderRadius: 14, padding: pad }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontFamily: F2D, fontWeight: 700, fontSize: 15.5, color: S.ink }}>{title}</span>
          <span style={{ marginLeft: "auto" }}>{right}</span>
        </div>
      )}
      {children}
    </div>
  );
}

function DataRow2({ S, label, children, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${S.line}` }}>
      {icon && <V2Icon name={icon} size={15} color={S.faint} style={{ flex: "0 0 auto" }} />}
      <span style={{ fontSize: 12.5, color: S.muted }}>{label}</span>
      <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: S.ink, textAlign: "right" }}>{children}</span>
    </div>
  );
}

/* Ruta vertical con acción */
function RouteV2({ S, v, onAdvance, onNoVino }) {
  const stages = window.VX2.STAGES;
  const ci = v.estado === "no_vino" ? -1 : stageIdx2(v.estado);
  const act = nextAct2(v);
  return (
    <Card2 S={S} title="Ruta en el sitio" right={<Estado2 S={S} estado={v.estado} />}>
      {v.estado === "no_vino" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", borderRadius: 11, background: S.danger + "10" }}>
          <V2Icon name="alert" size={17} color={S.danger} />
          <span style={{ fontSize: 13, color: S.ink, flex: 1 }}>El paciente no se presentó. La visita queda pendiente de reprogramación.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {stages.map((s, i) => {
            const c = tone2(S, s.tone), done = i < ci, cur = i === ci, last = i === stages.length - 1;
            return (
              <div key={s.key} style={{ display: "flex", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", flex: "0 0 auto", display: "grid", placeItems: "center",
                    background: done ? c : cur ? S.white : S.surface, border: `2px solid ${done || cur ? c : S.line2}`,
                    boxShadow: cur ? `0 0 0 4px ${c}22` : "none" }}>
                    {done ? <V2Icon name="check" size={13} color="#fff" stroke={2.6} />
                      : <span style={{ width: 6, height: 6, borderRadius: "50%", background: cur ? c : S.line2 }} />}
                  </div>
                  {!last && <div style={{ flex: 1, width: 2, minHeight: 12, background: done ? c : S.line, margin: "2px 0" }} />}
                </div>
                <div style={{ paddingBottom: last ? 0 : 12, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: cur ? 700 : 600, color: done || cur ? S.ink : S.faint }}>{s.label}</div>
                  <div style={{ fontSize: 11.5, color: S.muted }}>{done ? "Completado" : cur ? "Etapa actual" : "Pendiente"}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {v.estado === "no_vino" ? (
          <button onClick={() => onAdvance(v, { to: "por_llegar" })}
            style={{ flex: 1, height: 42, borderRadius: 11, border: `1px solid ${S.line2}`, background: S.white, color: S.ink,
              cursor: "pointer", fontFamily: F2T, fontWeight: 600, fontSize: 13.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <V2Icon name="undo" size={15} />Deshacer "no vino"
          </button>
        ) : act ? (
          <>
            <button onClick={() => onAdvance(v, act)}
              style={{ flex: 1, height: 42, borderRadius: 11, border: "none", background: S.accent, color: "#fff", cursor: "pointer",
                boxShadow: `0 2px 10px ${S.accent}40`, fontFamily: F2T, fontWeight: 700, fontSize: 13.5,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {act.label}<V2Icon name="arrowRight" size={15} color="#fff" />
            </button>
            {v.estado === "por_llegar" && (
              <button onClick={() => onNoVino(v.id)}
                style={{ flex: "0 0 auto", height: 42, padding: "0 15px", borderRadius: 11, border: `1px solid ${S.line2}`, background: S.white,
                  color: S.muted, cursor: "pointer", fontFamily: F2T, fontWeight: 600, fontSize: 13.5 }}>No vino</button>
            )}
          </>
        ) : (
          <div style={{ flex: 1, height: 42, borderRadius: 11, background: S.good + "14", color: S.good,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}>
            <V2Icon name="check" size={15} color={S.good} />Visita finalizada
          </div>
        )}
      </div>
    </Card2>
  );
}

/* Procedimientos de la visita */
function Procs2({ S, v, onToggleProc }) {
  const done = v.procsDone || [];
  return (
    <Card2 S={S} title="Procedimientos de la visita"
      right={<span style={{ fontSize: 12.5, fontWeight: 600, color: S.muted, fontVariantNumeric: "tabular-nums" }}>{done.length}/{v.procs.length}</span>}>
      {v.procs.length === 0 ? (
        <div style={{ fontSize: 12.5, color: S.faint }}>Esta visita no lleva procedimientos.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {v.procs.map(k => {
            const p = window.VX2.PROCS[k], c = tone2(S, p.tone), on = done.includes(k);
            return (
              <button key={k} onClick={() => onToggleProc(v.id, k)}
                style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 11, cursor: "pointer", textAlign: "left",
                  border: `1px solid ${on ? c + "55" : S.line}`, background: on ? c + "0D" : S.surface, fontFamily: F2T, transition: "background .15s, border-color .15s" }}>
                <span style={{ width: 26, height: 26, flex: "0 0 auto", borderRadius: 8, background: c + (on ? "" : "1F"), color: on ? "#fff" : c,
                  display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800 }}>
                  {on ? <V2Icon name="check" size={14} color="#fff" stroke={2.6} /> : p.letter}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: S.ink }}>{p.label}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: S.muted }}>{p.detail}</span>
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: on ? c : S.faint }}>{on ? "Hecho" : "Pendiente"}</span>
              </button>
            );
          })}
        </div>
      )}
    </Card2>
  );
}

function roleC2(S, role) {
  return role === "Médico" ? S.accent : role === "Enfermería" ? S.blue : role === "Recepción" ? S.gold : S.violet;
}

function Comments2({ S, v, onAdd }) {
  const [txt, setTxt] = React.useState("");
  const send = () => { const t = txt.trim(); if (!t) return; onAdd(v.id, t); setTxt(""); };
  return (
    <Card2 S={S} title="Comentarios" right={<span style={{ fontSize: 12.5, fontWeight: 600, color: S.muted }}>{v.comments.length}</span>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {v.comments.length === 0 && <div style={{ fontSize: 12.5, color: S.faint }}>Sin comentarios todavía.</div>}
        {v.comments.map(c => {
          const rc = roleC2(S, c.role);
          return (
            <div key={c.id} style={{ display: "flex", gap: 10 }}>
              <div style={{ width: 28, height: 28, flex: "0 0 auto", borderRadius: "50%", background: rc + "1F", color: rc,
                display: "grid", placeItems: "center", fontWeight: 700, fontSize: 10.5 }}>{c.initials}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: S.ink }}>{c.author}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: rc, background: rc + "18", padding: "1px 6px", borderRadius: 5 }}>{c.role}</span>
                  <span style={{ fontSize: 11, color: S.faint, marginLeft: "auto" }}>{c.at}</span>
                </div>
                <div style={{ fontSize: 13, color: S.ink, marginTop: 4, lineHeight: 1.5, background: S.surface, border: `1px solid ${S.line}`, borderRadius: 10, padding: "8px 11px" }}>{c.txt}</div>
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, borderTop: `1px solid ${S.line}`, paddingTop: 12 }}>
          <input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); e.stopPropagation(); }}
            placeholder="Escribir un comentario…"
            style={{ flex: 1, height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${S.line2}`, background: S.surface,
              color: S.ink, fontFamily: F2T, fontSize: 13, outline: "none" }} />
          <button onClick={send} disabled={!txt.trim()}
            style={{ height: 36, padding: "0 14px", borderRadius: 10, border: "none", cursor: txt.trim() ? "pointer" : "not-allowed",
              background: txt.trim() ? S.accent : S.line, color: txt.trim() ? "#fff" : S.faint, fontFamily: F2T, fontWeight: 600, fontSize: 13 }}>Enviar</button>
        </div>
      </div>
    </Card2>
  );
}

/* ====================== DETALLE ====================== */
function Detail2({ S, v, mode, anim, tagStyle, onClose, onPrev, onNext, pos, handlers }) {
  const [leaving, setLeaving] = React.useState(false);
  const close = React.useCallback(() => { setLeaving(true); setTimeout(onClose, 180); }, [onClose]);
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape") close();
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); onNext(); }
      if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); onPrev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, onNext, onPrev]);
  if (!v) return null;

  const p = window.VX2.proto(v.protoId);
  const drawer = mode === "panel";
  const PRE = {
    suave:   { dur: drawer ? .32 : .24, ease: "cubic-bezier(.2,.85,.25,1)",  kf: "v2-pop" },
    resorte: { dur: drawer ? .5 : .42,  ease: "cubic-bezier(.18,1.3,.32,1)", kf: "v2-spring" },
    rapido:  { dur: drawer ? .16 : .13, ease: "cubic-bezier(.4,0,.2,1)",     kf: "v2-fast" },
  };
  const P = PRE[anim] || PRE.suave;
  const inA = drawer ? "v2-drawer-in" : P.kf, outA = drawer ? "v2-drawer-out" : "v2-out";
  const panel = drawer
    ? { position: "absolute", top: 0, right: 0, height: "100%", width: "min(620px, 96vw)", borderRadius: "20px 0 0 20px" }
    : { width: "min(1020px, 95vw)", maxHeight: "90vh", borderRadius: 20, margin: "auto" };

  const NavBtn = ({ dir, fn }) => (
    <button onClick={fn} title={dir < 0 ? "Visita anterior (↑)" : "Visita siguiente (↓)"}
      style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${S.line}`, background: S.white, cursor: "pointer",
        display: "grid", placeItems: "center", color: S.muted }}>
      <V2Icon name="chevronDown" size={16} style={{ transform: dir < 0 ? "rotate(180deg)" : "none" }} />
    </button>
  );

  return (
    <div onMouseDown={close} style={{ position: "absolute", inset: 0, zIndex: 60, background: S.scrim,
      display: "flex", alignItems: drawer ? "stretch" : "center", justifyContent: drawer ? "flex-end" : "center",
      padding: drawer ? 0 : 22, animation: `${leaving ? "v2-scrim-out" : "v2-scrim"} .18s ease both` }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ ...panel, background: S.paper, border: `1px solid ${S.line}`,
        boxShadow: `0 28px 70px ${S.scrim}`, display: "flex", flexDirection: "column", overflow: "hidden",
        animation: `${leaving ? outA : inA} ${leaving ? .18 : P.dur}s ${P.ease} both` }}>

        {/* Header: protocolo manda */}
        <div style={{ padding: "18px 22px 16px", background: S.white, borderBottom: `1px solid ${S.line}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <span style={{ width: 4, alignSelf: "stretch", borderRadius: 3, background: tone2(S, stage2(v.estado).tone) }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 11, flexWrap: "wrap" }}>
                <span style={{ fontFamily: F2D, fontSize: 28, fontWeight: 700, letterSpacing: "-.02em", color: S.ink, lineHeight: 1.1 }}>{p.name}</span>
                <span style={{ fontSize: 13, color: S.faint, fontVariantNumeric: "tabular-nums" }}>{p.code} · {p.phase} · {p.area}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: S.ink }}>{v.patient.name}</span>
                <span style={{ fontSize: 13, color: S.muted, fontVariantNumeric: "tabular-nums" }}>#{v.patient.num}</span>
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: S.line2 }} />
                <span style={{ padding: "2px 9px", borderRadius: 6, background: S.ink, color: S.paper, fontSize: 11.5, fontWeight: 800 }}>{v.visitTag}</span>
                <span style={{ fontSize: 13, color: S.muted }}>{v.visitName}</span>
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: S.line2 }} />
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: S.muted, fontVariantNumeric: "tabular-nums" }}>
                  <V2Icon name="clock" size={14} color={S.faint} />{v.time}
                </span>
                <Estado2 S={S} estado={v.estado} big />
                <DocFlag2 S={S} v={v} />
              </div>
              <div style={{ display: "flex", gap: 7, marginTop: 11, flexWrap: "wrap" }}>
                {v.procs.map(k => <Proc2 key={k} S={S} k={k} style={tagStyle} size="lg" />)}
                {v.procs.length === 0 && <span style={{ fontSize: 12.5, color: S.faint }}>Sin procedimientos</span>}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
              <span style={{ fontSize: 12, color: S.faint, fontVariantNumeric: "tabular-nums", marginRight: 2 }}>{pos}</span>
              <NavBtn dir={-1} fn={onPrev} /><NavBtn dir={1} fn={onNext} />
              <button onClick={close} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${S.line}`, background: S.white,
                cursor: "pointer", display: "grid", placeItems: "center", marginLeft: 4 }}>
                <V2Icon name="close" size={16} color={S.muted} />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 18, overflow: "auto", display: "grid", gap: 14,
          gridTemplateColumns: drawer ? "1fr" : "minmax(0,1fr) minmax(0,1fr)", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <RouteV2 S={S} v={v} onAdvance={handlers.advance} onNoVino={handlers.noVino} />
            <Card2 S={S} title="A cargo">
              <div style={{ display: "flex", flexDirection: "column" }}>
                <DataRow2 S={S} label="Coordinador" icon="user">{v.coordinador}</DataRow2>
                <DataRow2 S={S} label="Médico a cargo" icon="stethoscope">{v.medico}</DataRow2>
                {v.wantsDoctor && <DataRow2 S={S} label="Atención médica" icon="alert">
                  {v.doctorSeen ? <span style={{ color: S.good }}>Visto {v.doctorSeenAt}</span> : <span style={{ color: S.accent }}>{v.doctorMotivo || "Esperando"}</span>}
                </DataRow2>}
              </div>
              {!v.doctorSeen && (
                <button onClick={() => handlers.toggleDoctor(v.id)}
                  style={{ width: "100%", height: 38, marginTop: 12, borderRadius: 10, cursor: "pointer", fontFamily: F2T, fontWeight: 600, fontSize: 13,
                    border: `1px solid ${v.wantsDoctor ? S.line2 : S.accent}`, background: v.wantsDoctor ? S.white : S.accent + "10",
                    color: v.wantsDoctor ? S.muted : S.accent, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <V2Icon name="users" size={15} />{v.wantsDoctor ? "Quitar de Para ver médico" : "Marcar que quiere médico"}
                </button>
              )}
            </Card2>
            <Card2 S={S} title="Paciente">
              <div style={{ display: "flex", flexDirection: "column" }}>
                <DataRow2 S={S} label="Sexo" icon={v.patient.sex === "Femenino" ? "venus" : "mars"}>{v.patient.sex}</DataRow2>
                <DataRow2 S={S} label="Edad" icon="clock">{v.patient.age} años</DataRow2>
                <DataRow2 S={S} label="Nacimiento" icon="cake"><span style={{ fontVariantNumeric: "tabular-nums" }}>{v.patient.dob}</span></DataRow2>
                <DataRow2 S={S} label="Potencial fértil" icon="activity">{v.patient.fertile ? "Sí" : "No"}</DataRow2>
              </div>
            </Card2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Procs2 S={S} v={v} onToggleProc={handlers.toggleProc} />
            <Comments2 S={S} v={v} onAdd={handlers.addComment} />
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Detail2, Card2, DataRow2, RouteV2, Procs2, Comments2, roleC2 });
