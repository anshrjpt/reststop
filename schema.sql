-- RestStop database schema
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to re-run.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

create table if not exists public.places (
  id             bigint generated always as identity primary key,
  name           text not null check (char_length(name) between 1 and 120),
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  category       text not null default 'other'
                 check (category in ('shop', 'fuel', 'public', 'restaurant', 'other')),
  has_toilet     boolean not null default false,
  has_water      boolean not null default false,
  has_charging   boolean not null default false,
  has_shade      boolean not null default false,
  women_safe     boolean not null default false,
  rider_friendly boolean not null default false,
  open_time      time,
  close_time     time,
  photo_url      text,
  source         text not null default 'user' check (source in ('osm', 'user')),
  osm_id         text unique,
  created_by     text,
  created_at     timestamptz not null default now()
);

-- One row per rider per place; re-verifying updates the row.
create table if not exists public.verifications (
  id         bigint generated always as identity primary key,
  place_id   bigint not null references public.places (id) on delete cascade,
  user_id    text not null,
  status     text not null check (status in ('works', 'closed', 'denied')),
  created_at timestamptz not null default now(),
  unique (place_id, user_id)
);

create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  place_id   bigint not null references public.places (id) on delete cascade,
  user_id    text not null,
  reason     text not null
             check (reason in ('dirty', 'unsafe', 'wrong_location', 'denied_access', 'other')),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists places_lat_lng_idx on public.places (lat, lng);
create index if not exists verifications_place_idx on public.verifications (place_id);
create index if not exists reports_place_idx on public.reports (place_id);

-- ---------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------

-- Places within radius_m metres of the user, nearest first,
-- with verification counts.
create or replace function public.nearby_places(
  user_lat    double precision,
  user_lng    double precision,
  radius_m    double precision default 3000,
  max_results integer default 300
)
returns table (
  id             bigint,
  name           text,
  lat            double precision,
  lng            double precision,
  category       text,
  has_toilet     boolean,
  has_water      boolean,
  has_charging   boolean,
  has_shade      boolean,
  women_safe     boolean,
  rider_friendly boolean,
  open_time      time,
  close_time     time,
  photo_url      text,
  source         text,
  distance_m     double precision,
  works_count    bigint,
  closed_count   bigint,
  report_count   bigint,
  last_verified  timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  with me as (
    select st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography as g
  )
  select
    p.id, p.name, p.lat, p.lng, p.category,
    p.has_toilet, p.has_water, p.has_charging, p.has_shade,
    p.women_safe, p.rider_friendly, p.open_time, p.close_time,
    p.photo_url, p.source,
    st_distance(st_setsrid(st_makepoint(p.lng, p.lat), 4326)::geography, me.g) as distance_m,
    v.works_count,
    v.closed_count,
    r.report_count,
    v.last_verified
  from public.places p
  cross join me
  left join lateral (
    select
      count(*) filter (where vv.status = 'works')                 as works_count,
      count(*) filter (where vv.status in ('closed', 'denied'))   as closed_count,
      max(vv.created_at)                                          as last_verified
    from public.verifications vv
    where vv.place_id = p.id
  ) v on true
  left join lateral (
    select count(*) as report_count
    from public.reports rr
    where rr.place_id = p.id
  ) r on true
  where st_dwithin(st_setsrid(st_makepoint(p.lng, p.lat), 4326)::geography, me.g, radius_m)
  order by distance_m
  limit max_results;
$$;

-- Numbers for the impact dashboard.
create or replace function public.reststop_stats()
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'total_places',   (select count(*) from public.places),
    'user_added',     (select count(*) from public.places where source = 'user'),
    'from_osm',       (select count(*) from public.places where source = 'osm'),
    'rider_friendly', (select count(*) from public.places where rider_friendly),
    'with_toilet',    (select count(*) from public.places where has_toilet),
    'with_water',     (select count(*) from public.places where has_water),
    'with_charging',  (select count(*) from public.places where has_charging),
    'with_shade',     (select count(*) from public.places where has_shade),
    'women_safe',     (select count(*) from public.places where women_safe),
    'verifications',  (select count(*) from public.verifications),
    'riders',         (select count(distinct user_id) from public.verifications),
    'reports',        (select count(*) from public.reports)
  );
$$;

-- ---------------------------------------------------------------
-- Security
-- The Flask backend uses the service role key, which bypasses RLS.
-- The browser only gets the anon key, and may only READ places
-- (needed for live Realtime updates). Everything else is locked.
-- ---------------------------------------------------------------

alter table public.places        enable row level security;
alter table public.verifications enable row level security;
alter table public.reports       enable row level security;

drop policy if exists "Public can read places" on public.places;
create policy "Public can read places"
  on public.places for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------
-- Realtime: broadcast new places to open maps
-- ---------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'places'
  ) then
    alter publication supabase_realtime add table public.places;
  end if;
end $$;

-- ---------------------------------------------------------------
-- Storage bucket for place photos (public read)
-- ---------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;
