# Mail de avance — Spira (primer mes, al 02/07/2026)

> Borrador de correo de avance para dirección. Período: 06/06 → 02/07/2026.
> Acompaña al **informe visual adjunto** (`informe-primer-mes.pdf`), que muestra las
> pantallas con capturas. Molde: continúa el mail de los 15 días (`mail-avance-15d-2026-06-13.md`).

---

**Para:** Pablo / Dirección — Fundación Scherbovsky
**De:** Lautaro Molina
**Asunto:** Spira — primer mes: de boceto a plataforma que funciona, se ve bien y es segura

*(Asuntos alternativos: «Spira · avance del primer mes: Track y Pharma andando sobre datos reales» — «Spira — resumen del mes: dos módulos funcionando, base auditable, y a 50 días de la fecha»)*

---

Pablo, te paso el avance del primer mes de Spira. Esta vez lo armé **visual**: adjunto un
informe con capturas de las pantallas reales para que se vea el trabajo, no solo se lea.

**En una línea:** hace un mes Spira era una idea con pantallas de muestra; hoy es una
**plataforma que se usa** —alguien inicia sesión, da de alta un paciente real, ve sus visitas,
recibe medicación y el inventario se mueve solo—, con dos módulos funcionando sobre datos
reales (**Track** y **Pharma**) y una base auditable de raíz.

El proyecto sigue organizado en tres pasos: (1) base de datos, (2) construir la app, (3) pulido
visual. El Paso 1 está cerrado y en producción; el Paso 2 avanzó fuerte en los dos módulos; y del
Paso 3 ya se ve la primera capa (la re-piel "Sereno" de Recepción).

## Lo logrado

**1. La diferencia entre un mockup y esto no es cosmética.**
Un boceto es una foto: se ve, pero no guarda nada, no valida nada, no distingue quién es quién.
Lo que se construyó este mes es el sistema por debajo de la foto —lo que cuesta y lo que da valor—:
cada persona ve únicamente lo suyo porque **la base misma lo hace cumplir** (lo verificamos en
vivo); cada acción sensible queda **registrada de forma imborrable** con quién, qué y cuándo (ya
probamos recuperar un paciente borrado desde ese registro); y las reglas clínicas duras **las
valida el servidor**, no la memoria del operador (no se puede randomizar sin firma y screening
previos). Todo sobre una base en producción (São Paulo, Ley 25.326), auditable ANMAT / ICH-GCP,
pasada por dos rondas de revisión de seguridad con veredicto aprobado.

**2. Track — el ciclo clínico completo de la visita, funcionando.**
Coordinación clínica sobre datos reales: protocolos y pacientes con la identidad protegida por
avatar, el **cronograma de visitas** de cada paciente (qué se hizo, qué viene, en qué semana), el
**editor del cuadro de actividades** por protocolo que genera esas visitas, el **tablero del día**
con el recorrido del paciente por el centro, la **cola "Para ver médico"** y el **radar de alertas**.
Le quedan retoques, pero el corazón ya opera.

**3. Pharma — la farmacia de investigación, de cero a funcionar de punta a punta.**
Prioricé este módulo porque entendí que es lo urgente de poner en marcha. Se recibe medicación, se
**verifica en dos pasos** y recién ahí se mueve el inventario, con **trazabilidad por lote** como
pide ANMAT. Distingue tres realidades sin mezclar inventarios —farmacia de protocolo, ambulatoria
y **producto de investigación** del sponsor—, con un asistente guiado por desplegables para reducir
el error del operador. El catálogo quedó sembrado con 24 drogas y 48 medicamentos del centro, y las
pruebas con kits reales del sponsor nos mostraron cómo vienen codificados: alcanza un lector de
código de barras común (nos ahorró comprar un lector 2D que no hacía falta).

**4. El sistema se dobla a tu criterio.**
Cuando definiste que el producto de investigación se recibe **macro por cantidad** (no kit por kit,
porque esa traza fina ya la lleva el sponsor en su IRT), reorientamos el módulo a ese criterio sin
romper lo auditable —y de paso sumamos un control: ahora una **excursión de temperatura bloquea el
ingreso** de stock.

## Estado actual

- **Paso 1 (base de datos):** completo y en producción. 39 actualizaciones aplicadas en orden.
- **Paso 2 (la app):** **Track** con lo grueso andando (le quedan retoques) y **Pharma** funcionando
  de punta a punta. Hito **v0.12.0**. Todo el código quedó respaldado y al día en GitHub.
- **Paso 3 (pulido visual):** arrancó — la re-piel "Sereno" ya está en Recepción, el foco suave de
  campos en toda la app, y el lenguaje visual quedó documentado como especificación (el pulido de
  las próximas pantallas es repetible, no artesanal).
- **Pendiente:** cerrar los objetivos que cambiaron en la última reunión, terminar los retoques de
  Track, y el despliegue de la app (hoy la base está en producción; la app todavía no).

## Un apunte honesto sobre el rumbo

En la última reunión hubo un cambio fuerte de objetivos y aparecieron definiciones que yo no tenía
sobre la mesa —algunas chocan con decisiones ya construidas. Prefiero decirlo claro.

Ahí entra **TrialMetrica**. Lo tomo en serio: es el sistema que hoy te funciona y marca la vara de
lo que el centro necesita ver —regulatorio, coordinación, tableros. La convergencia que veo es
natural, porque son capas distintas de una misma cosa: Spira construye la capa donde el dato **nace**
y se hace confiable (quién lo ve, qué queda registrado, qué reglas se cumplen), y esa misma
información puede alimentar los tableros que ya usás, con los números saliendo solos de la operación
en lugar de cargarse aparte. Cómo se ensambla —Spira como parte de TrialMetrica, o TrialMetrica
leyendo de Spira— es exactamente el tipo de definición que quiero cerrar con vos.

El caso del producto de investigación (kit por kit → macro) ya lo resolvimos y sirve de ejemplo del
criterio: el sistema se adapta a cómo trabaja el centro, no al revés. **Quedo atento a la reunión de
la semana que viene para alinear lo que sigue**: cuanto antes cerremos las definiciones que faltan,
más de esos ~50 días quedan para construir sobre firme y no para rehacer.

## Próximos pasos

1. Reunión de alineación de objetivos (semana que viene) y cierre de las definiciones pendientes.
2. Terminar los retoques de **Track**.
3. **Dispensación** en Pharma (entrega al paciente — el eslabón que audita ANMAT) y la vista de
   stock de ambulatoria.
4. Definir el **despliegue de la app** (para poder usarla fuera de mi máquina).

Mi orden de prioridades no cambia, y creo que coincidís: primero que **funcione**, después que se
**vea bien**, y por encima de todo que sea **seguro**. Quedo a disposición para mostrarlo andando
cuando quieras.

Saludos,
Lautaro

---

## Anexo técnico (para el equipo de desarrollo)

Avance por versión desde el último mail (v0.4.0) hasta hoy (v0.12.0).

| Versión | Hito | Migraciones |
|---|---|---|
| v0.4.0 | Track: ciclo de visita pre/post randomización + tablero por protocolo | `0012`–`0022` |
| v0.5.0 | Visitas del día (recorrido por etapas) + borrado de paciente recuperable | `0023`–`0025` |
| v0.6.0 | Cuadro de actividades completo + cierre clínico de visita + cola del médico persistente + login rediseñado (Google + recuperar contraseña) | `0026`–`0031` |
| v0.7.0 | Home del centro | — |
| v0.8.0 | Pharma 1a: catálogo global, recepción, stock por lote; laboratorio autodetectado; dosis/presentación | `0032`–`0034` |
| v0.9.0 | Recepción tipada (Protocolo / Ambulatoria), wizard de 4 pasos | `0035`–`0036` |
| v0.10.0 | Producto de Investigación (IP) rastreado por unidad | `0037` |
| v0.11.0 | Re-piel "Sereno" del submódulo Recepción + foco suave de inputs app-wide | — |
| v0.12.0 | Pivote del IP a **ingreso macro por cantidad** + GitHub al día (tags `v0.9.0`–`v0.12.0`) | `0038`–`0039` |

**Estado de despliegue:**
- **Base de datos:** en producción (Supabase, São Paulo `sa-east-1`), migraciones `0001`–`0039`
  aplicadas y verificadas en vivo.
- **Código:** todo pusheado a GitHub (`origin/main` al día), tags `v0.9.0`–`v0.12.0`.
- **App (front):** todavía **sin desplegar** — corre local; el deploy (Vercel + 2 env vars + dominio
  en Supabase Auth) queda a definir.

**Decisiones de dominio tomadas (no re-discutir):** IP = ingreso macro por cantidad por protocolo
(la traza por kit la lleva el sponsor/IRT) · excursión de temperatura **bloquea** el ingreso de IP ·
doble check (documentación firmada + acuse IRT) = verificación del IP · farmacia ambulatoria = ámbito
sin protocolo · recepción se verifica a cuatro ojos antes de impactar stock · `ip_units` (modelo
por-unidad) queda dormida tras el pivote.

**Referencias:** informe visual adjunto (`informe-primer-mes/index.html` → PDF), bitácoras en
`docs/bitacora/` (más reciente `2026-07-02.md`), `docs/#4- ROADMAP.md`, migraciones en
`supabase/migrations/` (`0001`–`0039`; ojo: el índice de `supabase/README.md` llega hasta la `0032`,
queda por actualizar).
