/**
 * Spira · Edge Function `admin-usuarios`
 * =============================================================================
 * La ÚNICA puerta a la Admin API de Supabase Auth. Crea cuentas, genera links para definir o
 * restablecer la contraseña, bloquea el ingreso y elimina cuentas vírgenes.
 *
 * Es la primera Edge Function del proyecto. Cómo se despliega (desde el dashboard, porque acá no
 * hay CLI de Supabase) está en `supabase/functions/README.md`.
 *
 * ── POR QUÉ ESTO NO PUEDE VIVIR EN EL NAVEGADOR ─────────────────────────────
 * La Admin API exige la clave de servicio, que SALTEA TODA LA RLS. Puesta en el front estaría en el
 * bundle, o sea sería pública: cualquiera podría leer y escribir la base entera. Acá vive como
 * secret del lado del servidor y nunca sale de este archivo.
 *
 * ── LOS DOS CLIENTES, Y POR QUÉ SON DOS ─────────────────────────────────────
 * `comoUsuario` lleva el JWT de quien llama y sirve para saber QUIÉN es y si tiene gerencia.
 * `admin` lleva la clave de servicio y hace únicamente el trabajo de Auth.
 *
 * No se pueden fusionar en uno, por dos motivos independientes:
 *   1 · Si un request lleva un token de usuario, la clave de servicio NO saltea la RLS: el request
 *       corre bajo las policies de ese usuario. Un cliente mezclado se comportaría distinto según
 *       qué header ganara, que es la clase de ambigüedad que no se quiere en un control de acceso.
 *   2 · `auth.uid()` es NULL bajo la clave de servicio. Todo lo que escribiera en la base quedaría
 *       en el audit_log como "acción del sistema" y se perdería quién hizo qué.
 *
 * Por eso ESTA FUNCIÓN NO ESCRIBE EN LA BASE. Lo que tiene que quedar auditado —asignar accesos,
 * dar de baja, registrar el alta— lo hace el front con su propia sesión, llamando a los RPC. Acá
 * sólo pasa lo que es estrictamente de Auth.
 *
 * ── LO QUE DELIBERADAMENTE NO HACE ──────────────────────────────────────────
 * No expone ninguna forma de VER ni de FIJAR la contraseña de otra persona. La Admin API lo
 * permite; el diseño no. Si un administrador pudiera poner una contraseña conocida, podría operar
 * como esa persona y el audit_log diría que dispensó la farmacéutica cuando fue otro. Eso rompe el
 * no-repudio que pide ICH-GCP, y es lo único del sistema que la auditoría no puede reconstruir
 * después. Lo que sí puede es generar un link de un solo uso que sólo la persona completa.
 * =============================================================================
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

/* El front y la Function viven en dominios distintos, así que el navegador manda un preflight antes
   de cada POST. Sin estos headers el request muere en el preflight y el error que se ve en consola
   habla de CORS, no del problema real. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, cuerpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Los mensajes salen en castellano y ya listos para mostrar: el front no traduce nada de acá. */
function error(status: number, mensaje: string): Response {
  return json(status, { error: mensaje })
}

/**
 * Error que NO supimos traducir: se loguea entero y se muestra el texto original entre comillas.
 *
 * Antes esto devolvía "Probá de nuevo en un momento" y nada más, y el primer alta real falló con un
 * motivo perfectamente explícito del lado de Auth que no llegó a ninguna parte: ni a la pantalla ni
 * a los logs. Quien administra se quedó mirando un cartel que no decía nada.
 *
 * Mostrar el texto crudo es seguro acá: son errores de Auth sobre la operación que la propia
 * persona acaba de pedir, no datos de terceros, y sólo gerencia llega a esta pantalla. Entre un
 * mensaje feo y un mensaje inútil, el feo se puede arreglar.
 */
function errorOpaco(accion: string, e: unknown, encabezado: string): Response {
  const detalle = (e as { message?: string })?.message ?? String(e)
  console.error(`[admin-usuarios] ${accion} falló:`, detalle)
  return json(500, { error: `${encabezado} El sistema respondió: «${detalle}»` })
}

/**
 * Contraseña inicial que nadie va a conocer nunca: la cuenta nace con ella y la persona la
 * reemplaza con el link. No se devuelve, no se registra y no se puede recuperar — es basura
 * criptográfica cuya única función es que la cuenta exista antes de generar el link.
 *
 * ⚠️ TIENE QUE QUEDAR POR DEBAJO DE 72 CARACTERES. Auth hashea con bcrypt, que no acepta más, y
 * rechaza el alta entera con "Password cannot be longer than 72 characters". La primera versión
 * concatenaba DOS uuid (36 + 36) más un sufijo: 74, y ninguna cuenta se podía crear.
 *
 * Un uuid v4 son 122 bits de entropía, de sobra para una clave que vive minutos y que nadie tipea.
 * El sufijo garantiza que haya mayúscula, minúscula, dígito y símbolo por si el proyecto tiene
 * exigencias de composición activadas.
 */
function passwordDescartable(): string {
  return crypto.randomUUID() + 'Aa1!'   // 36 + 4 = 40
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return error(405, 'Método no permitido.')

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) {
    // Pasa si la Function se desplegó sin sus secrets. Se dice claro para no perder una tarde.
    return error(500, 'La función no está configurada. Faltan sus variables de entorno.')
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return error(401, 'Tu sesión venció.')

  // ── 1 · Quién llama ────────────────────────────────────────────────────────
  const comoUsuario = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: sesion, error: errSesion } = await comoUsuario.auth.getUser()
  const quienLlama = sesion?.user
  if (errSesion || !quienLlama) return error(401, 'Tu sesión venció.')

  /* ── 2 · ¿Tiene gerencia? PRIMERA verificación real, antes de tocar nada ───
     Se pregunta leyendo `user_module_roles` CON EL CLIENTE DEL USUARIO, no con el admin: así la
     respuesta la da la RLS (policy "ver roles propios o gerencia", 0006) y no un `if` de este
     archivo. Con el cliente admin la consulta saltearía la RLS y habría que confiar en que el
     filtro por id está bien escrito — el día que ese filtro se caiga en un refactor, cualquier
     autenticado sería administrador. */
  const { data: acceso, error: errAcceso } = await comoUsuario
    .from('user_module_roles')
    .select('module')
    .eq('user_id', quienLlama.id)
    .eq('module', 'gerencia')
    .maybeSingle()

  if (errAcceso) return error(500, 'No pudimos verificar tus permisos. Probá de nuevo.')
  if (!acceso) return error(403, 'No tenés permiso para administrar cuentas.')

  // ── 3 · Qué pide ───────────────────────────────────────────────────────────
  let cuerpo: Record<string, unknown>
  try {
    cuerpo = await req.json()
  } catch {
    return error(400, 'No pudimos leer el pedido.')
  }

  const accion = String(cuerpo.accion ?? '')
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  /* El `redirectTo` del link vuelve a la app, donde auth-js lee los tokens de la URL y dispara
     PASSWORD_RECOVERY: ahí el front entra en modo `recovering` y muestra "Definí tu contraseña".
     Ese camino ya existe y está en producción — es el del "olvidé mi contraseña" del login.
     OJO: esta URL tiene que estar en los "Redirect URLs" permitidos del proyecto
     (Authentication → URL Configuration) o Auth la ignora y el link no vuelve a ningún lado. */
  const destino = String(cuerpo.redirectTo ?? '') || undefined

  switch (accion) {
    /* ── Crear una cuenta ────────────────────────────────────────────────────
       La cuenta nace CONFIRMADA y sin ningún rol. Sin roles porque `handle_new_user` (0008) no
       asigna ninguno a propósito: el default seguro es no ver nada, y el acceso lo da después el
       front con `set_module_access`, que lo deja auditado. Confirmada porque sin SMTP nadie podría
       confirmar el correo, y una cuenta pendiente de confirmación no puede entrar. */
    case 'crear': {
      const email = String(cuerpo.email ?? '').trim().toLowerCase()
      const fullName = String(cuerpo.fullName ?? '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error(400, 'Ingresá un correo válido.')
      if (!fullName) return error(400, 'El nombre no puede quedar vacío.')

      const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
        email,
        password: passwordDescartable(),
        email_confirm: true,
        // `handle_new_user` lee full_name de acá para armar el perfil (0008, extendida en 0095).
        user_metadata: { full_name: fullName },
      })

      if (errCrear || !creado?.user) {
        const msg = (errCrear?.message ?? '').toLowerCase()
        if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
          return error(409, 'Ya existe una cuenta con ese correo.')
        }
        if (msg.includes('invalid') && msg.includes('email')) {
          return error(400, 'Auth rechazó ese correo. Revisá que esté bien escrito.')
        }
        return errorOpaco('crear', errCrear, 'No pudimos crear la cuenta.')
      }

      const { data: link, error: errLink } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: destino ? { redirectTo: destino } : undefined,
      })

      /* La cuenta SÍ se creó y el link NO. Se devuelve 207 y no un error: decirle "falló" a quien
         acaba de crear una cuenta que existe lo llevaría a crearla otra vez y comerse un 409. El
         front muestra la cuenta como creada y ofrece generar el link de nuevo. */
      if (errLink || !link?.properties?.action_link) {
        return json(207, {
          userId: creado.user.id,
          actionLink: null,
          aviso: 'La cuenta se creó, pero no pudimos generar el link. Probá con "Enviar restablecimiento".',
        })
      }

      return json(200, { userId: creado.user.id, actionLink: link.properties.action_link })
    }

    /* ── Link para definir o restablecer la contraseña ───────────────────────
       Mismo tipo `recovery` que el alta: un solo camino para las dos cosas, así hay una sola
       pantalla que mantener y un solo comportamiento que verificar. */
    case 'link_restablecimiento': {
      const email = String(cuerpo.email ?? '').trim().toLowerCase()
      if (!email) return error(400, 'Esa cuenta no tiene correo cargado.')

      const { data: link, error: errLink } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: destino ? { redirectTo: destino } : undefined,
      })

      if (errLink || !link?.properties?.action_link) {
        return errorOpaco('link_restablecimiento', errLink, 'No pudimos generar el link.')
      }
      return json(200, { actionLink: link.properties.action_link })
    }

    /* ── Bloquear el ingreso ─────────────────────────────────────────────────
       Es la SEGUNDA mitad de la baja. La primera —revocar los módulos— la hace el front con
       `dar_de_baja` (0098) ANTES de llamar acá, y ese orden es fail-safe: si esto falla, la persona
       puede entrar pero no ve nada. Al revés dejaría permisos vivos con la pantalla diciendo "de
       baja". El ban es reversible (`ban_duration: 'none'`), así que la baja no es un camino de ida. */
    case 'banear': {
      const userId = String(cuerpo.userId ?? '')
      if (!userId) return error(400, 'Falta indicar la cuenta.')
      if (userId === quienLlama.id) return error(400, 'No podés bloquear tu propio ingreso.')

      const { error: errBan } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: '876000h', // 100 años: la Admin API no tiene "para siempre".
      })
      if (errBan) return errorOpaco('banear', errBan, 'Revocamos los accesos, pero no pudimos bloquear el ingreso.')
      return json(200, { ok: true })
    }

    /* ── Eliminar de verdad ──────────────────────────────────────────────────
       Sólo prospera con una cuenta que nunca hizo nada. El front ya preguntó por
       `user_activity_summary` y no habilita el botón si hay historial, pero el chequeo REAL es
       éste: si alguna clave foránea lo impide, Postgres tira 23503 y acá se traduce. La pantalla
       puede quedar desactualizada; la base no. */
    case 'eliminar': {
      const userId = String(cuerpo.userId ?? '')
      if (!userId) return error(400, 'Falta indicar la cuenta.')
      if (userId === quienLlama.id) return error(400, 'No podés eliminar tu propia cuenta.')

      const { error: errBorrar } = await admin.auth.admin.deleteUser(userId)
      if (errBorrar) {
        const msg = (errBorrar.message ?? '').toLowerCase()
        if (msg.includes('foreign key') || msg.includes('violates') || msg.includes('23503')) {
          return error(409, 'Esta cuenta ya registró actividad en el sistema, así que no se puede eliminar. Podés darle de baja.')
        }
        return errorOpaco('eliminar', errBorrar, 'No pudimos eliminar la cuenta.')
      }
      return json(200, { ok: true })
    }

    default:
      return error(400, 'Acción desconocida.')
  }
})
