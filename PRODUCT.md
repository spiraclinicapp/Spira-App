# Product

## Register

product

## Users

Personal de **centros de investigación clínica** en Argentina (nace en la **Fundación
Scherbovsky**, Mendoza), trabajando bajo marco regulatorio **ANMAT / ICH-GCP**, con datos
sensibles de paciente y exigencia de trazabilidad y auditoría.

- **Coordinadoras clínicas** (módulo Track): protocolos, pacientes, cronograma de visitas,
  checklists, agenda, desvíos y queries. Manejan el recorrido del paciente durante la jornada.
- **Farmacéuticas** (módulo Pharma, central — ve todos los protocolos): dispensación de
  medicación de investigación, stock por lote, recepción, reportes a sponsor.
- **Médicos**: cola "para ver médico" y atención durante la visita.
- **Administración / gerencia** (Contable, en roadmap): facturación y costos del estudio.

Su contexto es profesional y regulado, a menudo bajo presión de tiempo (las visitas del día),
con responsabilidad legal sobre la información. El trabajo a resolver: **ejecutar todo el flujo
del centro —coordinar visitas, dispensar medicación, registrar cada evento de forma auditable—
sin errores de operador y con calma.**

## Product Purpose

Spira es una **plataforma modular de investigación clínica**: un **Core compartido** (identidad,
RBAC, auditoría, RLS, realtime — sistema auditable ANMAT / ICH-GCP) sobre el que se montan
módulos independientes. **Track** (coordinación clínica) y **Pharma** (farmacia de investigación)
son los primeros; el roadmap suma **Lab**, **Contable/Gerencia**, módulo de **médicos** e
integraciones (WhatsApp, IA).

No es la unión de dos productos previos: esa fusión fue el punto de partida, no el objetivo. La
apuesta es la **base modular para todo el flujo del centro**. El éxito es que el centro opere
**todo** su flujo en Spira, de forma auditable, sin errores de operador, con la tranquilidad de
que cada acción queda trazada y es recuperable.

## Brand Personality

Tres palabras: **sereno, confiable, claro.** La marca transmite **confianza clínica y calma** —
nunca alarmista, nunca fría. La simpleza y la limpieza son valores centrales.

- **Voz:** español rioplatense, voseo en acciones dirigidas al usuario ("Ingresá", "Respirá
  tranquilidad", "Decímelo"). Primera persona institucional, sobria.
- **Tono:** profesional y humano. Sentence case en títulos y botones; MAYÚSCULAS con tracking
  solo en eyebrows/rótulos ("SUBMÓDULOS", "SOLO LECTURA").
- **Sin emoji** (resta formalidad en un entorno clínico) — se usan íconos de línea.
- El nombre **Spira** viene del latín *spirare* (respirar); el isotipo es el **vilano** (la
  semilla voladora del diente de león): respiración, vuelo, dispersión y cuidado. La emoción
  objetivo es que el usuario **respire tranquilidad** en un entorno de alta responsabilidad.

## Anti-references

Lo que Spira **no** debe parecer nunca (carriles a rechazar, confirmados con el equipo):

- **SaaS cripto/fintech oscuro:** dark mode con glows, gradientes violeta/cyan, tarjetas-métrica
  gigantes. El "AI slop" prototípico.
- **Software médico legacy:** gris institucional, denso, tablas infinitas, rojo de alarma por
  todos lados, cero aire.
- **App de consumo gamificada:** emojis, ilustraciones, saturación alta, confeti, tono casual.
- **Landing de startup genérica:** eyebrows en mayúscula sobre cada sección, cards idénticas,
  gradientes, copy marketinero.

Prohibiciones de forma que ya rigen el sistema: **sin gradientes, sin texturas, sin bounces ni
animaciones llamativas, sin italic** (suena demasiado editorial para lo clínico), **sin color
decorativo de más**. El color se usa con intención (marca, acento del módulo activo, estados).

## Design Principles

1. **Calma sobre alarma.** La información crítica se comunica con jerarquía y claridad, no con
   rojo y urgencia. El operador trabaja con datos sensibles, a veces bajo presión; el sistema
   baja revoluciones, no las sube.
2. **Cero ambigüedad para el operador.** Minimizar el texto libre; preferir valores
   preestablecidos y desplegables. El error del operador es un riesgo regulatorio, no un detalle
   de UX. Cada acción dice exactamente qué hace antes de hacerla.
3. **Lo regulatorio guía, no decora.** El marco ANMAT / ICH-GCP informa las decisiones
   (trazabilidad, auditoría, formalidad, datos sensibles) pero **nunca** aparece como copy ni
   como estética burocrática. Se siente confiable, no acartonado.
4. **Un solo sistema, muchos módulos.** El Core y todos los módulos comparten lenguaje visual;
   cada módulo tiene su acento dentro de la misma familia cromática, pero todo se siente la misma
   app. Lo nuevo hereda el sistema; no lo reinventa.
5. **La privacidad del paciente es un reflejo, no una opción.** Toda vista que muestre personas
   respeta la privacidad por defecto (avatar/iniciales, datos mínimos), de forma transversal.

## Accessibility & Inclusion

Objetivo: **WCAG 2.1 AA.**

- **Contraste:** texto normal ≥ 4.5:1; texto grande (≥18px o bold ≥14px) ≥ 3:1. Vigilar el punto
  flaco de la paleta serena de baja saturación: el texto `muted`/`faint` sobre papel cálido — si
  el contraste queda al límite, oscurecer hacia el ink antes que "afinar por elegancia".
- **Teclado:** foco visible en todo control (ya implementado vía `:focus-visible` global).
- **Movimiento:** `prefers-reduced-motion` respetado — la micro-interacción de pulsado y toda
  animación tienen alternativa; nada de bounces ni elásticos.
- **Color no es el único canal:** los acentos por módulo se distinguen por tono **y** luminancia,
  no solo por matiz; los estados se refuerzan con texto/ícono además del color.
- **Privacidad** del paciente transversal (ver principio 5).
