-- Spira · Migración 0156 — El bucket público de los tutoriales en video.
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0155. IDEMPOTENTE.
--
-- ⚠️ ADITIVA: va ANTES del deploy del front que publique el primer tutorial. Ningún front pide este bucket
--    hasta que `src/ayuda/tutoriales.meta.json` tenga un video, y el que lo pide sin bucket sólo muestra
--    «Este video todavía no está disponible».
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- POR QUÉ (docs/plan-tutoriales.md, D9). Los videos de los tutoriales no van al repo: pesan, y lo que entra al
-- historial de git no sale sin reescribirlo. Van a Storage, en rutas versionadas que deja la fábrica
-- (`tutoriales/<id>/<versión>/video.mp4 · subtitulos.vtt · poster.jpg`): un video regrabado tiene otra versión,
-- así que nunca choca con la caché del anterior. La app arma la URL pública desde VITE_SUPABASE_URL
-- (`src/ayuda/catalogo.ts`, `baseDeTutoriales`).
--
-- PÚBLICO a propósito: los videos se graban contra el proyecto DEMO, con datos 100 % ficticios, y el
-- reproductor los pide con `crossOrigin` desde el navegador, sin sesión de Storage.
--
-- SIN POLICIES DE ESCRITURA: en la v1 los sube el Director arrastrando la carpeta desde el dashboard
-- (Storage → tutoriales), que no pasa por la RLS. Así no queda ninguna clave de prod en la máquina que graba.
-- Sin límite de tipo ni de tamaño: el dashboard le pone a cada archivo el tipo que deduce, y un `.vtt`
-- rechazado por una lista de tipos sería un error difícil de entender en el momento de subir.
--
-- `on conflict do nothing`: en el demo ya existe (lo creó por la API el QA de T5) y no se toca.

insert into storage.buckets (id, name, public)
values ('tutoriales', 'tutoriales', true)
on conflict (id) do nothing;
