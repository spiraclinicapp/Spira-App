/* spiraShared2.jsx — shared pieces for the merged shell: B-style split login,
   module icon rail, two-level nav state, and the bento dashboard content.
   Variants differ ONLY in nav chrome; content + login are shared. */

function useShellState(defaultModule) {
  const S = window.SPIRA;
  const [screen, setScreen] = React.useState("login");
  const [moduleKey, setModuleKey] = React.useState(defaultModule || "track");
  const [subKey, setSubKey] = React.useState((S.submodules[defaultModule || "track"][0] || {}).key);
  const mod = S.modules.find((m) => m.key === moduleKey);
  const subs = S.submodules[moduleKey] || [];
  const setModule = (k) => {
    const m = S.modules.find((x) => x.key === k);
    if (!m || !m.allowed) return;
    setModuleKey(k);
    const s = S.submodules[k] || [];
    setSubKey(s[0] && s[0].key);
  };
  const sub = subs.find((s) => s.key === subKey) || subs[0];
  return { S, screen, setScreen, mod, moduleKey, setModule, subs, sub, subKey, setSubKey };
}

function Avatar({ S, accent, size = 36 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: accent,
                  display: "grid", placeItems: "center", fontFamily: S.fontDisp, fontWeight: 700,
                  fontSize: size * 0.36, flex: "0 0 auto", color: S.onAccent }}>
      {S.user.initials}
    </div>
  );
}

/* ---- B-style split login (shared) ---- */
function SharedLoginB({ S, onEnter }) {
  return (
    <div style={{ height: "100%", display: "flex", fontFamily: S.fontText, color: S.ink, background: S.white }}>
      <div style={{ flex: "0 0 46%", background: S.primary, color: S.onAccent, padding: "48px 52px",
                    display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Vilano1 size={66} color={S.onAccent} />
          <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 44, letterSpacing: "-0.02em" }}>Spira</span>
        </div>
        <div>
          <div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
            Respirá tranquilidad<br />en cada ensayo.
          </div>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "rgba(244,241,234,.78)", maxWidth: 360, marginTop: 16 }}>
            Trazabilidad completa de tus estudios clínicos, en un solo lugar.
          </p>
        </div>
        <div style={{ fontSize: 11.5, color: "rgba(244,241,234,.6)", display: "flex", gap: 8, alignItems: "center" }}>
          <Icon name="shield" size={14} color="rgba(244,241,234,.6)" /> Datos cifrados
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 320 }}>
          <div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Acceso al sistema</div>
          <div style={{ fontSize: 13.5, color: S.muted, marginTop: 4 }}>Ingresá con tu cuenta institucional</div>
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 13 }}>
            {[["Correo", "lucia.mendez@ccba.org", "text"], ["Contraseña", "passwordpass", "password"]].map(([l, v, t]) => (
              <div key={l}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>{l}</div>
                <input defaultValue={v} type={t} readOnly
                  style={{ width: "100%", height: 42, padding: "0 13px", boxSizing: "border-box", border: `1px solid ${S.line2}`,
                           borderRadius: 8, background: S.surface, fontFamily: S.fontText, fontSize: 13.5, color: S.ink, outline: "none" }} />
              </div>
            ))}
          </div>
          <button onClick={onEnter}
            style={{ marginTop: 20, width: "100%", height: 44, border: "none", borderRadius: 8, background: S.primary,
                     color: S.onAccent, fontFamily: S.fontText, fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}>
            Ingresar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- module icon rail (shared by V1 & V2) ---- */
function IconRail({ S, moduleKey, setModule, onLogout, onGear, width = 72 }) {
  return (
    <aside style={{ width, flex: `0 0 ${width}px`, background: S.white, borderRight: `1px solid ${S.line}`,
                    display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 0", gap: 6 }}>
      <div style={{ marginBottom: 12 }}><Vilano1 size={32} color={S.primary} /></div>
      {S.modules.map((m) => {
        const on = m.key === moduleKey;
        const locked = !m.allowed;
        return (
          <button key={m.key} onClick={() => setModule(m.key)} disabled={locked} title={m.full}
            style={{ width: 46, height: 46, borderRadius: 12, border: "none", cursor: locked ? "default" : "pointer",
                     background: on ? m.accent + "18" : "transparent", display: "grid", placeItems: "center" }}>
            <Icon name={locked ? "lock" : m.icon} size={21} stroke={1.9}
                  color={locked ? S.faint : on ? m.accent : S.muted} />
          </button>
        );
      })}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {onGear && (
          <button onClick={onGear} title="Ajustes"
            style={{ width: 46, height: 46, borderRadius: 12, border: "none", background: "transparent",
                     cursor: "pointer", display: "grid", placeItems: "center" }}>
            <Icon name="settings" size={19} color={S.muted} />
          </button>
        )}
        <button onClick={onLogout} title="Salir"
          style={{ width: 46, height: 46, borderRadius: 12, border: "none", background: "transparent",
                   cursor: "pointer", display: "grid", placeItems: "center" }}>
          <Icon name="logout" size={20} color={S.muted} />
        </button>
      </div>
    </aside>
  );
}

/* ---- bento dashboard content (shared). Themed by active module accent;
   header reflects the active submodule, proving two-level nav. ---- */
const HERO = {
  inicio: { label: "Estudios activos", value: "6", of: "en 4 centros", pct: 60, foot: "2 en fase de cierre" },
  track: { label: "Pacientes reclutados", value: "248", of: "de 300", pct: 83, foot: "+12 esta semana" },
  lab: { label: "Muestras procesadas", value: "1.284", of: "este mes", pct: 76, foot: "42 en análisis" },
  pharma: { label: "Unidades en stock", value: "3.210", of: "18 días de cobertura", pct: 55, foot: "1 lote por vencer" },
  contable: { label: "Facturado", value: "$ 4,2M", of: "del trimestre", pct: 68, foot: "5 comprobantes pendientes" },
};

function SharedDashboard({ S, module, sub }) {
  const accent = module.accent;
  const hero = HERO[module.key] || HERO.track;
  const roKey = module.key === "lab" ? "pharma" : "lab";
  const ro = S.readonly[roKey];
  const roSrc = S.modules.find((m) => m.key === ro.mod);
  const card = (extra) => ({ background: S.white, border: `1px solid ${S.line}`, borderRadius: 16, padding: "18px 20px", ...extra });

  return (
    <div style={{ flex: 1, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 16, minHeight: 0, background: S.paper }}>
      {/* context header (module › submodule) */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: accent + "18", display: "grid", placeItems: "center" }}>
          <Icon name={module.icon} size={22} color={accent} stroke={1.9} />
        </span>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: S.muted }}>
            {module.full} <Icon name="chevronRight" size={13} color={S.faint} />
            <span style={{ color: accent, fontWeight: 600 }}>{sub ? sub.name : ""}</span>
          </div>
          <div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 23, letterSpacing: "-0.02em", marginTop: 1 }}>
            {sub ? sub.name : module.full}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button style={{ height: 40, padding: "0 16px", border: "none", borderRadius: 10, background: accent, color: S.onAccent,
                           fontFamily: S.fontText, fontWeight: 600, fontSize: 13.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
            <Icon name="plus" size={16} color={S.white} /> Nuevo
          </button>
        </div>
      </div>

      {/* bento */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gridTemplateRows: "auto 1fr", gap: 14, minHeight: 0 }}>
        <div style={{ ...card(), gridRow: "span 2", background: accent, color: S.onAccent, border: "none", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.82)" }}>{hero.label}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
            <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 58, lineHeight: 1, letterSpacing: "-0.03em" }}>{hero.value}</span>
            <span style={{ fontSize: 15, color: "rgba(255,255,255,.82)" }}>{hero.of}</span>
          </div>
          <div style={{ height: 9, borderRadius: 99, background: "rgba(255,255,255,.25)", marginTop: 18, overflow: "hidden" }}>
            <div style={{ width: hero.pct + "%", height: "100%", background: S.white, borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.82)", marginTop: 10 }}>{hero.pct}% · {hero.foot}</div>
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10, paddingTop: 18 }}>
            {S.sites.slice(0, 3).map((st, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "rgba(255,255,255,.9)", marginBottom: 5 }}>
                  <span>{st.name}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{st.n}</span>
                </div>
                <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,.22)" }}>
                  <div style={{ width: st.pct + "%", height: "100%", background: "rgba(255,255,255,.9)", borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {S.metrics.slice(1, 3).map((mt, i) => (
          <div key={i} style={card()}>
            <div style={{ fontSize: 12.5, color: S.muted }}>{mt.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 6 }}>
              <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 34, letterSpacing: "-0.02em" }}>{mt.value}</span>
              {mt.trend && <span style={{ fontSize: 12.5, fontWeight: 600, color: mt.up ? S.good : S.danger }}>{mt.trend}</span>}
            </div>
            <div style={{ fontSize: 12, color: S.faint, marginTop: 4 }}>{mt.sub}</div>
          </div>
        ))}

        <div style={{ ...card(), gridColumn: "2 / span 2" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: roSrc.accent }} />
            <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 15 }}>{roSrc.full}</span>
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
                           color: roSrc.accent, background: roSrc.accent + "14", padding: "3px 9px", borderRadius: 99 }}>
              <Icon name="eye" size={12} color={roSrc.accent} /> Solo lectura
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${ro.rows.length},1fr)`, gap: 12 }}>
            {ro.rows.map((r, i) => (
              <div key={i} style={{ background: S.surface, border: `1px solid ${S.line}`, borderRadius: 12, padding: "13px 15px" }}>
                <div style={{ fontSize: 12, color: S.muted, height: 32 }}>{r[0]}</div>
                <div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 26, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{r[1]}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: S.faint, marginTop: 12 }}>Sincronizado desde {roSrc.full} · no editable desde {module.full}.</div>
        </div>
      </div>
    </div>
  );
}

/* ============ pieces for the converged shell ============ */

function ibtn(S) {
  return { position: "relative", width: 38, height: 38, borderRadius: 10, border: `1px solid ${S.line2}`,
           background: S.white, cursor: "pointer", display: "grid", placeItems: "center" };
}

/* working notifications popup */
function NotifBell({ S }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={ibtn(S)} title="Notificaciones">
        <Icon name="bell" size={17} color={S.ink} />
        <span style={{ position: "absolute", top: 7, right: 8, width: 7, height: 7, borderRadius: "50%",
                       background: S.danger, border: `2px solid ${S.white}` }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: 46, right: 0, width: 312, background: S.white, border: `1px solid ${S.line}`,
                      borderRadius: 14, boxShadow: "0 16px 40px rgba(20,48,46,.18)", zIndex: 40, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px",
                        borderBottom: `1px solid ${S.line}` }}>
            <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 15 }}>Notificaciones</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: S.primary, background: S.primary + "14", padding: "2px 8px", borderRadius: 99 }}>
              {S.notifications.length} nuevas
            </span>
          </div>
          {S.notifications.map((n, i) => {
            const src = S.modules.find((m) => m.key === n.mod);
            return (
              <div key={i} style={{ display: "flex", gap: 11, padding: "12px 16px", borderBottom: `1px solid ${S.line}`, cursor: "pointer" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: src.accent, marginTop: 5, flex: "0 0 auto" }} />
                <div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.35, color: S.ink }}>{n.title}</div>
                  <div style={{ fontSize: 11.5, color: S.muted, marginTop: 2 }}>{src.full} · {n.time}</div>
                </div>
              </div>
            );
          })}
          <button style={{ width: "100%", padding: "12px", border: "none", background: S.surface, cursor: "pointer",
                           fontFamily: S.fontText, fontSize: 13, fontWeight: 600, color: S.primary }}>
            Ver todas
          </button>
        </div>
      )}
    </div>
  );
}

/* user identity cluster (top-right) */
function UserCluster({ S, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, paddingLeft: 6 }}>
      <Avatar S={S} accent={accent} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{S.user.name}</div>
        <div style={{ fontSize: 11.5, color: S.muted }}>{S.user.role} · {S.user.center}</div>
      </div>
    </div>
  );
}

/* double-panel navigation (icon rail + submodule list). No coordinator block. */
function DoublePanelNav({ S, mod, moduleKey, setModule, subs, subKey, setSubKey, onLogout, onGear }) {
  const accent = mod.accent;
  return (
    <React.Fragment>
      <IconRail S={S} moduleKey={moduleKey} setModule={setModule} onLogout={onLogout} onGear={onGear} width={64} />
      <aside style={{ width: 216, flex: "0 0 216px", background: S.surface, borderRight: `1px solid ${S.line}`,
                      display: "flex", flexDirection: "column", padding: "20px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 8px 2px" }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, background: accent + "18", display: "grid", placeItems: "center" }}>
            <Icon name={mod.icon} size={15} color={accent} stroke={2} />
          </span>
          <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 16 }}>{mod.full}</span>
        </div>
        <div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: S.faint,
                      fontWeight: 700, padding: "20px 10px 8px" }}>Submódulos</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {subs.map((s) => {
            const on = s.key === subKey;
            return (
              <button key={s.key} onClick={() => setSubKey(s.key)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 12px",
                         border: "none", borderRadius: 9, cursor: "pointer", borderLeft: `2.5px solid ${on ? accent : "transparent"}`,
                         background: on ? accent + "14" : "transparent", color: on ? accent : S.ink,
                         fontFamily: S.fontText, fontSize: 14, fontWeight: on ? 600 : 500 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: on ? accent : S.faint }} />{s.name}
              </button>
            );
          })}
        </nav>
      </aside>
    </React.Fragment>
  );
}

/* page context header — title + breadcrumb; right slot holds variant-specific actions */
function ContextHeader({ S, mod, sub, right }) {
  const accent = mod.accent;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 26px 6px", background: S.paper }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: S.muted }}>
          {mod.full} <Icon name="chevronRight" size={13} color={S.faint} />
          <span style={{ color: accent, fontWeight: 600 }}>{sub ? sub.name : ""}</span>
        </div>
        <div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em", marginTop: 1 }}>
          {sub ? sub.name : mod.full}
        </div>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>{right}</div>
    </div>
  );
}

/* contextual in-view search field (sized by `expanded`) */
function ViewSearch({ S, sub, expanded = true, onToggle }) {
  if (!expanded) {
    return (
      <button onClick={onToggle} style={ibtn(S)} title="Buscar en la vista">
        <Icon name="search" size={17} color={S.ink} />
      </button>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: 240, height: 38, padding: "0 13px",
                  border: `1px solid ${S.line2}`, borderRadius: 9, background: S.white, color: S.muted, fontSize: 13.5 }}>
      <Icon name="search" size={16} color={S.muted} /> Buscar en {sub ? sub.name : "la vista"}…
    </div>
  );
}

function NuevoBtn({ S, accent }) {
  return (
    <button style={{ height: 38, padding: "0 15px", border: "none", borderRadius: 10, background: accent, color: S.onAccent,
                     fontFamily: S.fontText, fontWeight: 600, fontSize: 13.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
      <Icon name="plus" size={16} color={S.white} /> Nuevo
    </button>
  );
}

/* bento grid only (no header) — for the converged variants */
function SharedBento({ S, module }) {
  const accent = module.accent;
  const accentSolid = module.accentSolid || module.accent;
  const hero = HERO[module.key] || HERO.track;
  const roKey = module.key === "lab" ? "pharma" : "lab";
  const ro = S.readonly[roKey];
  const roSrc = S.modules.find((m) => m.key === ro.mod);
  const card = (extra) => ({ background: S.white, border: `1px solid ${S.line}`, borderRadius: 16, padding: "18px 20px", ...extra });
  return (
    <div style={{ flex: 1, margin: "10px 26px 22px", display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr",
                  gridTemplateRows: "auto 1fr", gap: 14, minHeight: 0 }}>
      <div style={{ ...card(), gridRow: "span 2", background: accentSolid, color: S.onAccent, border: "none", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.82)" }}>{hero.label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
          <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 58, lineHeight: 1, letterSpacing: "-0.03em" }}>{hero.value}</span>
          <span style={{ fontSize: 15, color: "rgba(255,255,255,.82)" }}>{hero.of}</span>
        </div>
        <div style={{ height: 9, borderRadius: 99, background: "rgba(255,255,255,.25)", marginTop: 18, overflow: "hidden" }}>
          <div style={{ width: hero.pct + "%", height: "100%", background: S.white, borderRadius: 99 }} />
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.82)", marginTop: 10 }}>{hero.pct}% · {hero.foot}</div>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10, paddingTop: 18 }}>
          {S.sites.slice(0, 3).map((st, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "rgba(255,255,255,.9)", marginBottom: 5 }}>
                <span>{st.name}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{st.n}</span>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,.22)" }}>
                <div style={{ width: st.pct + "%", height: "100%", background: "rgba(255,255,255,.9)", borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {S.metrics.slice(1, 3).map((mt, i) => (
        <div key={i} style={card()}>
          <div style={{ fontSize: 12.5, color: S.muted }}>{mt.label}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 6 }}>
            <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 34, letterSpacing: "-0.02em" }}>{mt.value}</span>
            {mt.trend && <span style={{ fontSize: 12.5, fontWeight: 600, color: mt.up ? S.good : S.danger }}>{mt.trend}</span>}
          </div>
          <div style={{ fontSize: 12, color: S.faint, marginTop: 4 }}>{mt.sub}</div>
        </div>
      ))}
      <div style={{ ...card(), gridColumn: "2 / span 2" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: roSrc.accent }} />
          <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 15 }}>{roSrc.full}</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
                         color: roSrc.accent, background: roSrc.accent + "14", padding: "3px 9px", borderRadius: 99 }}>
            <Icon name="eye" size={12} color={roSrc.accent} /> Solo lectura
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${ro.rows.length},1fr)`, gap: 12 }}>
          {ro.rows.map((r, i) => (
            <div key={i} style={{ background: S.surface, border: `1px solid ${S.line}`, borderRadius: 12, padding: "13px 15px" }}>
              <div style={{ fontSize: 12, color: S.muted, height: 32 }}>{r[0]}</div>
              <div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 26, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{r[1]}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: S.faint, marginTop: 12 }}>Sincronizado desde {roSrc.full} · no editable desde {module.full}.</div>
      </div>
    </div>
  );
}

Object.assign(window, { useShellState, Avatar, SharedLoginB, IconRail, SharedDashboard,
  NotifBell, UserCluster, DoublePanelNav, ContextHeader, ViewSearch, NuevoBtn, SharedBento, ibtn });
