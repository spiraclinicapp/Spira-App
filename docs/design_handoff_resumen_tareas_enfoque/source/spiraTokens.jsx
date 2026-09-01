/* spiraTokens.jsx — shared brand tokens + domain data for the Spira app shell.
   Identity: Sereno (Schibsted Grotesk display + Hanken Grotesk text, petrol + paper). */

const SPIRA = {
  // palette
  ink: "#14302E", primary: "#0F5F57", paper: "#F4F1EA", surface: "#FBFAF6",
  white: "#FFFFFF", muted: "#7C8C87", faint: "#A6B0AC", line: "#E4DECF", line2: "#D8CBB0",
  good: "#5C8A5A", warn: "#B0823F", danger: "#A6483B",
  onAccent: "#F4F1EA", brandMark: "#0F5F57",
  themes: {
    light: { ink: "#14302E", paper: "#F4F1EA", surface: "#FBFAF6", white: "#FFFFFF",
             muted: "#7C8C87", faint: "#A6B0AC", line: "#E4DECF", line2: "#D8CBB0", brandMark: "#0F5F57" },
    dark:  { ink: "#EDEDED", paper: "#0A0A0A", surface: "#171717", white: "#212121",
             muted: "#A1A1A1", faint: "#6E6E6E", line: "#2A2A2A", line2: "#3A3A3A", brandMark: "#9DE6D6" },
  },
  fontDisp: "'Schibsted Grotesk', sans-serif",
  fontText: "'Hanken Grotesk', sans-serif",
  mono: "'IBM Plex Mono', monospace",

  // navigation modules — order: permitted first, restricted last
  modules: [
    { key: "inicio", name: "Inicio", full: "Inicio", accent: "#0F5F57", icon: "dashboard", allowed: true, desc: "Resumen general" },
    { key: "track", name: "Track", full: "Spira Track", accent: "#2E7D74", accentSolid: "#2E7D74", icon: "activity", allowed: true, desc: "Seguimiento de ensayos" },
    { key: "lab", name: "Lab", full: "Spira Lab", accent: "#5C8A5A", accentSolid: "#5C8A5A", icon: "flask", allowed: true, desc: "Muestras y análisis" },
    { key: "pharma", name: "Pharma", full: "Spira Pharma", accent: "#C9A24A", accentSolid: "#A8842F", icon: "pill", allowed: true, desc: "Farmacia clínica" },
    { key: "contable", name: "Contable", full: "Spira Contable", accent: "#3A6B8C", accentSolid: "#3A6B8C", icon: "receipt", allowed: false, desc: "Facturación y costos" },
  ],

  user: { name: "Dra. Lucía Méndez", role: "Coordinadora", center: "Centro Cardiológico BA", initials: "LM",
          email: "lucia.mendez@ccba.org", phone: "+54 11 4821 5590", tz: "GMT-3 · Buenos Aires", access: "Administradora" },

  // ===== datos de Ajustes (menú de usuario) =====
  settings: {
    // Roles y permisos — equipo del centro (vista admin)
    team: [
      { name: "Dra. Lucía Méndez", email: "lucia.mendez@ccba.org", rol: "Administradora", estado: "activo", visto: "ahora", tu: true },
      { name: "Dr. Martín Sosa", email: "martin.sosa@ccba.org", rol: "Investigador principal", estado: "activo", visto: "hace 2 h" },
      { name: "Lic. Paula Rivas", email: "paula.rivas@ccba.org", rol: "Data manager", estado: "activo", visto: "ayer" },
      { name: "Farm. Nicolás Ferro", email: "nicolas.ferro@ccba.org", rol: "Farmacéutico", estado: "activo", visto: "hace 3 d" },
      { name: "Enf. Carla Díaz", email: "carla.diaz@ccba.org", rol: "Enfermería", estado: "pendiente", visto: "invitación enviada" },
    ],
    // roles disponibles + a qué módulos acceden
    roles: [
      { rol: "Administradora", desc: "Acceso total y gestión de usuarios", mods: ["Inicio", "Track", "Lab", "Pharma", "Contable"] },
      { rol: "Investigador principal", desc: "Todos los módulos clínicos", mods: ["Inicio", "Track", "Lab", "Pharma"] },
      { rol: "Data manager", desc: "Seguimiento y datos", mods: ["Inicio", "Track"] },
      { rol: "Farmacéutico", desc: "Farmacia clínica", mods: ["Inicio", "Pharma"] },
      { rol: "Enfermería", desc: "Agenda y visitas", mods: ["Inicio", "Track"] },
    ],
    // Notificaciones — matriz por categoría (en app / email)
    notifCats: [
      { key: "queries", label: "Queries de data management", app: true, email: true },
      { key: "criticos", label: "Resultados críticos de laboratorio", app: true, email: true },
      { key: "visitas", label: "Visitas y ventanas", app: true, email: false },
      { key: "stock", label: "Stock y lotes por vencer", app: true, email: false },
      { key: "sistema", label: "Novedades y sistema", app: false, email: false },
    ],
    // Ayuda — artículos y atajos
    helpTopics: [
      { icon: "activity", title: "Primeros pasos en Spira", n: 8 },
      { icon: "users", title: "Gestión de pacientes y visitas", n: 12 },
      { icon: "pill", title: "Dispensación y farmacia", n: 6 },
      { icon: "file", title: "Protocolos y plantillas", n: 9 },
    ],
    shortcuts: [
      { keys: "⌘ K", desc: "Buscar en toda la plataforma" },
      { keys: "G luego I", desc: "Ir a Inicio" },
      { keys: "N", desc: "Nueva acción del módulo" },
      { keys: "?", desc: "Ver atajos de teclado" },
    ],
  },

  // versión de la plataforma (mostrada al pie de la columna de submódulos)
  version: {
    app: "2.4.0", channel: "estable", build: "2.4.0-stable", date: "30 jun 2026",
    // versión por módulo (cada uno se despliega a su ritmo)
    modules: { inicio: "2.4.0", track: "1.9.2", lab: "1.4.0", pharma: "1.7.1", contable: "0.6.0-beta" },
    changelog: [
      { v: "2.4.0", txt: "Buscador global (⌘K) en toda la plataforma" },
      { v: "2.3.0", txt: "Hub Inicio transversal para coordinación" },
      { v: "2.2.1", txt: "Cadena de frío en Spira Lab" },
    ],
  },

  notifications: [
    { mod: "track", title: "Query nueva en EC-0117", time: "hace 5 min" },
    { mod: "lab", title: "Resultado crítico · muestra M-0421", time: "hace 22 min" },
    { mod: "track", title: "Visita reprogramada · P-071", time: "hace 1 h" },
    { mod: "pharma", title: "Lote por vencer en 7 días", time: "hace 3 h" },
  ],

  // two-level navigation: each module owns a set of submodules
  submodules: {
    inicio: [],
    track: [
      { key: "resumen", name: "Resumen", icon: "dashboard" }, { key: "protocolos", name: "Protocolos", icon: "file" },
      { key: "pacientes", name: "Pacientes", icon: "users" }, { key: "agenda", name: "Agenda", icon: "calendar" },
      { key: "plantillas", name: "Plantillas", icon: "clipboardCheck" },
    ],
    lab: [
      { key: "muestras", name: "Muestras", icon: "flask" }, { key: "analisis", name: "Análisis", icon: "droplet" },
      { key: "resultados", name: "Resultados", icon: "barChart" }, { key: "cadena", name: "Cadena de frío", icon: "thermometer" },
    ],
    pharma: [
      { key: "resumen", name: "Resumen", icon: "dashboard" }, { key: "pacientes", name: "Pacientes", icon: "users" },
      { key: "protocolos", name: "Protocolos", icon: "file" }, { key: "medicamentos", name: "Medicamentos", icon: "pill" },
      { key: "dispensaciones", name: "Dispensaciones", icon: "box" }, { key: "reportes", name: "Reportes", icon: "barChart" },
    ],
    contable: [
      { key: "facturacion", name: "Facturación", icon: "receipt" }, { key: "pagos", name: "Pagos a pacientes", icon: "creditCard" },
      { key: "presupuesto", name: "Presupuesto", icon: "barChart" }, { key: "honorarios", name: "Honorarios", icon: "dollar" },
    ],
  },

  // dashboard metrics (Track-centric coordinator view)
  metrics: [
    { label: "Pacientes reclutados", value: "248", sub: "de 300 objetivo", pct: 83, trend: "+12", up: true },
    { label: "Visitas hoy", value: "14", sub: "3 pendientes", trend: null },
    { label: "Queries abiertas", value: "27", sub: "data management", trend: "-8", up: true },
    { label: "Adherencia a protocolo", value: "96,4%", sub: "últimos 30 días", trend: "+1,2", up: true },
  ],

  sites: [
    { name: "Centro Cardiológico BA", n: 92, pct: 92 },
    { name: "Hospital Italiano", n: 64, pct: 71 },
    { name: "Clínica Rosario", n: 58, pct: 64 },
    { name: "Sanatorio Mendoza", n: 34, pct: 45 },
  ],

  visits: [
    { code: "EC-0117", patient: "P-204 · M.G.", time: "09:30", status: "Confirmada", tone: "good" },
    { code: "EC-0117", patient: "P-188 · R.A.", time: "10:15", status: "En espera", tone: "warn" },
    { code: "EC-0204", patient: "P-052 · J.L.", time: "11:00", status: "Confirmada", tone: "good" },
    { code: "EC-0204", patient: "P-071 · S.D.", time: "12:30", status: "Reprogramar", tone: "danger" },
    { code: "EC-0117", patient: "P-219 · C.V.", time: "14:00", status: "Confirmada", tone: "good" },
  ],

  // read-only data pulled from other modules
  readonly: {
    lab: { mod: "lab", rows: [["En análisis", "42"], ["Resultados críticos", "2"], ["Listas para informe", "15"]] },
    pharma: { mod: "pharma", rows: [["Stock de medicación", "18 días"], ["Lotes por vencer", "1"]] },
  },

  // Spira Pharma domain
  pharmaData: {
    stats: [
      { label: "Dispensaciones hoy", value: "14", sub: "8 entregadas" },
      { label: "Pendientes", value: "3", sub: "en cola", tone: "warn" },
      { label: "Stock bajo", value: "2", sub: "medicamentos", tone: "warn" },
      { label: "Por vencer · 30d", value: "1", sub: "lote", tone: "danger" },
    ],
    protocols: [
      { code: "RG-3041", ensayo: "Cardiología · Fase III", sponsor: "Roche", pacientes: 92, meds: 6 },
      { code: "NV-2207", ensayo: "Oncología · Fase II", sponsor: "Novartis", pacientes: 41, meds: 4 },
      { code: "AZ-1185", ensayo: "Respiratorio · Fase III", sponsor: "AstraZeneca", pacientes: 73, meds: 5 },
    ],
    meds: [
      { nombre: "Atorvastatina 40 mg", proto: "RG-3041", lote: "L-2291", vto: "08/2026", stock: 320, estado: "ok" },
      { nombre: "Bisoprolol 5 mg", proto: "RG-3041", lote: "L-2310", vto: "02/2026", stock: 18, estado: "bajo" },
      { nombre: "Nilotinib 200 mg", proto: "NV-2207", lote: "N-0091", vto: "11/2025", stock: 6, estado: "vencido" },
      { nombre: "Placebo", proto: "AZ-1185", lote: "P-5521", vto: "06/2027", stock: 540, estado: "ok" },
      { nombre: "Budesonida 200 mcg", proto: "AZ-1185", lote: "B-7742", vto: "01/2026", stock: 24, estado: "bajo" },
    ],
    patients: [
      { code: "P-204", proto: "RG-3041", med: "Atorvastatina 40 mg", activo: true },
      { code: "P-188", proto: "NV-2207", med: "Nilotinib 200 mg", activo: true },
      { code: "P-052", proto: "AZ-1185", med: "Budesonida 200 mcg", activo: true },
      { code: "P-071", proto: "RG-3041", med: "Bisoprolol 5 mg", activo: false },
      { code: "P-219", proto: "NV-2207", med: "Nilotinib 200 mg", activo: true },
    ],
    queue: [
      { id: "D-1042", paciente: "P-204", proto: "RG-3041", estado: "pendiente", hora: "09:30" },
      { id: "D-1041", paciente: "P-188", proto: "NV-2207", estado: "en_proceso", hora: "09:10" },
      { id: "D-1040", paciente: "P-052", proto: "AZ-1185", estado: "lista", hora: "08:50" },
      { id: "D-1039", paciente: "P-071", proto: "RG-3041", estado: "entregada", hora: "08:20" },
      { id: "D-1038", paciente: "P-219", proto: "NV-2207", estado: "entregada", hora: "08:05" },
    ],
  },

  // Spira Track domain (CliniTrack — gestión de visitas)
  trackData: {
    stats: [
      { label: "Protocolos activos", value: "3", sub: "en seguimiento" },
      { label: "Pacientes enrolados", value: "47", sub: "8 este mes" },
      { label: "Ventanas por vencer", value: "5", sub: "próximos 7 días", tone: "warn" },
      { label: "Visitas vencidas", value: "2", sub: "requieren acción", tone: "danger" },
    ],
    protocols: [
      { code: "THESEUS", fase: "Fase III · Cardiología", sponsor: "Roche", pacientes: 21, visitas: 9 },
      { code: "ACT18301", fase: "Fase II · Oncología", sponsor: "Novartis", pacientes: 14, visitas: 12 },
      { code: "CEREN-2", fase: "Fase III · Neurología", sponsor: "AstraZeneca", pacientes: 12, visitas: 7 },
    ],
    // próximas visitas (7 días), agrupadas por día
    upcoming: [
      { dia: "Hoy · jue 30", visitas: [
        { paciente: "P-204 · M.G.", proto: "THESEUS", tipo: "Presencial", hora: "09:30", estado: "proxima" },
        { paciente: "P-118 · R.A.", proto: "ACT18301", tipo: "Telefónica", hora: "11:00", estado: "proxima" },
      ]},
      { dia: "Vie 31", visitas: [
        { paciente: "P-052 · J.L.", proto: "CEREN-2", tipo: "Presencial", hora: "10:15", estado: "futura" },
      ]},
      { dia: "Lun 03", visitas: [
        { paciente: "P-071 · S.D.", proto: "THESEUS", tipo: "Presencial", hora: "08:45", estado: "futura" },
        { paciente: "P-219 · C.V.", proto: "ACT18301", tipo: "Presencial", hora: "14:00", estado: "futura" },
      ]},
    ],
    alerts: [
      { paciente: "P-188 · L.F.", proto: "ACT18301", motivo: "Ventana vencida · visita V4 sin realizar", estado: "ventana_vencida" },
      { paciente: "P-033 · A.P.", proto: "THESEUS", motivo: "Ítem vencido · lab basal sin cargar (+48h)", estado: "item_vencido" },
    ],
    patients: [
      { code: "P-204", nombre: "M. González", proto: "THESEUS", enrol: "12/03/26", prox: "Hoy", estado: "proxima" },
      { code: "P-188", nombre: "L. Fernández", proto: "ACT18301", enrol: "28/02/26", prox: "Vencida", estado: "ventana_vencida" },
      { code: "P-052", nombre: "J. López", proto: "CEREN-2", enrol: "05/04/26", prox: "Vie 31", estado: "futura" },
      { code: "P-033", nombre: "A. Pérez", proto: "THESEUS", enrol: "18/01/26", prox: "Hoy", estado: "item_vencido" },
      { code: "P-071", nombre: "S. Díaz", proto: "THESEUS", enrol: "22/03/26", prox: "Lun 03", estado: "futura" },
      { code: "P-219", nombre: "C. Vega", proto: "ACT18301", enrol: "10/04/26", prox: "Lun 03", estado: "completa" },
    ],
    // agenda semanal (Lun–Vie)
    week: [
      { dia: "Lun 03", visitas: [{ p: "P-071", t: "THESEUS", estado: "futura" }, { p: "P-219", t: "ACT18301", estado: "futura" }] },
      { dia: "Mar 04", visitas: [{ p: "P-005", t: "CEREN-2", estado: "futura" }] },
      { dia: "Mié 05", visitas: [] },
      { dia: "Jue 06", visitas: [{ p: "P-204", t: "THESEUS", estado: "futura" }, { p: "P-118", t: "ACT18301", estado: "futura" }, { p: "P-052", t: "CEREN-2", estado: "futura" }] },
      { dia: "Vie 07", visitas: [{ p: "P-033", t: "THESEUS", estado: "futura" }] },
    ],
    // plantilla de checklist (ejemplo: visita basal THESEUS)
    template: { proto: "THESEUS", visita: "Visita basal (V1)", items: [
      { txt: "Consentimiento informado firmado", plazo: "0 h" },
      { txt: "Criterios de inclusión/exclusión verificados", plazo: "0 h" },
      { txt: "Signos vitales y antropometría", plazo: "0 h" },
      { txt: "Extracción de laboratorio basal", plazo: "48 h" },
      { txt: "ECG de 12 derivaciones", plazo: "48 h" },
      { txt: "Dispensación de medicación del estudio", plazo: "0 h" },
      { txt: "Informe de eventos adversos", plazo: "168 h" },
    ]},
  },

  // ===== Hub "Inicio" — vista transversal de la coordinadora =====
  inicioData: {
    fecha: "jueves 30 de junio · 2026",
    // pulso por módulo (un dato clave + acceso directo)
    pulse: [
      { mod: "track", kpi: "3",  label: "Visitas hoy",          sub: "2 próximas · 1 telefónica", goSub: "agenda",
        stats: [{ n: "47", l: "Pacientes" }, { n: "3", l: "Protocolos" }] },
      { mod: "lab",   kpi: "2",  label: "Resultados críticos",  sub: "42 muestras en análisis",   goSub: "resultados",
        stats: [{ n: "42", l: "En análisis" }, { n: "15", l: "Para informe" }] },
      { mod: "pharma",kpi: "1",  label: "Lote por vencer",      sub: "stock para 18 días",        goSub: "medicamentos",
        stats: [{ n: "14", l: "Dispensaciones" }, { n: "2", l: "Stock bajo" }] },
    ],
    // lo prioritario hoy (centro de control · top de la pantalla)
    priorities: [
      { mod: "lab",   icon: "alert", title: "Resultado crítico · muestra M-0421", meta: "Validación médica pendiente",  tone: "danger" },
      { mod: "track", icon: "clock", title: "Ventana vencida · visita V4 · P-188", meta: "ACT18301 · sin realizar",      tone: "danger" },
      { mod: "pharma",icon: "box",   title: "Lote L-2310 por vencer en 7 días",    meta: "Bisoprolol 5 mg · RG-3041",    tone: "warn" },
    ],
    // tu día — agenda de hoy
    agendaHoy: [
      { hora: "09:30", paciente: "P-204 · M.G.", proto: "THESEUS",  tipo: "Presencial", estado: "proxima" },
      { hora: "11:00", paciente: "P-118 · R.A.", proto: "ACT18301", tipo: "Telefónica", estado: "proxima" },
      { hora: "12:30", paciente: "P-071 · S.D.", proto: "THESEUS",  tipo: "Presencial", estado: "futura" },
      { hora: "14:00", paciente: "P-219 · C.V.", proto: "ACT18301", tipo: "Presencial", estado: "futura" },
    ],
    // tareas accionables transversales
    tasks: [
      { txt: "Cargar laboratorio basal de P-033",       mod: "track",  proto: "THESEUS",  due: "Vence en 4 h", tone: "danger" },
      { txt: "Reprogramar visita V4 · P-188",           mod: "track",  proto: "ACT18301", due: "Hoy",          tone: "warn" },
      { txt: "Confirmar dispensación D-1042 · P-204",   mod: "pharma", proto: "RG-3041",  due: "09:30",        tone: "none" },
      { txt: "Revisar resultado crítico · M-0421",      mod: "lab",    proto: "—",        due: "hace 22 min",  tone: "danger" },
      { txt: "Responder query EC-0117",                 mod: "track",  proto: "THESEUS",  due: "Hoy",          tone: "warn" },
      { txt: "Validar cadena de frío · envío E-220",    mod: "lab",    proto: "CEREN-2",  due: "Mañana",       tone: "none" },
    ],
    doneTasks: ["Firmar consentimiento digital · P-219"],
    // estado general del centro
    centro: {
      nombre: "Centro Cardiológico BA",
      reclutamiento: { value: "248", of: "300", pct: 83 },
      pulsos: [
        { label: "Adherencia a protocolo", value: "96,4%" },
        { label: "Queries abiertas",       value: "27" },
        { label: "Estudios activos",       value: "3" },
      ],
    },
    // feed de alertas transversal (severidad)
    alerts: [
      { mod: "lab",    title: "Resultado crítico · muestra M-0421",       meta: "Validación médica pendiente", time: "hace 22 min", sev: "critica" },
      { mod: "track",  title: "Ventana vencida · visita V4 · P-188",      meta: "ACT18301 · sin realizar",     time: "hace 1 h",    sev: "critica" },
      { mod: "track",  title: "Ítem vencido · lab basal P-033 (+48 h)",   meta: "THESEUS",                     time: "hace 2 h",    sev: "alta" },
      { mod: "pharma", title: "Lote L-2310 por vencer en 7 días",         meta: "Bisoprolol 5 mg · RG-3041",   time: "hace 3 h",    sev: "alta" },
      { mod: "track",  title: "Query nueva en EC-0117",                   meta: "Data management",             time: "hace 5 min",  sev: "media" },
      { mod: "pharma", title: "Stock bajo · Budesonida 200 mcg",          meta: "24 u · cubre 6 días",         time: "hace 5 h",    sev: "media" },
    ],
  },
};
window.SPIRA = SPIRA;
