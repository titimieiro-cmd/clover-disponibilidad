-- =====================================================================
--  CLOVER · Disponibilidad de jugadoras · Temporada 2026/27
--  PASO 1: copia TODO este archivo en Supabase > SQL Editor y pulsa RUN.
--  (Se puede ejecutar más de una vez sin perder datos.)
-- =====================================================================
--
--  Seguridad (resumen):
--   * Las tablas viven en el esquema privado "clover", que NO está expuesto
--     por la API de Supabase. Además tienen RLS activado y sin políticas:
--     nadie puede leerlas ni escribirlas directamente desde Internet.
--   * La web solo puede llamar a unas pocas funciones (public.clover_*),
--     que comprueban el CÓDIGO DE EQUIPO (incluido en el enlace de WhatsApp)
--     y validan cada dato antes de guardarlo.
--   * Las funciones de gestión (calendario, vacaciones, jugadoras...) exigen
--     además el PIN DE CAPITANA, guardado cifrado (bcrypt) y con bloqueo
--     temporal tras varios intentos fallidos.
--   * El entrenador tiene acceso de solo lectura: la base de datos rechaza
--     cualquier respuesta enviada en su nombre.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists clover;
revoke all on schema clover from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema clover from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema clover from authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Tablas
-- ---------------------------------------------------------------------

create table if not exists clover.players (
  id      serial primary key,
  name    text not null unique,
  role    text not null default 'player' check (role in ('captain', 'player', 'coach')),
  sort    int  not null default 100,
  active  boolean not null default true
);

create table if not exists clover.events (
  id         serial primary key,
  date       date not null,
  time       text check (time is null or time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  type       text not null check (type in ('training', 'match', 'rest', 'other')),
  title      text,
  location   text,
  notes      text,
  cancelled  boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists events_date_idx on clover.events (date);

create table if not exists clover.vacations (
  id         serial primary key,
  name       text not null,
  start_date date not null,
  end_date   date not null,
  check (end_date >= start_date)
);

create table if not exists clover.availability (
  player_id  int not null references clover.players (id) on delete cascade,
  event_id   int not null references clover.events (id) on delete cascade,
  status     text not null check (status in ('yes', 'no', 'maybe')),
  comment    text,
  updated_at timestamptz not null default now(),
  primary key (player_id, event_id)
);
create index if not exists availability_event_idx on clover.availability (event_id);

create table if not exists clover.change_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  actor     text,
  player_id int,
  event_id  int,
  action    text,
  detail    text,
  device    text
);

create table if not exists clover.settings (
  key   text primary key,
  value text
);

create table if not exists clover.meta (
  id      int primary key default 1 check (id = 1),
  version bigint not null default 1
);

create table if not exists clover.admin_attempts (
  id bigserial primary key,
  at timestamptz not null default now(),
  ok boolean not null
);

alter table clover.players        enable row level security;
alter table clover.events         enable row level security;
alter table clover.vacations      enable row level security;
alter table clover.availability   enable row level security;
alter table clover.change_log     enable row level security;
alter table clover.settings       enable row level security;
alter table clover.meta           enable row level security;
alter table clover.admin_attempts enable row level security;

revoke all on all tables in schema clover from public;
revoke all on all sequences in schema clover from public;

-- ---------------------------------------------------------------------
--  Datos iniciales
-- ---------------------------------------------------------------------

insert into clover.meta (id, version) values (1, 1) on conflict (id) do nothing;

insert into clover.settings (key, value) values
  ('threshold', '10'),
  ('season_start', '2026-10-01'),
  ('season_end', '2027-06-30')
on conflict (key) do nothing;

insert into clover.players (name, role, sort) values
  ('Mati',        'captain', 1),
  ('Paula F',     'player',  2),
  ('Carol',       'player',  3),
  ('Sara Fresno', 'player',  4),
  ('Sarita',      'player',  5),
  ('Julia',       'player',  6),
  ('Marta',       'player',  7),
  ('Cris',        'player',  8),
  ('Ana',         'player',  9),
  ('Luisa',       'player', 10),
  ('Natalia',     'player', 11),
  ('Carla',       'player', 12),
  ('Mara',        'player', 13),
  ('Isa',         'player', 14),
  ('Julián',      'coach',  50)
on conflict (name) do nothing;

-- Martes y jueves: entrenamiento. Domingos: posible partido.
insert into clover.events (date, type)
select d::date,
       case extract(isodow from d) when 7 then 'match' else 'training' end
from generate_series('2026-10-01'::date, '2027-06-30'::date, interval '1 day') as d
where extract(isodow from d) in (2, 4, 7)
  and not exists (select 1 from clover.events);

insert into clover.vacations (name, start_date, end_date)
select * from (values
  ('Navidad',      '2026-12-21'::date, '2027-01-06'::date),
  ('Semana Santa', '2027-03-22'::date, '2027-03-28'::date)
) as v (name, start_date, end_date)
where not exists (select 1 from clover.vacations);

-- ---------------------------------------------------------------------
--  Funciones internas (no accesibles desde la web)
-- ---------------------------------------------------------------------

create or replace function clover.today() returns date
language sql stable as $$
  select (now() at time zone 'Europe/Madrid')::date
$$;

create or replace function clover.bump() returns bigint
language sql volatile security definer set search_path = clover, public as $$
  update clover.meta set version = version + 1 where id = 1 returning version
$$;

create or replace function clover.check_code(p_code text) returns void
language plpgsql stable security definer set search_path = clover, extensions, public as $$
declare
  v_hash text;
  v_salt text;
begin
  select value into v_hash from clover.settings where key = 'team_code_hash';
  select value into v_salt from clover.settings where key = 'team_salt';
  if v_hash is null then
    raise exception 'SIN_CONFIGURAR: falta ejecutar el paso 2 (código de equipo y PIN).';
  end if;
  if p_code is null
     or encode(extensions.digest(v_salt || lower(trim(p_code)), 'sha256'), 'hex') <> v_hash then
    raise exception 'CODIGO_INVALIDO: el código de equipo no es correcto.';
  end if;
end $$;

-- Devuelve NULL si el PIN es correcto, o el mensaje de error.
-- No lanza excepciones para que los intentos fallidos queden registrados.
create or replace function clover.check_admin(p_code text, p_pin text) returns text
language plpgsql volatile security definer set search_path = clover, extensions, public as $$
declare
  v_fails int;
  v_hash  text;
begin
  perform clover.check_code(p_code);
  select count(*) into v_fails
    from clover.admin_attempts
   where not ok and at > now() - interval '15 minutes';
  if v_fails >= 8 then
    return 'Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.';
  end if;
  select value into v_hash from clover.settings where key = 'admin_pin_hash';
  if v_hash is null or p_pin is null or extensions.crypt(p_pin, v_hash) <> v_hash then
    insert into clover.admin_attempts (ok) values (false);
    delete from clover.admin_attempts where at < now() - interval '2 days';
    return 'PIN_INCORRECTO: el PIN de capitana no es correcto.';
  end if;
  return null;
end $$;

create or replace function clover.in_vacation(p_date date) returns boolean
language sql stable security definer set search_path = clover, public as $$
  select exists (select 1 from clover.vacations where p_date between start_date and end_date)
$$;

create or replace function clover.status_label(p_status text) returns text
language sql immutable as $$
  select case p_status when 'yes' then 'Voy' when 'no' then 'No voy'
                       when 'maybe' then 'Dudas' else 'Sin responder' end
$$;

-- Guarda (o borra, si p_status es NULL) una respuesta tras validarla.
create or replace function clover.write_availability(
  p_player clover.players, p_event clover.events, p_status text, p_comment text,
  p_actor text, p_device text
) returns void
language plpgsql volatile security definer set search_path = clover, public as $$
declare
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if p_player.role = 'coach' then
    raise exception 'El entrenador tiene acceso de solo lectura.';
  end if;
  if p_event.type not in ('training', 'match', 'other') then
    raise exception 'Este día no necesita respuesta (descanso).';
  end if;
  if p_event.cancelled then
    raise exception 'Esta actividad está cancelada.';
  end if;
  if clover.in_vacation(p_event.date) then
    raise exception 'Este día está dentro de un periodo de vacaciones.';
  end if;
  if p_status is not null and p_status not in ('yes', 'no', 'maybe') then
    raise exception 'Respuesta no válida.';
  end if;
  if length(v_comment) > 300 then
    raise exception 'El comentario es demasiado largo (máximo 300 caracteres).';
  end if;

  if p_status is null then
    delete from clover.availability where player_id = p_player.id and event_id = p_event.id;
  else
    insert into clover.availability (player_id, event_id, status, comment, updated_at)
    values (p_player.id, p_event.id, p_status, v_comment, now())
    on conflict (player_id, event_id)
    do update set status = excluded.status, comment = excluded.comment, updated_at = now();
  end if;

  insert into clover.change_log (actor, player_id, event_id, action, detail, device)
  values (p_actor, p_player.id, p_event.id, 'respuesta',
          clover.status_label(p_status) || coalesce(' · «' || v_comment || '»', ''),
          left(p_device, 40));
end $$;

create or replace function clover.type_label(p_type text) returns text
language sql immutable as $$
  select case p_type when 'training' then 'Entrenamiento' when 'match' then 'Partido'
                     when 'rest' then 'Descanso' else 'Actividad extra' end
$$;

create or replace function clover.log_admin(p_action text, p_detail text, p_event_id int default null)
returns void
language sql volatile security definer set search_path = clover, public as $$
  insert into clover.change_log (actor, event_id, action, detail)
  values ('Capitana', p_event_id, p_action, p_detail)
$$;

-- PASO 2 (ver 02_configurar.sql): fija el código de equipo y el PIN de capitana.
create or replace function clover.configurar(p_team_code text, p_admin_pin text) returns text
language plpgsql volatile security definer set search_path = clover, extensions, public as $$
declare
  v_salt text := encode(extensions.gen_random_bytes(16), 'hex');
  v_code text := lower(trim(p_team_code));
begin
  if v_code is null or length(v_code) < 6 or v_code !~ '^[a-z0-9-]+$' then
    raise exception 'El código de equipo debe tener al menos 6 caracteres (solo letras sin tildes, números y guiones).';
  end if;
  if v_code like '%cambia%' then
    raise exception 'Cambia el código de ejemplo por uno inventado por ti.';
  end if;
  if p_admin_pin is null or length(p_admin_pin) < 6 or p_admin_pin like '%CAMBIA%' then
    raise exception 'El PIN de capitana debe tener al menos 6 caracteres y no puede ser el de ejemplo.';
  end if;
  insert into clover.settings (key, value) values
    ('team_salt', v_salt),
    ('team_code_hash', encode(extensions.digest(v_salt || v_code, 'sha256'), 'hex')),
    ('admin_pin_hash', extensions.crypt(p_admin_pin, extensions.gen_salt('bf')))
  on conflict (key) do update set value = excluded.value;
  delete from clover.admin_attempts;
  return 'Listo. Enlace para WhatsApp: https://TU-WEB.netlify.app/?equipo=' || v_code;
end $$;

-- ---------------------------------------------------------------------
--  Funciones públicas (las únicas que puede usar la web)
-- ---------------------------------------------------------------------

create or replace function public.clover_get_version(p_code text) returns bigint
language plpgsql stable security definer set search_path = clover, public as $$
begin
  perform clover.check_code(p_code);
  return (select version from clover.meta where id = 1);
end $$;

create or replace function public.clover_get_state(p_code text) returns json
language plpgsql stable security definer set search_path = clover, public as $$
begin
  perform clover.check_code(p_code);
  return json_build_object(
    'version', (select version from clover.meta where id = 1),
    'today', clover.today(),
    'settings', json_build_object(
      'threshold',    (select value::int from clover.settings where key = 'threshold'),
      'season_start', (select value from clover.settings where key = 'season_start'),
      'season_end',   (select value from clover.settings where key = 'season_end')
    ),
    'players', (select coalesce(json_agg(p order by p.sort, p.name), '[]'::json)
                  from (select id, name, role, sort, active from clover.players) p),
    'events', (select coalesce(json_agg(e order by e.date, e.time nulls first, e.id), '[]'::json)
                 from (select id, date, time, type, title, location, notes, cancelled
                         from clover.events) e),
    'vacations', (select coalesce(json_agg(v order by v.start_date), '[]'::json)
                    from (select id, name, start_date, end_date from clover.vacations) v),
    -- formato compacto: [jugadora, actividad, estado, comentario]
    'availability', (select coalesce(json_agg(json_build_array(player_id, event_id, status, comment)), '[]'::json)
                       from clover.availability)
  );
end $$;

-- Una jugadora marca su disponibilidad (solo actividades de hoy en adelante).
create or replace function public.clover_set_availability(
  p_code text, p_player_id int, p_event_ids int[], p_status text,
  p_comment text default null, p_device text default null
) returns json
language plpgsql volatile security definer set search_path = clover, public as $$
declare
  v_player clover.players;
  v_event  clover.events;
  v_id     int;
begin
  perform clover.check_code(p_code);
  select * into v_player from clover.players where id = p_player_id and active;
  if not found then
    raise exception 'Jugadora no encontrada.';
  end if;
  if coalesce(array_length(p_event_ids, 1), 0) not between 1 and 60 then
    raise exception 'Número de actividades no válido.';
  end if;
  foreach v_id in array p_event_ids loop
    select * into v_event from clover.events where id = v_id;
    if not found then
      raise exception 'Actividad no encontrada.';
    end if;
    if v_event.date < clover.today() then
      raise exception 'Esta actividad ya ha pasado y no se puede modificar.';
    end if;
    perform clover.write_availability(v_player, v_event, p_status, p_comment, v_player.name, p_device);
  end loop;
  return json_build_object('ok', true, 'version', clover.bump());
end $$;

create or replace function public.clover_admin_login(p_code text, p_pin text) returns json
language plpgsql volatile security definer set search_path = clover, public as $$
declare
  v_err text := clover.check_admin(p_code, p_pin);
begin
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;
  return json_build_object('ok', true);
end $$;

-- La capitana puede corregir la respuesta de cualquier jugadora (también pasadas).
create or replace function public.clover_admin_set_availability(
  p_code text, p_pin text, p_player_id int, p_event_id int, p_status text, p_comment text default null
) returns json
language plpgsql volatile security definer set search_path = clover, public as $$
declare
  v_err    text := clover.check_admin(p_code, p_pin);
  v_player clover.players;
  v_event  clover.events;
begin
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;
  select * into v_player from clover.players where id = p_player_id;
  select * into v_event from clover.events where id = p_event_id;
  if v_player.id is null or v_event.id is null then
    raise exception 'Jugadora o actividad no encontrada.';
  end if;
  perform clover.write_availability(v_player, v_event, p_status, p_comment,
                                    'Capitana (por ' || v_player.name || ')', null);
  return json_build_object('ok', true, 'version', clover.bump());
end $$;

-- Crear (sin id) o modificar (con id) una actividad.
create or replace function public.clover_admin_save_event(p_code text, p_pin text, p_event jsonb)
returns json
language plpgsql volatile security definer set search_path = clover, public as $$
declare
  v_err      text := clover.check_admin(p_code, p_pin);
  v_id       int  := nullif(p_event ->> 'id', '')::int;
  v_date     date := (p_event ->> 'date')::date;
  v_type     text := p_event ->> 'type';
  v_time     text := nullif(trim(coalesce(p_event ->> 'time', '')), '');
  v_title    text := nullif(trim(coalesce(p_event ->> 'title', '')), '');
  v_location text := nullif(trim(coalesce(p_event ->> 'location', '')), '');
  v_notes    text := nullif(trim(coalesce(p_event ->> 'notes', '')), '');
  v_cancel   boolean := coalesce((p_event ->> 'cancelled')::boolean, false);
begin
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;
  if v_date is null or v_date not between '2025-01-01' and '2030-12-31' then
    raise exception 'Fecha no válida.';
  end if;
  if v_type is null or v_type not in ('training', 'match', 'rest', 'other') then
    raise exception 'Tipo de actividad no válido.';
  end if;
  if v_time is not null and v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Hora no válida (usa el formato 20:30).';
  end if;
  if length(v_title) > 80 or length(v_location) > 120 or length(v_notes) > 500 then
    raise exception 'Algún texto es demasiado largo.';
  end if;

  if v_id is null then
    insert into clover.events (date, time, type, title, location, notes, cancelled)
    values (v_date, v_time, v_type, v_title, v_location, v_notes, v_cancel)
    returning id into v_id;
    perform clover.log_admin('nueva actividad', clover.type_label(v_type) || ' ' || to_char(v_date, 'DD/MM/YYYY'), v_id);
  else
    update clover.events
       set date = v_date, time = v_time, type = v_type, title = v_title,
           location = v_location, notes = v_notes, cancelled = v_cancel, updated_at = now()
     where id = v_id;
    if not found then
      raise exception 'Actividad no encontrada.';
    end if;
    perform clover.log_admin('editar actividad',
      clover.type_label(v_type) || ' ' || to_char(v_date, 'DD/MM/YYYY')
      || case when v_cancel then ' (cancelada)' else '' end, v_id);
  end if;
  return json_build_object('ok', true, 'id', v_id, 'version', clover.bump());
end $$;

create or replace function public.clover_admin_delete_event(p_code text, p_pin text, p_id int)
returns json
language plpgsql volatile security definer set search_path = clover, public as $$
declare
  v_err text := clover.check_admin(p_code, p_pin);
  v_ev  clover.events;
begin
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;
  delete from clover.events where id = p_id returning * into v_ev;
  if v_ev.id is null then
    raise exception 'Actividad no encontrada.';
  end if;
  perform clover.log_admin('borrar actividad', clover.type_label(v_ev.type) || ' ' || to_char(v_ev.date, 'DD/MM/YYYY'));
  return json_build_object('ok', true, 'version', clover.bump());
end $$;

-- Aplica hora y/o lugar a todas las actividades futuras de un tipo (y día de la semana).
-- p_weekday: 1 = lunes ... 7 = domingo, NULL = todos. p_time / p_location NULL = no cambiar.
create or replace function public.clover_admin_bulk_events(
  p_code text, p_pin text, p_type text, p_weekday int, p_time text, p_location text
) returns json
language plpgsql volatile security definer set search_path = clover, public as $$
declare
  v_err   text := clover.check_admin(p_code, p_pin);
  v_time  text := nullif(trim(coalesce(p_time, '')), '');
  v_count int;
begin
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;
  if p_type not in ('training', 'match', 'other') then
    raise exception 'Tipo de actividad no válido.';
  end if;
  if v_time is not null and v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Hora no válida (usa el formato 20:30).';
  end if;
  if length(p_location) > 120 then
    raise exception 'El lugar es demasiado largo.';
  end if;
  update clover.events
     set time = case when p_time is null then time else v_time end,
         location = case when p_location is null then location
                         else nullif(trim(p_location), '') end,
         updated_at = now()
   where type = p_type
     and date >= clover.today()
     and (p_weekday is null or extract(isodow from date) = p_weekday);
  get diagnostics v_count = row_count;
  perform clover.log_admin('cambio masivo', v_count || ' actividades (' || clover.type_label(p_type) || ')');
  return json_build_object('ok', true, 'count', v_count, 'version', clover.bump());
end $$;

create or replace function public.clover_admin_save_vacation(p_code text, p_pin text, p_vac jsonb)
returns json
language plpgsql volatile security definer set search_path = clover, public as $$
declare
  v_err   text := clover.check_admin(p_code, p_pin);
  v_id    int  := nullif(p_vac ->> 'id', '')::int;
  v_name  text := nullif(trim(coalesce(p_vac ->> 'name', '')), '');
  v_start date := (p_vac ->> 'start_date')::date;
  v_end   date := (p_vac ->> 'end_date')::date;
begin
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;
  if v_name is null or length(v_name) > 60 then
    raise exception 'Pon un nombre al periodo de vacaciones.';
  end if;
  if v_start is null or v_end is null or v_end < v_start then
    raise exception 'Revisa las fechas: el final no puede ser anterior al inicio.';
  end if;
  if v_id is null then
    insert into clover.vacations (name, start_date, end_date) values (v_name, v_start, v_end);
  else
    update clover.vacations set name = v_name, start_date = v_start, end_date = v_end where id = v_id;
  end if;
  perform clover.log_admin('vacaciones', v_name || ': ' || to_char(v_start, 'DD/MM/YYYY') || ' → ' || to_char(v_end, 'DD/MM/YYYY'));
  return json_build_object('ok', true, 'version', clover.bump());
end $$;

create or replace function public.clover_admin_delete_vacation(p_code text, p_pin text, p_id int)
returns json
language plpgsql volatile security definer set search_path = clover, public as $$
declare
  v_err text := clover.check_admin(p_code, p_pin);
begin
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;
  delete from clover.vacations where id = p_id;
  perform clover.log_admin('borrar vacaciones', 'id ' || p_id);
  return json_build_object('ok', true, 'version', clover.bump());
end $$;

create or replace function public.clover_admin_set_threshold(p_code text, p_pin text, p_value int)
returns json
language plpgsql volatile security definer set search_path = clover, public as $$
declare
  v_err text := clover.check_admin(p_code, p_pin);
begin
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;
  if p_value is null or p_value not between 1 and 30 then
    raise exception 'El umbral debe estar entre 1 y 30.';
  end if;
  update clover.settings set value = p_value::text where key = 'threshold';
  perform clover.log_admin('umbral de alerta', p_value::text);
  return json_build_object('ok', true, 'version', clover.bump());
end $$;

-- Crear (sin id) o modificar una persona del equipo.
create or replace function public.clover_admin_save_player(p_code text, p_pin text, p_player jsonb)
returns json
language plpgsql volatile security definer set search_path = clover, public as $$
declare
  v_err    text := clover.check_admin(p_code, p_pin);
  v_id     int  := nullif(p_player ->> 'id', '')::int;
  v_name   text := nullif(trim(coalesce(p_player ->> 'name', '')), '');
  v_role   text := coalesce(p_player ->> 'role', 'player');
  v_active boolean := coalesce((p_player ->> 'active')::boolean, true);
begin
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;
  if v_name is null or length(v_name) > 40 then
    raise exception 'Escribe un nombre (máximo 40 caracteres).';
  end if;
  if v_role not in ('captain', 'player', 'coach') then
    raise exception 'Rol no válido.';
  end if;
  begin
    if v_id is null then
      insert into clover.players (name, role, sort, active)
      values (v_name, v_role, (select coalesce(max(sort), 0) + 1 from clover.players where role <> 'coach'), v_active);
    else
      update clover.players set name = v_name, role = v_role, active = v_active where id = v_id;
    end if;
  exception when unique_violation then
    raise exception 'Ya existe alguien con ese nombre.';
  end;
  perform clover.log_admin('equipo', v_name || case when v_active then '' else ' (desactivada)' end);
  return json_build_object('ok', true, 'version', clover.bump());
end $$;

create or replace function public.clover_admin_change_pin(p_code text, p_pin text, p_new_pin text)
returns json
language plpgsql volatile security definer set search_path = clover, extensions, public as $$
declare
  v_err text := clover.check_admin(p_code, p_pin);
begin
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;
  if p_new_pin is null or length(p_new_pin) < 6 or length(p_new_pin) > 40 then
    raise exception 'El nuevo PIN debe tener al menos 6 caracteres.';
  end if;
  update clover.settings set value = extensions.crypt(p_new_pin, extensions.gen_salt('bf'))
   where key = 'admin_pin_hash';
  perform clover.log_admin('cambio de PIN', '');
  return json_build_object('ok', true);
end $$;

create or replace function public.clover_admin_get_log(p_code text, p_pin text, p_limit int default 200)
returns json
language plpgsql volatile security definer set search_path = clover, public as $$
declare
  v_err text := clover.check_admin(p_code, p_pin);
begin
  if v_err is not null then
    return json_build_object('ok', false, 'error', v_err);
  end if;
  return json_build_object('ok', true, 'log', (
    select coalesce(json_agg(l order by l.id desc), '[]'::json)
      from (select id, at, actor, player_id, event_id, action, detail, device
              from clover.change_log
             order by id desc
             limit least(greatest(coalesce(p_limit, 200), 1), 500)) l));
end $$;

-- ---------------------------------------------------------------------
--  Permisos de ejecución
-- ---------------------------------------------------------------------

revoke execute on all functions in schema clover from public;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'clover\_%'
  loop
    execute format('revoke execute on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- Avisa a la API de Supabase de que hay funciones nuevas.
notify pgrst, 'reload schema';
