# Plan — Alta, restablecimiento y baja de cuentas desde el panel

**Pedido del Director (2026-08-25):** que gerencia pueda **crear cuentas, forzar el
restablecimiento de contraseña y eliminar usuarios** desde *Ajustes › Equipo y accesos*, sin
pasar por el dashboard de Supabase.

Continúa [`plan-ajustes-funcional.md`](plan-ajustes-funcional.md), que dejó esto anotado como el
escalón siguiente ("Alta de usuarios / invitación por mail: requiere Edge Function + SMTP") y
construyó la consola sobre la que esto se monta.

---

## Las dos decisiones ya tomadas

| Decisión | Qué se eligió | Por qué |
|---|---|---|
| Forma de "eliminar" | **Dos acciones separadas**: *Dar de baja* siempre; *Eliminar definitivamente* sólo habilitado si la cuenta nunca hizo nada, y cuando está gris dice el motivo | Nunca sorprende: se ve de antemano qué va a pasar. Es el criterio de honestidad de datos del proyecto |
| Cómo llega la invitación | **Link copiable** al portapapeles (WhatsApp, en persona). Sin SMTP | Funciona hoy. El mail se suma después sin rehacer nada |

**Fuera de alcance a propósito:** envío por mail (queda para cuando haya SMTP), edición del correo
de otra persona, y que el administrador vea o escriba una contraseña ajena (ver §Seguridad).

---

## Ocho hallazgos que condicionan el diseño

Todo esto salió de leer el schema y el front antes de diseñar. Cada uno cambia algo.

### 1 · "Eliminar" no puede ser un DELETE

`public.users` tiene **38 claves foráneas apuntándole** y casi todas sin `on delete`, o sea
`restrict`: `audit_log.actor_id`, `dispensations.executed_by`, `medication_receptions.received_by`,
`patients.enrolled_by`, `stock_movements.created_by`, `patient_timeline.actor_id`…

Y `public.users.id` cascadea desde `auth.users`. Borrar en Auth a alguien que alguna vez tocó el
sistema **falla con `23503`** — y está bien que falle: si funcionara, borraría el rastro de quién
dispensó qué, que es justamente lo que hay que conservar.

→ **Una cuenta virgen se borra de verdad. Una cuenta con historia sólo se da de baja.** Es el mismo
muro que ya se documentó en Medicamentos ("sólo se borra un alta nunca-usada").

### 2 · `is_active` hoy no bloquea nada

`public.users.is_active` existe desde la 0002, pero **`has_module` no lo consulta**
(`0006_rls_policies.sql:36`): sólo mira si hay fila en `user_module_roles`. Y el login de Supabase
Auth ni siquiera pasa por nuestra RLS.

→ La baja **no puede apoyarse en `is_active`**. Tiene que cortar en dos lugares: **revocar los
módulos** (corta la RLS) y **banear en Auth** (corta el ingreso). `is_active` pasa a ser el reflejo
de eso en la pantalla, no la causa.

### 3 · El alta ya está medio construida

`handle_new_user` (0008, extendida en 0095) crea el perfil solo al nacer la cuenta —con nombre desde
`raw_user_meta_data.full_name` y el correo— y **sin ningún rol**: default seguro deliberado. Y
`set_module_access` (0096) ya asigna módulos con sus guardas y su auditoría.

→ Crear una cuenta es **Auth + una llamada al RPC que ya existe**. No hay que tocar el modelo.

### 4 · La pantalla de "definí tu contraseña" ya existe y está en producción

El front ya escucha `PASSWORD_RECOVERY` y entra en modo `recovering`, con su pantalla y su
`updatePassword` (`src/lib/auth.tsx:160` y `:262`). Es el flujo del "olvidé mi contraseña" del login.

→ El link de invitación **aterriza en un camino ya probado**. No se construye ninguna pantalla
nueva para el que recibe la invitación.

### 5 · `generateLink` no manda mail — y eso acá es la ventaja

`auth.admin.generateLink({ type: 'recovery', email })` devuelve `action_link` **sin enviar nada**.
Es exactamente lo que pide la decisión de "link copiable", y sirve igual para el alta y para el
restablecimiento forzado: **un solo camino para las dos cosas**.

Requisito operativo: el `redirectTo` tiene que estar en los **allowed redirect URLs** del proyecto.

### 6 · Bajo `service_role`, `auth.uid()` es NULL — la auditoría quedaría sin actor

`audit_log.actor_id` tiene `default auth.uid()`. Una Edge Function con la clave de servicio no tiene
usuario: todo lo que escribiera quedaría como "acción del sistema" y **se perdería quién creó o dio
de baja a quién**, que es el dato entero.

→ La Function usa **dos clientes**: uno con el **JWT del administrador** (para verificar quién es y
para todo lo que deba quedar auditado) y otro **admin** sólo para lo que exige la clave de servicio.
El trabajo en la base va por el primero, así el actor se sella solo con el trigger que ya existe.

> Ojo, el mismo motivo por partida doble: si el request lleva un token de usuario, la clave de
> servicio **no** saltea la RLS. Los dos clientes tienen que ser instancias separadas.

### 7 · `public.users` no tiene trigger de auditoría

`trg_audit_module_roles` cubre `user_module_roles` desde la 0003, por eso la 0096 pudo no escribir
auditoría a mano. Pero `public.users` sólo tiene `trg_users_updated_at`: **apagar `is_active` no
dejaría ningún rastro**. Se verían los accesos revocados uno por uno, pero no que fue una baja de
cuenta ni quién la decidió.

→ La baja **escribe su línea de auditoría explícitamente**. No se le agrega el trigger genérico a
`public.users` a propósito: auditaría también cada cambio de nombre, de puesto y la sincronización
de correo que corre en cada login (0095), y un historial con ruido es un historial que nadie lee.

> Y un corolario de despliegue: `v_access_audit` filtra por `entity_type = 'user_module_roles'`, así
> que esa línea nueva **no se ve todavía**. Ensanchar la vista en el PR-1 la volvería *breaking* para
> el front desplegado —empezaría a emitir filas con `module` y `role` en null, que el código de hoy
> no sabe pintar— y la migración dejaría de poder aplicarse antes del deploy. Es el caso 0068/0092.
> **El ensanche va en el PR-3**, junto al front que lo sabe leer.

### 8 · No hay CLI de Supabase en el repo

No existe `supabase/config.toml` ni `supabase/functions/`, y `package.json` sólo trae
`@supabase/supabase-js`. La operativa del proyecto ya es "el Director aplica a mano en el
dashboard".

→ La Function se despliega **desde el dashboard**, igual que el SQL. El repo guarda el fuente como
fuente de verdad, con el mismo criterio que las migraciones.

---

## Arquitectura

```
  Panel (gerencia)                Edge Function                    Base
  ----------------                -------------                    ----
  Crear cuenta        --------->  admin.createUser()          -->  handle_new_user (0008/0095)
                                  + generateLink(recovery)         crea el perfil, SIN roles
                      <---------  action_link
                      --------------------------------------> set_module_access (0096)
                                    (con el JWT del admin)         audita solo

  Forzar cambio       --------->  generateLink(recovery)      -->  (nada)
                      <---------  action_link

  Dar de baja         --------------------------------------> dar_de_baja()  [RPC nuevo]
                                                                   revoca módulos + is_active
                      --------->  updateUserById(ban)              (el ban va DESPUÉS: ver abajo)

  Eliminar            --------------------------------------> user_activity_summary()  [RPC nuevo]
                      --------->  deleteUser()  -- 23503 -->  traducido a "tiene historial"
```

### Qué se construye

| Pieza | Qué hace |
|---|---|
| **Edge Function `admin-usuarios`** | Única puerta a la Admin API. Verifica `has_module('gerencia')` con el JWT del que llama **antes de cualquier cosa**. Cuatro acciones: `crear`, `link_restablecimiento`, `banear`, `eliminar` |
| **Migración: `user_activity_summary(uuid)`** | Cuántas visitas / dispensaciones / recepciones / pacientes registró una persona. Alimenta el copy del botón gris y decide si se habilita |
| **Migración: `dar_de_baja(uuid)`** | Revoca todos los módulos y pone `is_active = false` en una transacción. Reusa las guardas de la 0096 (no a vos mismo, no la última gerencia) |
| **UI en `EquipoYAccesosSection`** | Botón "Crear cuenta" + las tres acciones por persona + el panel del link con "Copiar" |
| **`src/data/team.ts`** | Las funciones de mutación contra la Function y los RPC, con los mensajes en castellano |

### El orden de la baja es fail-safe

Primero el RPC (revoca los módulos: la RLS deja de darle datos), después el ban en Auth. Si el ban
falla, la persona puede entrar pero **no ve nada**. Al revés —banear primero y que falle la
revocación— dejaría a alguien con permisos vigentes y la pantalla diciendo que está de baja.

---

## Seguridad

**La línea que no se cruza: el administrador nunca ve ni escribe una contraseña ajena.** La Admin
API lo permite; el diseño no. Todo el `audit_log` sella el actor con `auth.uid()`, así que si un
administrador pudiera poner una contraseña conocida podría operar como esa persona y el registro
diría que dispensó la farmacéutica cuando fue otro. Eso rompe el no-repudio que pide ICH-GCP, y es
lo único del sistema que la auditoría no puede reconstruir después.

Lo que sí puede: **generar un link de un solo uso y con vencimiento** que sólo la persona completa.
Mismo poder operativo (desbloquear a alguien que quedó afuera), sin el agujero.

Es el mismo criterio de las guardas que ya tiene la 0096: no podés quitarte la gerencia a vos mismo,
no se puede quitar la última.

### Checklist de la Function

- [ ] `has_module('gerencia')` verificado con el **JWT del que llama**, como primera operación real
- [ ] Cliente admin y cliente-del-usuario **separados** (hallazgo 6)
- [ ] La clave de servicio vive como **secret**, nunca en el repo ni en el bundle del front
- [ ] No se puede banear ni eliminar **a uno mismo** (espeja el guard de la 0096)
- [ ] No se puede dejar al centro **sin gerencia** (espeja el guard de la 0096)
- [ ] Toda acción queda en `audit_log` **con el administrador como actor**
- [ ] El `action_link` se devuelve una sola vez y **no se guarda** en ninguna tabla

---

## Fases

| PR | Qué entra | Verificación |
|---|---|---|
| **PR-1** | Migración: `user_activity_summary` + `dar_de_baja`. Sin UI | `npm run build` verde + los RPC probados contra una cuenta `TEST-*` |
| **PR-2** | Edge Function + `data/team.ts`. Sin UI todavía | La Function responde 403 a una cuenta sin gerencia (la prueba que importa) |
| **PR-3** | La UI: crear, los tres botones, el panel del link. Y el ensanche de `v_access_audit` para que la baja se vea en el historial (hallazgo 7) | El camino completo con una cuenta `TEST-*`: crear, copiar link, definir contraseña, dar de baja, eliminar |

⚠️ La migración del **PR-3** sí toca una vista que el front ya consume: esa va **DESPUÉS** del
deploy, al revés que las otras. Avisarlo en el chat, no sólo dentro del `.sql`.

El orden importa: las migraciones son **aditivas** (RPC nuevos que ningún front viejo consulta) →
**van antes del deploy**, como la 0093-0096.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La clave de servicio se filtra al front | Vive como secret de la Function. Revisión explícita de que no aparece en `dist/` |
| Un bug en la Function permite escalar privilegios | El chequeo de gerencia es la primera operación real y se prueba con una cuenta **sin** gerencia, no sólo con una que sí tiene (el usuario de QA tiene los cinco módulos y **no** reproduce las fallas de permisos) |
| El link se comparte por un canal inseguro | Un solo uso + vencimiento. Es el mismo riesgo que ya tiene el "olvidé mi contraseña" del login |
| Alguien se banea a sí mismo y el centro queda sin admin | Guard explícito, espejo del de la 0096 |
| Probar esto crea cuentas reales en prod | Sólo cuentas con prefijo `TEST-*`, borradas exactamente esas al terminar |

---

## Pendiente que esto NO cierra

- **Envío por mail**: cuando haya SMTP propio, se suma el botón "Enviar por mail" al lado de
  "Copiar link". No cambia nada de lo construido acá.
- **Reactivar una cuenta dada de baja**: la baja es reversible en Auth (el ban se levanta), pero la
  UI de reactivación no entra en este lote. Se evalúa después del PR-3.
