# SMTP — qué necesito para que Spira mande mails

**Estado al 2026-08-25: NO hay SMTP propio.** El proyecto usa el servicio incorporado de
Supabase, que el propio dashboard declara como *"not meant to be used for production apps"*.
Se ve en el banner amarillo de **Authentication → Emails**.

**Qué NO está bloqueado por esto:** el alta de cuentas y el restablecimiento forzado del panel de
accesos van por **link copiable** y no tocan el correo (ver
[`plan-alta-de-cuentas.md`](plan-alta-de-cuentas.md)). Esta guía es para cuando se quiera cerrar el
frente del mail, no antes.

**Qué SÍ está a medias hoy:** el *"olvidé mi contraseña"* del login. Funciona para una prueba
suelta, pero el límite del servicio incorporado es de unos pocos mails por hora **para todo el
proyecto**, así que si tres personas del centro lo usan la misma tarde, la tercera no recibe nada
y no se entera de por qué.

---

## 1 · El requisito que frena a todos: un dominio

Un proveedor de SMTP no deja mandar mails "desde" una dirección sin probar que el dominio es
propio. Para que Spira mande `no-reply@algo`, ese `algo` tiene que ser un dominio donde se puedan
tocar los **registros DNS**.

Son tres registros, que genera el proveedor y se pegan donde esté comprado el dominio:

| Registro | Para qué sirve | Qué pasa si falta |
|---|---|---|
| **SPF** | Declara qué servidores pueden mandar mail en nombre del dominio | El mail llega marcado como sospechoso |
| **DKIM** | Firma criptográfica de cada mail: prueba que no fue alterado ni falsificado | Gmail lo manda a spam directo |
| **DMARC** | Le dice al que recibe qué hacer si SPF o DKIM fallan | Cada proveedor decide por su cuenta |

Es copiar y pegar, no hay que entenderlos. Pero **sin ellos los mails van a spam**, que en la
práctica es lo mismo que no mandarlos.

**Los dos caminos:**

- **La Fundación ya tiene dominio** → pedirle al que administra el DNS que agregue los registros.
  Es lo ideal: el mail sale desde el dominio de la institución.
- **No hay dominio** → comprar uno (del orden de 10-15 dólares al año).

> **El atajo que existe y no conviene:** usar Gmail como SMTP con una "contraseña de aplicación".
> Evita todo lo anterior, pero los límites son bajos, Google lo corta sin aviso si detecta patrón
> automatizado, y el mail saldría desde una cuenta personal en un sistema clínico auditable.

## 2 · El proveedor

Para el volumen de Spira —invitaciones y restablecimientos de un centro, unos pocos por mes—
**cualquier plan gratuito sobra**. No es un frente de costo.

**Recomendado: Resend.** Es el que mejor se lleva con Supabase, la verificación de dominio es un
asistente de tres pasos, y el free tier es del orden de cien veces lo que Spira va a usar.
Alternativas igual de válidas: **Brevo**, **Postmark**, **Amazon SES** (el más barato a escala y el
más engorroso de configurar).

## 3 · Las variables

Lo que pide **Authentication → Emails → SMTP Settings**, con el valor que corresponde usando Resend:

| Campo en Supabase | Qué es | Valor con Resend |
|---|---|---|
| **Sender email** | La dirección que ve el que recibe | `no-reply@tudominio` |
| **Sender name** | El nombre que aparece como remitente | `Spira` |
| **Host** | Servidor de salida | `smtp.resend.com` |
| **Port** | Puerto | `587` |
| **Username** | Usuario | `resend` (literal) |
| **Password** | La API key del proveedor | la clave `re_...` |
| **Minimum interval** | Espera mínima entre mails | dejar el valor por defecto |

> ⚠️ **La `Password` es una credencial.** Va únicamente en ese formulario del dashboard: nunca en
> el repo, nunca en un `.env` del front, nunca por chat. Ninguna parte del código de Spira la
> necesita — el envío lo hace Supabase, no la app.

## 4 · Los pasos, en orden

1. Conseguir el dominio (o el permiso para tocar el DNS del que ya existe).
2. Crear la cuenta en el proveedor y agregar el dominio ahí.
3. Copiar los tres registros al DNS y verificar. Tarda de minutos a unas horas en propagar.
4. Generar la API key.
5. Cargar los siete campos en **Authentication → Emails → SMTP Settings** y guardar.
6. Ir a **Authentication → Rate Limits** y subir el límite de emails por hora. Arranca en 30 y
   **recién con SMTP propio el campo se deja editar** — de hecho, que ese campo esté bloqueado es
   la forma más rápida de confirmar que no hay SMTP configurado.
7. Probar con el *"olvidé mi contraseña"* del login, desde una dirección que no sea la propia. Si
   llega a la bandeja principal y no a spam, quedó bien.

## 5 · Qué gana Spira cuando esté

- El **"olvidé mi contraseña"** del login pasa de promesa a medias a funcionar para todo el equipo.
- En el panel de accesos se suma un botón **"Enviar por mail"** al lado de "Copiar link". No cambia
  nada de lo construido: el link copiable sigue siendo el camino principal y el mail queda como
  comodidad.
