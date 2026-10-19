-- =====================================================================
--  CLOVER · PASO 2: código de equipo y PIN de capitana
--  1) Cambia los dos textos entre comillas.
--  2) Copia esta línea en Supabase > SQL Editor y pulsa RUN.
--
--  · Código de equipo: va dentro del enlace que mandarás por WhatsApp.
--    Mínimo 6 caracteres; solo letras (sin tildes ni ñ), números y guiones.
--    Ejemplo: clover-trebol-27
--  · PIN de capitana: solo lo sabe Mati. Mínimo 6 caracteres.
--    Ejemplo: 739154
--
--  Puedes volver a ejecutarlo cuando quieras para cambiarlos
--  (si cambias el código, tendrás que mandar el enlace nuevo).
-- =====================================================================

select clover.configurar('CAMBIA-ESTE-CODIGO', 'CAMBIA-ESTE-PIN');
