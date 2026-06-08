/* FinalShell.jsx — converged, simplified Spira shell.
   ONE unified full-width top bar · neutral submodule panel · sober user chip.
   Accent appears only in small cues (active module icon, dots, thin bars). */

function FinalShell() {
  const S = window.SPIRA;
  const [screen, setScreen] = React.useState("login");
  const [theme, setTheme] = React.useState(() => {
    try { return localStorage.getItem("spira-theme") || "light"; } catch (e) { return "light"; }
  });
  Object.assign(S, S.themes[theme] || S.themes.light);
  const toggleTheme = () => setTheme((t) => {
    const n = t === "dark" ? "light" : "dark";
    try { localStorage.setItem("spira-theme", n); } catch (e) {}
    return n;
  });
  const [moduleKey, setModuleKey] = React.useState("track");
  const [subKey, setSubKey] = React.useState(S.submodules.track[0].key);
  const [notif, setNotif] = React.useState(false);
  const [gear, setGear] = React.useState(false);
  const [userMenu, setUserMenu] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const mod = S.modules.find((m) => m.key === moduleKey);
  const subs = S.submodules[moduleKey] || [];
  const sub = subs.find((s) => s.key === subKey) || subs[0];
  const accent = mod.accent;
  const accentSolid = mod.accentSolid || mod.accent;
  const setModule = (k) => {
    const m = S.modules.find((x) => x.key === k);
    if (!m || !m.allowed) return;
    setModuleKey(k);
    setSubKey((S.submodules[k] || [])[0].key);
  };

  if (screen === "login") return <SharedLoginB S={S} onEnter={() => setScreen("app")} />;

  const PH_ACTIONS = { resumen: "Nueva dispensación", dispensaciones: "Nueva dispensación",
    medicamentos: "Agregar medicamento", pacientes: "Nuevo paciente", protocolos: "Nuevo protocolo", reportes: "Generar reporte" };
  const TK_ACTIONS = { resumen: "Nueva visita", protocolos: "Nuevo protocolo", pacientes: "Nuevo paciente",
    agenda: "Nueva visita", plantillas: "Nuevo ítem" };
  const actionLabel = moduleKey === "pharma" ? (PH_ACTIONS[sub ? sub.key : ""] || "Nuevo")
    : moduleKey === "track" ? (TK_ACTIONS[sub ? sub.key : ""] || "Nuevo") : "Nuevo";

  const closeAll = () => { setNotif(false); setGear(false); setUserMenu(false); };
  const ibtnS = { position: "relative", width: 38, height: 38, borderRadius: 10, border: "none",
                  background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", fontFamily: S.fontText, color: S.ink, background: S.paper }}>
      {/* ===== unified top bar (full width) ===== */}
      <header style={{ height: 60, flex: "0 0 60px", borderBottom: `1px solid ${S.line}`, background: S.white,
                       display: "flex", alignItems: "center", padding: "0 18px 0 20px", gap: 14, position: "relative", zIndex: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Vilano1 size={30} color={S.brandMark} />
          <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 21, letterSpacing: "-0.02em" }}>Spira</span>
          <span style={{ width: 1, height: 26, background: S.line, margin: "0 5px" }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: accent + "18", display: "grid", placeItems: "center" }}>
              <Icon name={mod.icon} size={15} color={accent} stroke={2} />
            </span>
            <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 17 }}>{mod.name}</span>
          </span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {/* theme toggle */}
          <button onClick={toggleTheme} style={ibtnS} title={theme === "dark" ? "Tema claro" : "Tema oscuro"}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} color={S.ink} />
          </button>
          {/* contextual search: lupa that expands inline */}
          {searchOpen ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: 248, height: 38, padding: "0 12px",
                          border: `1px solid ${S.line2}`, borderRadius: 10, background: S.surface, color: S.muted, fontSize: 13.5 }}>
              <Icon name="search" size={16} color={S.muted} /> Buscar en {sub ? sub.name : "Spira"}…
              <button onClick={() => setSearchOpen(false)} style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: S.faint, fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          ) : (
            <button onClick={() => setSearchOpen(true)} style={ibtnS} title="Buscar"><Icon name="search" size={18} color={S.ink} /></button>
          )}

          {/* notifications */}
          <div style={{ position: "relative" }}>
            <button onClick={() => { const v = !notif; closeAll(); setNotif(v); }} style={ibtnS} title="Notificaciones">
              <Icon name="bell" size={18} color={S.ink} />
              <span style={{ position: "absolute", top: 7, right: 8, width: 7, height: 7, borderRadius: "50%", background: S.danger, border: `2px solid ${S.white}` }} />
            </button>
            {notif && (
              <div style={{ position: "absolute", top: 48, right: 0, width: 312, background: S.white, border: `1px solid ${S.line}`,
                            borderRadius: 14, boxShadow: "0 16px 40px rgba(20,48,46,.18)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: `1px solid ${S.line}` }}>
                  <span style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 15 }}>Notificaciones</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: S.primary, background: S.primary + "14", padding: "2px 8px", borderRadius: 99 }}>{S.notifications.length} nuevas</span>
                </div>
                {S.notifications.map((n, i) => {
                  const src = S.modules.find((m) => m.key === n.mod);
                  return (
                    <div key={i} style={{ display: "flex", gap: 11, padding: "12px 16px", borderBottom: `1px solid ${S.line}`, cursor: "pointer" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: src.accent, marginTop: 5, flex: "0 0 auto" }} />
                      <div>
                        <div style={{ fontSize: 13.5, lineHeight: 1.35 }}>{n.title}</div>
                        <div style={{ fontSize: 11.5, color: S.muted, marginTop: 2 }}>{src.full} · {n.time}</div>
                      </div>
                    </div>
                  );
                })}
                <button style={{ width: "100%", padding: 12, border: "none", background: S.surface, cursor: "pointer", fontFamily: S.fontText, fontSize: 13, fontWeight: 600, color: S.primary }}>Ver todas</button>
              </div>
            )}
          </div>

          {/* settings gear moved to rail bottom-left */}

          <div style={{ width: 1, height: 26, background: S.line, margin: "0 4px" }} />

          {/* sober user chip */}
          <div style={{ position: "relative" }}>
            <button onClick={() => { const v = !userMenu; closeAll(); setUserMenu(v); }}
              style={{ display: "flex", alignItems: "center", gap: 9, height: 42, padding: "0 8px 0 6px", border: "none", borderRadius: 10, background: "transparent", cursor: "pointer" }}>
              <Avatar S={S} accent={S.primary} size={32} />
              <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", color: S.muted }}>{S.user.name}</span>
              <Icon name="chevronDown" size={15} color={S.muted} />
            </button>
            {userMenu && (
              <div style={{ position: "absolute", top: 50, right: 0, width: 230, background: S.white, border: `1px solid ${S.line}`, borderRadius: 12, boxShadow: "0 14px 36px rgba(20,48,46,.16)", overflow: "hidden" }}>
                <div style={{ padding: "13px 15px", borderBottom: `1px solid ${S.line}` }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{S.user.name}</div>
                  <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>{S.user.role} · {S.user.center}</div>
                </div>
                <button onClick={() => setScreen("login")} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "11px 15px", border: "none", background: "transparent", cursor: "pointer", fontFamily: S.fontText, fontSize: 13.5, color: S.ink }}>
                  <Icon name="logout" size={16} color={S.muted} /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== body: rail + neutral panel + content ===== */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* module icon rail */}
        <aside style={{ width: 64, flex: "0 0 64px", background: S.white, borderRight: `1px solid ${S.line}`,
                        display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 0", gap: 6 }}>
          {S.modules.map((m) => {
            const on = m.key === moduleKey;
            const locked = !m.allowed;
            return (
              <button key={m.key} onClick={() => setModule(m.key)} disabled={locked} title={m.full}
                style={{ width: 46, height: 46, borderRadius: 12, border: "none", cursor: locked ? "default" : "pointer",
                         background: on ? m.accent + "16" : "transparent", display: "grid", placeItems: "center" }}>
                <Icon name={locked ? "lock" : m.icon} size={21} stroke={1.9} color={locked ? S.faint : on ? m.accent : S.muted} />
              </button>
            );
          })}

          {/* settings gear — bottom-left, menu opens upward */}
          <div style={{ marginTop: "auto", position: "relative" }}>
            <button onClick={() => { const v = !gear; closeAll(); setGear(v); }} title="Ajustes"
              style={{ width: 46, height: 46, borderRadius: 12, border: "none", cursor: "pointer",
                       background: gear ? S.line : "transparent", display: "grid", placeItems: "center" }}>
              <Icon name="settings" size={21} stroke={1.9} color={S.muted} />
            </button>
            {gear && (
              <div style={{ position: "absolute", bottom: 0, left: 54, width: 210, background: S.white, border: `1px solid ${S.line}`,
                            borderRadius: 12, boxShadow: "0 14px 36px rgba(20,48,46,.18)", padding: 6, zIndex: 40 }}>
                {["Preferencias", "Roles y permisos", "Centros del estudio", "Ayuda"].map((t, i) => (
                  <button key={i} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 10px", border: "none", borderRadius: 8, background: "transparent", cursor: "pointer", fontFamily: S.fontText, fontSize: 13.5, color: S.ink }}>{t}</button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* submodule panel (keeps module accent) */}
        <aside style={{ width: 208, flex: "0 0 208px", background: S.surface, borderRight: `1px solid ${S.line}`, padding: "18px 12px" }}>
          <div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: S.faint, fontWeight: 700, padding: "2px 12px 0" }}>Submódulos</div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 14 }}>
            {subs.map((s) => {
              const on = s.key === subKey;
              return (
                <button key={s.key} onClick={() => setSubKey(s.key)}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 12px",
                           border: "none", borderRadius: 9, cursor: "pointer",
                           background: on ? accent + "14" : "transparent", color: on ? accent : S.ink,
                           fontFamily: S.fontText, fontSize: 14, fontWeight: on ? 600 : 500 }}>
                  <Icon name={s.icon} size={17} stroke={1.9} color={on ? accent : S.muted} />{s.name}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* content */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 26px 4px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: S.muted }}>
                {mod.full} <Icon name="chevronRight" size={13} color={S.faint} /> <span style={{ color: S.ink, fontWeight: 600 }}>{sub ? sub.name : ""}</span>
              </div>
              <div style={{ fontFamily: S.fontDisp, fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em", marginTop: 1 }}>{sub ? sub.name : mod.full}</div>
            </div>
            <button style={{ marginLeft: "auto", height: 38, padding: "0 15px", border: "none", borderRadius: 10, background: accentSolid, color: S.onAccent, fontFamily: S.fontText, fontWeight: 600, fontSize: 13.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
              <Icon name="plus" size={16} color={S.onAccent} /> {actionLabel}
            </button>
          </div>
          {moduleKey === "pharma"
            ? <PharmaContent S={S} sub={sub} accent={accent} />
            : moduleKey === "track"
            ? <TrackContent S={S} sub={sub} accent={accent} />
            : <SharedBento S={S} module={mod} />}
        </main>
      </div>
    </div>
  );
}

window.FinalShell = FinalShell;
