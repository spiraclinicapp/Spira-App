/* data.js — tokens + datos demo para Visitas v2 (Spira Track). */
(function () {
  const LIGHT = {
    ink: "#14302E", primary: "#0F5F57", paper: "#F4F1EA", surface: "#FBFAF6",
    white: "#FFFFFF", muted: "#7C8C87", faint: "#A6B0AC", line: "#E4DECF", line2: "#D8CBB0",
    good: "#5C8A5A", warn: "#B0823F", danger: "#A6483B", accent: "#2E7D74",
    blue: "#3A6B8C", gold: "#A8842F", violet: "#6B5CA5", shadow: "rgba(20,48,46,.14)", scrim: "rgba(20,38,36,.42)",
  };
  const DARK = {
    ink: "#E9F2EF", primary: "#1F8A7E", paper: "#0E1B1A", surface: "#142523",
    white: "#17302C", muted: "#8AA39D", faint: "#5E726D", line: "#27403B", line2: "#34504A",
    good: "#74B071", warn: "#D2A35C", danger: "#D17468", accent: "#43A597",
    blue: "#6FA0C2", gold: "#D2A35C", violet: "#9C8FD4", shadow: "rgba(0,0,0,.5)", scrim: "rgba(4,12,11,.62)",
  };

  /* Etapas operativas del paciente en el centro. */
  const STAGES = [
    { key: "por_llegar",  label: "Por llegar",      short: "Por llegar", tone: "muted" },
    { key: "en_el_sitio", label: "En el sitio",     short: "En sitio",   tone: "accent" },
    { key: "atendido",    label: "Atendido",        short: "Atendido",   tone: "blue" },
    { key: "listo",       label: "Listo para irse", short: "Listo",      tone: "good" },
    { key: "fuera",       label: "Fuera del sitio", short: "Fuera",      tone: "faint" },
  ];
  const NO_VINO = { key: "no_vino", label: "No vino", short: "No vino", tone: "danger" };

  /* Procedimientos que puede llevar una visita. */
  const PROCS = {
    sangre:       { label: "Sangre",        letter: "S", tone: "danger", detail: "Extracción de laboratorio central" },
    procedimiento:{ label: "Procedimiento", letter: "P", tone: "violet", detail: "Procedimiento del protocolo" },
    ecg:          { label: "ECG",           letter: "E", tone: "blue",   detail: "ECG de 12 derivaciones" },
    orina:        { label: "Orina",         letter: "O", tone: "gold",   detail: "Muestra de orina / test de embarazo" },
    dispensacion: { label: "Dispensación",  letter: "D", tone: "accent", detail: "Entrega de medicación del estudio" },
    pk:           { label: "PK",            letter: "K", tone: "violet", detail: "Muestreo farmacocinético seriado" },
    cuestionario: { label: "Cuestionario",  letter: "C", tone: "muted",  detail: "Cuestionario de calidad de vida" },
  };

  const PROTOCOLS = [
    { id: "atlas",    name: "ATLAS-7",  code: "EFC18419", phase: "Fase III", area: "Cardiología",   tone: "blue" },
    { id: "meridian", name: "MERIDIAN", code: "MRD-2204", phase: "Fase II",  area: "Metabolismo",   tone: "accent" },
    { id: "helios",   name: "HELIOS-2", code: "HLS-1180", phase: "Fase III", area: "Oncología",     tone: "violet" },
    { id: "corvus",   name: "CORVUS",   code: "CVS-3307", phase: "Fase I",   area: "Neumonología",  tone: "gold" },
    { id: "novara",   name: "NOVARA",   code: "NVR-0915", phase: "Fase III", area: "Reumatología",  tone: "good" },
  ];
  const proto = id => PROTOCOLS.find(p => p.id === id);

  const COORDINADORES = ["Valeria Araya", "Nerina Rojas", "Camila Ferreyra"];
  const MEDICOS = ["Dr. Federico Salas", "Dra. Marina Ruiz", "Dr. Iván Pereda"];

  const c = (author, role, at, txt) => ({
    id: "c" + Math.random().toString(36).slice(2, 7), author, role, at, txt,
    initials: author.replace(/^(Dr|Dra)\.\s*/, "").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase(),
  });

  const V = (o) => ({ comments: [], wantsDoctor: false, doctorSeen: false, notes: null, ...o });

  const VISITS = [
    V({ id: "v01", time: "08:00", protoId: "atlas", visitTag: "V6", visitName: "Visita 6 · Semana 24",
      patient: { name: "Mariño, Carlos Adolfo", num: "0320040058", sex: "Masculino", age: 62, dob: "11/03/1964", fertile: false },
      procs: ["procedimiento", "sangre"], estado: "listo", coordinador: "Valeria Araya", medico: "Dr. Federico Salas",
      wantsDoctor: true, doctorSeen: true, doctorSeenAt: "09:12",
      comments: [c("Valeria Araya", "Coordinación", "hace 2 h", "Llegó en ayunas. Extracción tomada 08:20.")] }),

    V({ id: "v02", time: "08:00", protoId: "meridian", visitTag: "V140", visitName: "Visita 140 · Seguimiento",
      patient: { name: "Machuca, Benjamín", num: "0180020040", sex: "Masculino", age: 47, dob: "02/07/1979", fertile: false },
      procs: ["procedimiento", "dispensacion"], estado: "no_vino", coordinador: "Nerina Rojas", medico: "Dr. Federico Salas",
      comments: [c("Nerina Rojas", "Coordinación", "hace 1 h", "No atiende el teléfono. Se reprograma para el jueves.")] }),

    V({ id: "v03", time: "08:30", protoId: "meridian", visitTag: "EOT", visitName: "Fin de tratamiento",
      patient: { name: "Martínez, Sofía Areli", num: "0180020026", sex: "Femenino", age: 34, dob: "19/01/1992", fertile: true },
      procs: ["procedimiento", "sangre", "ecg", "cuestionario"], estado: "atendido", coordinador: "Nerina Rojas", medico: "Dra. Marina Ruiz",
      wantsDoctor: true, doctorSeen: false, doctorMotivo: "Evento adverso",
      comments: [c("Camila Ferreyra", "Enfermería", "hace 38 min", "Refiere cefalea desde anoche. TA 148/92, requiere evaluación médica.")] }),

    V({ id: "v04", time: "08:30", protoId: "helios", visitTag: "F y V1", visitName: "Screening + Visita 1",
      patient: { name: "Lucero, Lucy", num: "0530272001", sex: "Femenino", age: 58, dob: "24/05/1968", fertile: false },
      procs: ["sangre", "procedimiento", "orina", "dispensacion"], estado: "en_el_sitio", coordinador: "Valeria Araya", medico: "Dr. Iván Pereda",
      comments: [] }),

    V({ id: "v05", time: "09:00", protoId: "corvus", visitTag: "V1", visitName: "Visita 1 · Basal",
      patient: { name: "Acurra, Alejandro", num: "0707406012", sex: "Masculino", age: 29, dob: "08/12/1996", fertile: false },
      procs: ["pk", "ecg", "sangre"], estado: "en_el_sitio", coordinador: "Nerina Rojas", medico: "Dr. Iván Pereda",
      comments: [c("Nerina Rojas", "Coordinación", "hace 20 min", "PK seriado: extracciones a 0, 30, 60 y 120 min.")] }),

    V({ id: "v06", time: "09:00", protoId: "atlas", visitTag: "V12", visitName: "Visita 12 · Semana 48",
      patient: { name: "Benítez, Paula", num: "0320040011", sex: "Femenino", age: 31, dob: "14/02/1995", fertile: true },
      procs: ["sangre", "dispensacion"], estado: "atendido", coordinador: "Camila Ferreyra", medico: "Dr. Federico Salas",
      wantsDoctor: true, doctorSeen: true, doctorSeenAt: "09:40", comments: [] }),

    V({ id: "v07", time: "09:30", protoId: "novara", visitTag: "V4", visitName: "Visita 4 · Semana 12",
      patient: { name: "Ojeda, Ramiro", num: "0910155007", sex: "Masculino", age: 51, dob: "30/09/1974", fertile: false },
      procs: ["cuestionario", "dispensacion"], estado: "por_llegar", coordinador: "Camila Ferreyra", medico: "Dra. Marina Ruiz", comments: [] }),

    V({ id: "v08", time: "10:00", protoId: "helios", visitTag: "V3", visitName: "Visita 3 · Ciclo 2",
      patient: { name: "Carrizo, María", num: "0530272014", sex: "Femenino", age: 39, dob: "07/06/1987", fertile: true },
      procs: ["sangre", "procedimiento"], estado: "por_llegar", coordinador: "Valeria Araya", medico: "Dr. Iván Pereda", comments: [] }),

    V({ id: "v09", time: "10:00", protoId: "atlas", visitTag: "VNP", visitName: "Visita no programada",
      patient: { name: "Costa, Julio", num: "0320040001", sex: "Masculino", age: 58, dob: "03/09/1967", fertile: false },
      procs: ["ecg"], estado: "por_llegar", coordinador: "Nerina Rojas", medico: "Dr. Federico Salas",
      wantsDoctor: true, doctorSeen: false, doctorMotivo: "Síntomas reportados",
      comments: [c("Valeria Araya", "Recepción", "hace 15 min", "Llamó por mareos. Se agenda VNP para hoy 10:00.")] }),

    V({ id: "v10", time: "10:30", protoId: "meridian", visitTag: "V8", visitName: "Visita 8 · Semana 16",
      patient: { name: "Salinas, Verónica", num: "0180020033", sex: "Femenino", age: 44, dob: "17/04/1982", fertile: true },
      procs: ["sangre", "orina", "dispensacion"], estado: "por_llegar", coordinador: "Camila Ferreyra", medico: "Dra. Marina Ruiz", comments: [] }),

    V({ id: "v11", time: "11:00", protoId: "corvus", visitTag: "V2", visitName: "Visita 2 · Día 8",
      patient: { name: "Aguirre, Tomás", num: "0707406020", sex: "Masculino", age: 26, dob: "21/11/1999", fertile: false },
      procs: ["pk", "sangre"], estado: "por_llegar", coordinador: "Nerina Rojas", medico: "Dr. Iván Pereda", comments: [] }),

    V({ id: "v12", time: "11:30", protoId: "novara", visitTag: "V1", visitName: "Visita 1 · Basal",
      patient: { name: "Duarte, Rocío", num: "0910155019", sex: "Femenino", age: 36, dob: "05/08/1990", fertile: true },
      procs: ["sangre", "ecg", "cuestionario", "dispensacion"], estado: "por_llegar", coordinador: "Valeria Araya", medico: "Dra. Marina Ruiz", comments: [] }),

    V({ id: "v13", time: "12:00", protoId: "helios", visitTag: "EOT", visitName: "Fin de tratamiento",
      patient: { name: "Ferrero, Nicolás", num: "0530272028", sex: "Masculino", age: 67, dob: "12/02/1959", fertile: false },
      procs: ["sangre", "procedimiento", "cuestionario"], estado: "por_llegar", coordinador: "Camila Ferreyra", medico: "Dr. Iván Pereda", comments: [] }),

    V({ id: "v14", time: "12:30", protoId: "atlas", visitTag: "V2", visitName: "Visita 2 · Semana 4",
      patient: { name: "Godoy, Elena", num: "0320040047", sex: "Femenino", age: 72, dob: "28/10/1953", fertile: false },
      procs: ["dispensacion"], estado: "fuera", coordinador: "Valeria Araya", medico: "Dr. Federico Salas",
      comments: [c("Valeria Araya", "Coordinación", "hace 3 h", "Visita completa. Kit KIT-00421 entregado.")] }),
  ];

  window.VX2 = {
    LIGHT, DARK, STAGES, NO_VINO, PROCS, PROTOCOLS, COORDINADORES, MEDICOS, VISITS, proto,
    MOTIVOS: ["Evento adverso", "Síntomas reportados", "Laboratorio fuera de rango", "Consulta clínica", "Otro"],
  };
})();
