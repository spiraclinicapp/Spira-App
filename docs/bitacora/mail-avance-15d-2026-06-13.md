# Mail de avance — Spira (al 16/06/2026)

> Borrador de correo de avance para dirección. Período cubierto: 30/05 → 16/06/2026
> (de hecho, toda la vida del proyecto: el repositorio nace el 06/06). Redactado el 13/06,
> actualizado el 16/06.

---

**Para:** Pablo / Dirección — Fundación Scherbovsky
**De:** Lautaro Molina
**Asunto:** Spira — avance de las últimas dos semanas: base lista y módulo Track completo

---

Pablo, te paso el avance de estas dos semanas de Spira (la unificación de Track y Pharma en
una sola plataforma).

**En una línea:** la base de datos quedó terminada y en producción, y el módulo **Track**
(coordinación clínica) está prácticamente completo y funcionando sobre datos reales. El módulo
**Pharma** y el panel de gerencia quedan para la etapa siguiente.

El proyecto está organizado en tres pasos: (1) base de datos, (2) construir la app, (3) pulido
visual. En estas dos semanas cerramos el Paso 1 y avanzamos casi todo el Paso 2 del lado de Track.

## Lo logrado

**1. Base de datos unificada — terminada y en producción.**
Diseñamos desde cero el modelo de datos que une las dos aplicaciones, con auditoría de todo lo que
pasa en el sistema (requisito para investigación clínica) y aislamiento de información por protocolo
(cada coordinadora ve solo lo suyo; la farmacia ve el conjunto). Pasó por dos rondas de revisión de
seguridad y quedó desplegado en un servidor en São Paulo, que cumple la ley de datos personales
(Ley 25.326). Verificamos en vivo que el aislamiento de acceso funciona.

**2. La aplicación: login, roles y las vistas de Track.**
- **Acceso real y por rol:** cada persona entra con su usuario y ve únicamente los módulos y acciones
  que le corresponden según su rol (de "solo ver" hasta administración).
- **Protocolos y pacientes:** pantalla principal con los protocolos en tarjetas, buscador unificado,
  y el alta de protocolos y de pacientes ya conectada.
- **Resumen (tablero general de Track):** indicadores clave (protocolos y pacientes activos, ítems
  vencidos, próximas visitas a 7 días), próximas visitas agrupadas por día y panel de alertas.
- **Agenda semanal:** grilla de lunes a viernes con reprogramación de visitas validada contra la
  ventana permitida por el patrocinador.
- **Plantillas de checklist:** editables por protocolo, con los permisos correctos (solo quien
  corresponde puede modificarlas).
- **Tablero de protocolo y ficha de paciente (esta semana):** al abrir un protocolo se ve su tablero
  con indicadores y el recorrido de visitas de cada paciente; desde ahí se entra a la ficha individual.
  Incluye las acciones de registrar visita, editar protocolo, exportar reporte y reprogramar.

**3. Privacidad de pacientes en toda la aplicación.**
El identificador visible del paciente es su número de sujeto; el nombre real queda oculto detrás de
un avatar y solo aparece al pasar el mouse. Esto aplica en todas las pantallas, no solo en las nuevas.

**4. Identidad visual y consistencia.**
Toda la app respeta la identidad de marca, con un estándar de interacción uniforme (los elementos
responden al pasarles el mouse y al hacer clic, sin depender del cursor — pensado también para
usuarios menos técnicos).

**5. Edición de datos y el ciclo real de visitas clínicas (esta semana).**
- **Editar protocolo y editar paciente** desde la app, con confirmación antes de guardar. El número
  de sujeto es una identidad sensible: si se cambia, se pide reescribirlo para evitar errores de tipeo.
- **Número de sujeto (IVRS) opcional:** el paciente se puede dar de alta antes de tener el IVRS (que el
  sistema del patrocinador asigna recién en la randomización). Hasta que se carga, aparece como "Sin IVRS".
- **Médico tratante por paciente:** pasó a ser un dato de la persona (puede ir cambiando), no del
  estudio puntual.
- **Ciclo de visitas pre/post randomización:** modelamos el flujo real del paciente. Antes de la
  randomización se registran las visitas a medida que pasan (firma, screening, firma+screening, visitas
  no programadas); al registrar la **randomización**, el sistema **genera automáticamente el cronograma**
  de visitas del protocolo anclado en esa fecha; después se siguen las visitas programadas, con la
  opción de registrar extras (no programadas / retest). Cada visita genera su checklist. Las reglas
  clínicas (p. ej. no se puede randomizar sin firma y screening previos) las valida el servidor.

## Estado actual

- **Paso 1 (base de datos):** completo y en producción.
- **Paso 2 (la app):** el módulo **Track quedó completo** sobre datos reales. Marca el hito **v0.3.0**.
- **Pendiente:** el módulo **Pharma** (dispensaciones y stock) sigue como vista provisoria, el
  **panel de gerencia** (para asignar roles con clics, hoy se hace a mano) y el pulido visual final.

## Próximos pasos

1. Cargar el esquema de visitas de los protocolos reales para que el tablero y la agenda muestren el
   recorrido de cada paciente con datos (hoy solo lo tienen los protocolos de prueba).
2. Integrar a producción el trabajo del tablero y la ficha (consolidar la rama de esta semana en la
   línea principal del proyecto).
3. Construir el módulo **Pharma** y conectar el traspaso Track → Farmacia.
4. **Panel de gerencia:** asignación de roles con clics.
5. Pulido visual final para que Track y Pharma se vean como un solo producto.

Cualquier cosa, quedo a disposición para mostrarlo funcionando.

Saludos,
Lautaro

---

## Anexo técnico (para el equipo de desarrollo)

Detalle por jornada y referencias de implementación.

| Fecha | Hito | Artefactos |
|---|---|---|
| 06/06 | Paso 1 — schema unificado (26 tablas, 71 policies RLS), 2 rondas adversariales, despliegue Supabase Pro sa-east-1 | migraciones `0001`–`0008` |
| 07/06 | Paso 2 core — Vite + React 19 + TS, AppShell, login Supabase, gating por rol, niveles de rol estrictos | migración `0009` |
| 08/06 | Router de contenido + 1ª vista a datos reales (Pacientes); cambio estructural: Pacientes vive dentro de Protocolos; Pharma lee enrollments | migración `0010` |
| 09/06 | Refresh visual del selector de Protocolos + micro-interacción global; columna `description` | migración `0011` |
| 12/06 | Altas cableadas, Resumen (`v_track_visits`), Agenda semanal con validación de ventana, Plantillas + scoping RLS, RPCs de alta/reorden | migraciones `0012`–`0015` |
| 13/06 | Tablero de Protocolo + Ficha de Paciente (handoff hi-fi), data layer, acciones (registrar/editar/exportar/reprogramar), privacidad global | migraciones `0016`–`0018` |
| 14/06 | Encabezado/breadcrumb unificado, modal editar protocolo, botones a infinitivo, baja del campo "fase", **editar paciente** (incl. estado y médico); gerencia puede editar el médico | migración `0019` |
| 15/06 | Médico tratante → atributo de `patients`; IVRS opcional + 1er intento de visitas diferidas; brainstorm → spec → plan del modelo de visitas (`docs/superpowers/`) | migraciones `0020`, `0021` |
| 16/06 | **Modelo de visitas unificado** (pre/post randomización: `kind`, RPC `register_visit_event`, generación diferida del cronograma, checklist en todas, registrar visita por etapa). Revisión adversarial de la migración + verificación en vivo (cazó 2 bugs: RPC de alta v5 y guard del cronograma) | migración `0022` |

**Estado de despliegue:**
- Las migraciones **0012–0022 están aplicadas y validadas en vivo**: alta de paciente, Resumen,
  Agenda, Detalle de Protocolo, Ficha de Paciente y el **ciclo de visitas pre/post randomización**
  funcionando sobre datos reales. El flujo de visitas (firma → screening → randomización → cronograma,
  + VNP/Retest, checklist, bloqueos por reglas) se verificó de punta a punta el 16/06.
- Para ver el cronograma con más visitas en los protocolos reales (THESEUS, CEREN-2, AIRLYMPUS) falta
  cargarles el esquema de visitas (`visit_definitions`); hoy casi no lo tienen, por eso randomizar
  genera pocas o ninguna visita programada (es esperado, no un error).
- Pendiente menor (para mañana): en la grilla del Detalle de Protocolo, los pacientes pre-randomización
  todavía muestran "sin esquema" en lugar de sus visitas sueltas (la ficha individual sí las muestra).
- Ramas sin mergear a `main`: `feat/protocolos-unifica-pacientes` y `feat/tablero-protocolo-ficha`.
  Decidir merge y taggear **v0.3.0**.

**Decisiones de dominio tomadas (no re-discutir):** falla = falla de screening · 4º KPI = próximas
visitas a 7 días · número de sujeto lo asigna el IVRS (texto libre) · al reprogramar se mueve solo la
fecha estimada (la ventana del patrocinador queda fija, a confirmar) · adherencia = visitas realizadas /
programadas · privacidad en toda la app.

**Referencias:** bitácoras en `docs/bitacora/` (06, 07, 08, 09, 12, 13, 14, 15 y 16 de junio),
diseño del modelo de visitas en `docs/superpowers/specs/` y `docs/superpowers/plans/`, `docs/ROADMAP.md`,
índice de migraciones en `supabase/README.md` (0001–0022).
