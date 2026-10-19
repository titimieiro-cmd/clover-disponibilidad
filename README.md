# 🍀 Clover · Disponibilidad 2026/27

Web para que las jugadoras de **Clover** marquen si van a cada entreno y partido
(🟢 Voy · 🔴 No voy · 🟡 Tengo dudas), con panel para la capitana y vista de
consulta para el entrenador.

- Se abre desde un enlace de WhatsApp en Safari o Chrome. No hay que instalar nada.
- Cada persona elige su nombre en una lista. No hay registro ni contraseñas.
- Todo se guarda en una base de datos compartida (Supabase) y se sincroniza
  entre móviles cada pocos segundos.
- Es gratis: Supabase (base de datos) + Netlify (alojamiento web), los dos en plan gratuito.

---

## Qué incluye

**Jugadoras**
- Calendario mensual con flechas (octubre 2026 a junio 2027) y colores: entreno 💜,
  partido 💗, actividad extra 🧡, descanso (borde discontinuo) y vacaciones (gris rayado).
- En cada día se ve con un punto de color lo que ha respondido cada una
  (blanco = sin responder).
- La pestaña **Mis respuestas** muestra todas las actividades futuras con botones grandes
  Voy / No voy / Dudas y un comentario opcional. Se pueden marcar con meses de antelación
  y cambiar cuando se quiera. Hay un botón para marcar «Voy» en todo lo pendiente de un mes.
- **Sin responder no cuenta como Voy.** Solo cuenta como confirmada quien ha pulsado «Voy».

**Capitana (Mati), con PIN**
- **Resumen**: alerta roja si un partido tiene **10 o menos «Voy»**, el próximo partido en grande y
  la lista de partidos y entrenos con el número de confirmadas.
- **Por fecha**: quién va, quién no, quién duda y quién no ha respondido (con motivos). Mati puede
  cambiar la respuesta de cualquier jugadora y copiar o enviar un resumen por WhatsApp.
- **Ausencias**: resumen por jugadora de toda la temporada (o solo próximas o pasadas), con detalle
  y motivos.
- **Gestionar**: añadir actividades, cambiar un domingo a descanso, cancelar entrenos, cambiar
  fechas, editar vacaciones, poner la hora y el lugar habituales de golpe, cambiar el umbral de
  alerta, añadir o desactivar jugadoras y cambiar el PIN.
- **Historial**: cada cambio queda registrado con fecha, hora y móvil.

**Entrenador (Julián)**: ve el calendario con el número de confirmadas, el resumen, la vista por
fecha y las ausencias. No puede modificar nada (la base de datos lo impide).

Ya vienen cargados: las 14 jugadoras, Julián, los entrenos de martes y jueves, todos los domingos
como posible partido y las vacaciones de Navidad (21/12/2026–6/1/2027) y Semana Santa
(22–28/3/2027). La temporada termina el **30 de junio de 2027**, porque el 31 de junio no existe.

---

## 🚀 Cómo publicarla (unos 20 minutos, una sola vez)

> Es más cómodo hacerlo desde un ordenador. No necesitas saber programar: solo copiar y pegar.

### Paso 1 · Crear la base de datos en Supabase

1. Entra en **https://supabase.com** y pulsa **Start your project**. Regístrate con tu cuenta de
   GitHub (es lo más fácil) o con tu email.
2. Pulsa **New project**:
   - *Name*: `clover`
   - *Database Password*: pulsa **Generate a password** (no la vas a necesitar, pero guárdala).
   - *Region*: **West EU (Ireland)** o **Central EU (Frankfurt)**.
   - Pulsa **Create new project** y espera 1 o 2 minutos.
3. En el menú de la izquierda, entra en **SQL Editor** (icono `>_`).
4. Abre el archivo [`supabase/01_esquema.sql`](supabase/01_esquema.sql) de este proyecto, pulsa el
   botón de copiar (📋, arriba a la derecha del archivo en GitHub), pégalo en el editor de Supabase y pulsa
   **Run**. Si sale un aviso, confirma con **Run this query**. Tiene que aparecer
   *Success. No rows returned*.
5. Pulsa **New query** (o el **+**), pega esta línea y **cambia los dos textos**:

   ```sql
   select clover.configurar('clover-trebol-27', '739154');
   ```

   - El primero es el **código del equipo**. Irá dentro del enlace de WhatsApp. Usa al menos 6
     caracteres: solo letras sin tildes, números y guiones. Invéntate uno, por ejemplo
     `clover-lila-2027`.
   - El segundo es el **PIN de capitana**, que solo debe saber Mati. Usa al menos 6 caracteres; te
     recomendamos que sean solo números, para escribirlo fácil en el móvil.

   Pulsa **Run**. Tiene que aparecer «Listo. Enlace para WhatsApp: …». **Apunta el código y el PIN.**

### Paso 2 · Copiar las dos claves de conexión

1. En Supabase, pulsa el botón **Connect**, arriba en el centro, o entra en
   **Project Settings → API Keys**.
2. Copia estos dos datos:
   - **Project URL**: algo como `https://abcdxyz.supabase.co`
   - **Publishable key**, que empieza por `sb_publishable_…`. Si solo ves la clave **anon**
     (`eyJ…`, en la pestaña *Legacy API keys*), también sirve.
   - ⚠️ **No** copies nunca la clave **secret** ni la **service_role**.

### Paso 3 · Poner esas claves en la web

1. En GitHub, abre este repositorio y el archivo **`public/config.js`** (en la rama `main`).
2. Pulsa el lápiz ✏️ (*Edit this file*).
3. Sustituye `https://TU-PROYECTO.supabase.co` por tu Project URL y
   `PEGA-AQUI-TU-CLAVE-PUBLISHABLE-O-ANON` por tu clave. Respeta las comillas:

   ```js
   window.CLOVER_CONFIG = {
     SUPABASE_URL: "https://abcdxyz.supabase.co",
     SUPABASE_KEY: "sb_publishable_xxxxxxxxxxxxxxxx",
   };
   ```
4. Pulsa **Commit changes…** y otra vez **Commit changes**.

### Paso 4 · Publicar la web gratis en Netlify

1. Entra en **https://app.netlify.com/signup** y regístrate con **GitHub**.
2. Pulsa **Add new project → Import an existing project → GitHub**. Autoriza a Netlify y elige el
   repositorio **clover-disponibilidad**.
3. Netlify lo detecta solo. Comprueba que *Branch* es `main` y *Publish directory* es `public`.
   Pulsa **Deploy**.
4. Cuando termine, ve a **Project configuration → Change project name** y pon, por ejemplo,
   `clover-voley`. Tu web quedará en **https://clover-voley.netlify.app**.

> A partir de ahora, cada cambio que se guarde en la rama `main` de GitHub se publica solo
> en un minuto.

### Paso 5 · Probar y enviar el enlace

1. Abre en tu móvil `https://clover-voley.netlify.app/?equipo=TU-CODIGO`, con el código del paso 1.
2. Elige **Mati**, ve a la pestaña **👑 Capitana** e introduce tu PIN.
3. En **Gestionar**, pon la hora y el lugar habituales de los entrenos y los partidos.
4. En **Gestionar → Enlace para WhatsApp**, pulsa **Enviar por WhatsApp** y elige el grupo del equipo. 🎉
5. Julián entra con el mismo enlace y elige su nombre.

---

## 🔒 Seguridad: qué protege y qué no

**Lo que está protegido**
- Las tablas de la base de datos **no son accesibles** desde Internet: están en un esquema privado y
  tienen RLS activado sin permisos. La web solo puede usar unas funciones concretas que validan
  todo: estados válidos, comentarios de 300 caracteres como máximo, nada de responder en días de
  vacaciones, descansos, actividades canceladas o pasadas, etc.
- Sin el **código de equipo** del enlace, no se puede ver ni modificar nada.
- Todo lo de gestión exige el **PIN de capitana**. El PIN se guarda cifrado (bcrypt) y, tras
  8 intentos fallidos, se bloquea durante 15 minutos.
- El entrenador no puede modificar nada, aunque lo intente desde fuera de la web.
- La clave que va en `config.js` es pública por diseño. No da acceso a nada sin el código del equipo.

**Las limitaciones de entrar solo con el nombre (lo que no se puede evitar sin contraseñas)**
- Quien tenga el enlace puede elegir cualquier nombre y responder por otra persona. Para
  detectarlo, en **Capitana → Historial** se ve cada cambio con fecha, hora y un código del móvil
  (📱). Si el mismo código aparece con dos jugadoras distintas, alguien ha respondido por otra.
  Además, Mati puede corregir cualquier respuesta.
- El enlace con el código es la «llave» del equipo: no lo compartáis fuera del grupo. Si se filtra,
  ejecuta otra vez el paso 1.5 con un código nuevo y manda el enlace nuevo.
- Quien tenga el enlace podría, con conocimientos técnicos, leer todas las respuestas y
  comentarios. En la web, los comentarios solo los ven la capitana, el entrenador y la propia
  jugadora. No escribáis datos sensibles (de salud, por ejemplo) en los comentarios.
- Alguien con el enlace podría provocar el bloqueo temporal de 15 minutos del panel de capitana
  probando PINs. Los datos no corren peligro.
- Si en el futuro queréis más protección, se puede añadir un PIN opcional por jugadora.

---

## 🧰 Mantenimiento

- **Cambiar el PIN**: Capitana → Gestionar → Seguridad. Si lo olvidas, vuelve a ejecutar la línea
  del paso 1.5 en Supabase con un PIN nuevo. Eso también cambia el código del equipo.
- **Nueva jugadora o baja**: Capitana → Gestionar → Equipo. Si desactivas a alguien, deja de contar
  en los totales, pero sus datos se conservan.
- **Otra persona en el mismo móvil**: pulsa el nombre (arriba a la derecha) para cambiar de persona.
- **Plan gratuito de Supabase**: si el proyecto pasa **7 días sin ningún uso**, Supabase lo pausa,
  pero no borra los datos. Con el uso semanal de la temporada no pasará. Si ocurre, por ejemplo en
  verano, entra en supabase.com y pulsa **Restore project**.
- **Copia de seguridad**: en Supabase → Table Editor, elige el esquema `clover` y exporta las tablas a
  CSV cuando quieras.

---

## Estructura del proyecto

```
public/            La web (HTML, CSS y JavaScript, sin compilación)
  index.html
  styles.css
  app.js           Toda la lógica de la web
  config.js        ← Aquí van la URL y la clave de Supabase
supabase/
  01_esquema.sql   Tablas, datos iniciales, seguridad y funciones
  02_configurar.sql  Código de equipo y PIN de capitana
netlify.toml       Configuración de publicación
```

La web llama a las funciones `public.clover_*` de Supabase por su API REST (`/rest/v1/rpc/…`). No
depende de ninguna librería externa.
