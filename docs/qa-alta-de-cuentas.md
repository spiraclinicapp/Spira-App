# Guion de prueba — Alta, restablecimiento y baja de cuentas

Para verificar de punta a punta la feature de las PRs **#82 → #83 → #84 → #85**
(`docs/plan-alta-de-cuentas.md`). Calculá **40-50 minutos** la primera vez.

> ## ⚠️ Reglas de esta prueba, antes de tocar nada
>
> 1. **Esto corre contra PRODUCCIÓN, con datos reales.** Todo lo que crees lleva el prefijo
>    **`TEST-`** en el nombre, y al final borrás **exactamente eso** y nada más.
> 2. **Nunca borres en lote** ni "todo lo que sea de tipo X". Ya pasó una vez que se perdió data
>    real y hubo que recuperarla del `audit_log`.
> 3. Si algo sale distinto a lo esperado, **anotá el paso y seguí** con lo que no dependa de eso.
>    Al final hay una tabla de síntomas.

**Correo de la cuenta de prueba:** usá un alias de tu propio Gmail, así el `+` te lo separa solo:

```
spiraclinic.dev+test0825@gmail.com
```

**Nombre de la cuenta de prueba:** `TEST- Ana Prueba`

---

## Fase 0 · Puesta en marcha (el orden importa)

- [ ] **0.1** Mergear en la GitHub, **en este orden**: **#82**, después **#83**, después **#84**,
      después **#85**. Cada una hay que **reapuntar su base a `main`** cuando la anterior entra
      (GitHub te lo ofrece; si no, se edita la PR y se cambia el base branch).
- [ ] **0.2** Aplicar las migraciones **0097**, **0098** y **0099** en el
      [SQL Editor](https://supabase.com/dashboard/project/ojfgfolxfiltksblekgi/sql/new), en orden y
      una por una. Son aditivas: van **antes** del deploy.
- [ ] **0.3** Desplegar la Edge Function.
      [Edge Functions](https://supabase.com/dashboard/project/ojfgfolxfiltksblekgi/functions) →
      *Deploy a new function* → *Via Editor*. Nombre **exactamente** `admin-usuarios`, y pegar el
      contenido de `supabase/functions/admin-usuarios/index.ts`.
      → *Si el nombre no coincide, el front recibe un 404 mudo.*
- [ ] **0.4** Agregar la URL de Spira a los redirect permitidos.
      [URL Configuration](https://supabase.com/dashboard/project/ojfgfolxfiltksblekgi/auth/url-configuration)
      → *Redirect URLs* → agregar la URL de producción (la de Vercel).
      → *Sin esto, el link de contraseña no vuelve a ningún lado.*
- [ ] **0.5** Esperar a que **Vercel termine el deploy de `main`**. No sigas hasta que esté verde.
- [ ] **0.6** **RECIÉN AHORA** aplicar la migración **0100**.
      → *Es la única que va después. Aplicarla antes no rompe la pantalla: la deja escribiendo
      frases falsas en el historial de auditoría.*

---

## Fase 1 · Crear la cuenta

- [ ] **1.1** Entrar a Spira con tu cuenta y abrir **Ajustes → Equipo y accesos**.
- [ ] **1.2** Verificar que arriba a la derecha de "Equipo del centro" aparece el botón
      **"Crear cuenta"**, y que el texto de abajo **ya no dice** que las cuentas se crean desde
      Supabase.
- [ ] **1.3** Pulsar **Crear cuenta**. Cargar el nombre `TEST- Ana Prueba` y el correo del alias.
- [ ] **1.4** Antes de confirmar, verificar que el diálogo avisa que **la cuenta nace sin acceso a
      ningún módulo**.
- [ ] **1.5** Pulsar **Crear cuenta**.

**Esperado:** el diálogo cambia a "Cuenta creada" y muestra el link completo.

- [ ] **1.6** Pulsar **Copiar link** y verificar que el botón cambia a **"Copiado"**.
- [ ] **1.7** Pegar el link en un bloc de notas: lo vas a necesitar en la Fase 2 y es de **un solo
      uso**.
- [ ] **1.8** Cerrar con **Listo** y verificar que `TEST- Ana Prueba` aparece en la lista con el chip
      **"Sin acceso a módulos"**.

---

## Fase 2 · Definir la contraseña (como si fueras ella)

> Usá una **ventana de incógnito**. Si lo hacés en tu ventana normal te desloguea a vos.

- [ ] **2.1** Abrir una ventana de incógnito y pegar el link.
- [ ] **2.2** **Esperado:** Spira abre directamente en la pantalla **"Definí tu nueva contraseña"**,
      sin pedir usuario ni contraseña.
- [ ] **2.3** Poner una contraseña de prueba y confirmar.
- [ ] **2.4** **Esperado:** entra a Spira sin tener que loguearse de nuevo.
- [ ] **2.5** Verificar que **sólo ve el Inicio**: ningún módulo en la barra.
      → *Es el default seguro: una cuenta nueva no ve nada hasta que le des acceso.*
- [ ] **2.6** Abrir **Ajustes → Equipo y accesos** en esa ventana.
      **Esperado:** ve **"Tu acceso"** —su propia ficha— y **no** la lista del equipo ni el botón
      de crear.

---

## Fase 3 · La prueba que más importa: el 403

> Esto verifica que alguien sin gerencia **no puede** administrar cuentas aunque llame a la
> Function directo, salteando la pantalla. Es la única prueba que no se puede hacer con clicks.
>
> **Ojo:** el usuario de QA de siempre tiene los cinco módulos y **no sirve** para esto. Por eso se
> usa la cuenta `TEST-`, que no tiene ninguno.

- [ ] **3.1** En la ventana de incógnito (logueada como `TEST- Ana Prueba`), abrir la consola del
      navegador con **F12** → pestaña **Console**.
- [ ] **3.2** Pegar esto y dar Enter:

```js
const k = Object.keys(sessionStorage).find(x => x.startsWith('sb-') && x.endsWith('-auth-token'))
const token = JSON.parse(sessionStorage[k]).access_token
const r = await fetch('https://ojfgfolxfiltksblekgi.supabase.co/functions/v1/admin-usuarios', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, apikey: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ accion: 'crear', email: 'no-deberia@existir.com', fullName: 'X' }),
})
console.log(r.status, await r.json())
```

- [ ] **3.3** **Esperado:** `403 { error: "No tenés permiso para administrar cuentas." }`

> 🚨 **Si devuelve 200, pará todo.** Significa que cualquiera con una cuenta puede crear usuarios.
> Avisame y no sigas: hay que revisar la Function antes de dejar esto en producción.

- [ ] **3.4** Verificar en tu ventana normal que **no se creó** ninguna cuenta `no-deberia@existir.com`.

---

## Fase 4 · Darle acceso

- [ ] **4.1** En tu ventana, **Editar acceso** sobre `TEST- Ana Prueba`.
- [ ] **4.2** Darle **Coordinación · Lectura**. Guardar.
- [ ] **4.3** En la ventana de incógnito, recargar. **Esperado:** ahora ve Coordinación.
- [ ] **4.4** Volver a su ficha y mirar el **Historial de accesos**.
      **Esperado:** dos líneas — *"Vos creaste la cuenta de TEST- Ana Prueba"* y *"Vos le diste
      acceso a Coordinación"*.
      → *La primera sólo aparece si la 0100 está aplicada. Si falta, el alta no se ve.*

---

## Fase 5 · Forzar el restablecimiento

- [ ] **5.1** En la ficha de `TEST- Ana Prueba`, bloque **La cuenta** → **Generar link**.
- [ ] **5.2** **Esperado:** aparece un link nuevo, distinto al de la Fase 1.
- [ ] **5.3** Copiarlo, abrirlo en la ventana de incógnito (deslogueate primero) y poner otra
      contraseña.
- [ ] **5.4** **Esperado:** entra con la nueva.
- [ ] **5.5** Probar el link **de la Fase 1** otra vez. **Esperado:** ya no funciona (es de un solo
      uso).

---

## Fase 6 · El botón gris (sin tocar nada)

- [ ] **6.1** Abrir la ficha de **una persona real del equipo** que venga trabajando hace tiempo.
- [ ] **6.2** Mirar el bloque **La cuenta** → fila **Eliminar definitivamente**.
      **Esperado:** el botón está **gris** y al lado dice algo como *"No se puede eliminar: registró
      34 visitas y 12 dispensaciones. La auditoría tiene que conservarlos. Podés darle de baja."*
- [ ] **6.3** Verificar que los números **tienen sentido** para esa persona.
- [ ] **6.4** Abrir **tu propia** ficha. **Esperado:** los dos botones grises, con el motivo
      *"No podés… a vos mismo"*.

> **No pulses nada acá.** Esta fase es sólo mirar.

---

## Fase 7 · Dar de baja

- [ ] **7.1** Ficha de `TEST- Ana Prueba` → **Dar de baja**.
- [ ] **7.2** Leer la confirmación. **Esperado:** avisa que pierde todos los accesos **y que su
      historial se conserva**.
- [ ] **7.3** Confirmar.
- [ ] **7.4** **Esperado en la lista:** aparece con el chip rojo **"Dada de baja"** y sin módulos.
- [ ] **7.5** En la ventana de incógnito, cerrar sesión e intentar entrar con su correo y
      contraseña. **Esperado:** **no puede entrar**.
      → *Si entra, el ban de Auth falló aunque la revocación haya funcionado. Anotalo.*
- [ ] **7.6** En su ficha, mirar el historial. **Esperado:** una línea que dice que la diste de baja,
      **además** de las de los módulos revocados.

---

## Fase 8 · Eliminar (y limpiar)

> La cuenta `TEST-` nunca registró actividad clínica, así que acá el botón **sí** tiene que estar
> habilitado. La limpieza y la última prueba son la misma cosa.

- [ ] **8.1** En su ficha, verificar que **Eliminar** está **habilitado** y que el texto dice que
      nunca registró actividad.
- [ ] **8.2** Pulsar **Eliminar**, leer la confirmación (tiene que decir que **no se puede
      deshacer**) y confirmar.
- [ ] **8.3** **Esperado:** vuelve a la lista y `TEST- Ana Prueba` **ya no está**.
- [ ] **8.4** Verificar en
      [Authentication → Users](https://supabase.com/dashboard/project/ojfgfolxfiltksblekgi/auth/users)
      que el correo del alias tampoco está.

---

## Fase 9 · La auditoría quedó bien

Correr esto en el [SQL Editor](https://supabase.com/dashboard/project/ojfgfolxfiltksblekgi/sql/new):

```sql
select occurred_at, action, entity_type,
       before_data ->> 'full_name' as nombre_en_payload,
       after_data  ->> 'full_name' as nombre_alta,
       actor_id
from   public.audit_log
where  entity_type = 'users'
order  by occurred_at desc
limit  10;
```

- [ ] **9.1** **Esperado:** tres filas de la cuenta de prueba — `ALTA`, `BAJA` y `ELIMINACION`.
- [ ] **9.2** **Esperado:** las tres tienen `actor_id` cargado (**no** null).
      → *Si sale null, la Function escribió con la clave de servicio y se perdió quién lo hizo. Es
      el hallazgo 6 del plan; avisame.*
- [ ] **9.3** **Esperado:** la fila de `ELIMINACION` conserva el nombre en el payload — es la única
      constancia de que esa cuenta existió.

---

## Si algo sale mal

| Lo que ves | Qué mirar |
|---|---|
| *"Falta desplegar una actualización del sistema"* | La Function no está, o el nombre no es exactamente `admin-usuarios` (paso 0.3) |
| *"Falta aplicar una actualización del sistema"* | Falta alguna migración: 0098 o 0099 (paso 0.2) |
| El link abre Spira pero **pide login** en vez de la pantalla de contraseña | La URL no está en *Redirect URLs* (paso 0.4) |
| El historial dice *"volvió a guardar el acceso… sin cambiar el nivel (—)"* | La **0100 se aplicó antes del deploy**. Se arregla deployando; no se pierde nada |
| El alta no aparece en el historial | Falta la **0100** (paso 0.6) |
| **La Fase 3 devuelve 200** | 🚨 Pará. Agujero de permisos en la Function |
| Puede entrar después de darla de baja | El ban de Auth falló. La revocación de módulos sí funcionó, así que no ve nada — pero hay que arreglarlo |
| *"Ya existe una cuenta con ese correo"* | Quedó una prueba anterior. Buscala en Authentication → Users y borrala **sólo si es la del alias** |

---

## Al terminar

- [ ] La cuenta `TEST-` está eliminada (Fase 8).
- [ ] No quedó ninguna otra cuenta de prueba en Authentication → Users.
- [ ] Anotaste lo que salió distinto, con el número de paso.
- [ ] Marcar las migraciones **0097-0100** como *"Aplicada en prod (fecha)"* en
      `supabase/README.md` — CI lo vigila con `scripts/check-migraciones.mjs`.
