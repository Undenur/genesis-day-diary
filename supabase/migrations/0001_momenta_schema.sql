-- MOMENTA · облачное расширение (P2). Контракт данных и правил доступа.
-- Статус: схема подготовлена, но не развёрнута и не проверена под двумя аккаунтами.
-- Принципы: личные записи видит только владелец; альбом — только приглашённые участники;
-- публичная ссылка создаётся отдельным действием и может быть отозвана.

create extension if not exists "pgcrypto";

-- ---------- Профили ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_path text,
  created_at timestamptz not null default now()
);

-- ---------- Места и песни ----------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  artist text not null default '',
  genre text not null default '',
  mood text not null default '',
  year int,
  bpm int check (bpm between 40 and 220),
  scale text check (scale in ('major', 'minor')),
  source text not null check (source in ('file', 'link', 'description')),
  url text,
  file_path text, -- приватный объект в Storage: memories/<owner>/<memory>/...
  audio_features jsonb,
  created_at timestamptz not null default now()
);

-- ---------- День (центральный объект) ----------
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  title text not null check (array_length(regexp_split_to_array(trim(title), '\s+'), 1) between 3 and 7),
  body text not null,
  category text not null check (category in ('travel', 'meeting', 'holiday', 'study', 'personal')),
  season text not null check (season in ('winter', 'spring', 'summer', 'autumn')),
  season_manual boolean not null default false,
  weather text not null default '',
  location_id uuid references public.locations (id) on delete set null,
  song_id uuid references public.songs (id) on delete set null,
  cover_asset_id uuid,
  visibility text not null default 'private' check (visibility in ('private')),
  countdown_id uuid,
  schema_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_owner_date on public.memories (owner_id, date desc);
create index memories_month_day on public.memories (owner_id, (extract(month from date)), (extract(day from date)));

create table public.memory_assets (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  position int not null,
  storage_path text not null,
  thumb_path text,
  alt text not null default '',
  width int,
  height int,
  features jsonb, -- палитра, яркость, карта деталей (как PhotoFeatures в клиенте)
  unique (memory_id, position)
);

create table public.voice_notes (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null unique references public.memories (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  duration_sec numeric not null check (duration_sec <= 90),
  mime text not null,
  created_at timestamptz not null default now()
);

create table public.emotion_profiles (
  memory_id uuid primary key references public.memories (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  algorithm_version text not null,
  seed bigint not null,
  input_hash text not null,
  params jsonb not null,        -- warmth, energy, density, nostalgia, intimacy
  param_details jsonb not null, -- веса и наблюдения
  art jsonb not null,
  scenes jsonb not null,
  explanations jsonb not null,
  created_at timestamptz not null default now()
);

create table public.countdown_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  cover_path text,
  description text not null default '',
  category text not null,
  memory_id uuid references public.memories (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Общие альбомы ----------
create table public.shared_albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table public.album_members (
  album_id uuid not null references public.shared_albums (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  invited_email text,
  role text not null default 'contributor' check (role in ('viewer', 'contributor')),
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  invited_at timestamptz not null default now(),
  primary key (album_id, invited_email)
);

create table public.shared_album_items (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.shared_albums (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('photo', 'video', 'text', 'song', 'voice')),
  storage_path text,
  body text,
  created_at timestamptz not null default now()
);

-- Публичная ссылка — отдельное действие, отзываемое.
create table public.memory_shares (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'base64'),
  include_voice boolean not null default false,
  include_coords boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.songs enable row level security;
alter table public.memories enable row level security;
alter table public.memory_assets enable row level security;
alter table public.voice_notes enable row level security;
alter table public.emotion_profiles enable row level security;
alter table public.countdown_events enable row level security;
alter table public.shared_albums enable row level security;
alter table public.album_members enable row level security;
alter table public.shared_album_items enable row level security;
alter table public.memory_shares enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

-- Личные данные: только владелец.
create policy "owner only" on public.locations for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner only" on public.songs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner only" on public.memories for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner only" on public.memory_assets for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner only" on public.voice_notes for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner only" on public.emotion_profiles for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner only" on public.countdown_events for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner only" on public.memory_shares for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Альбомы: владелец управляет; активные участники читают; участники с ролью contributor добавляют.
create or replace function public.is_album_member(a uuid, min_role text default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from album_members m
    where m.album_id = a and m.user_id = auth.uid() and m.status = 'active'
      and (min_role = 'viewer' or m.role = 'contributor')
  ) or exists (select 1 from shared_albums s where s.id = a and s.owner_id = auth.uid());
$$;

create policy "owner manages album" on public.shared_albums for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "members read album" on public.shared_albums for select using (public.is_album_member(id));

create policy "owner manages members" on public.album_members for all
  using (exists (select 1 from public.shared_albums s where s.id = album_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.shared_albums s where s.id = album_id and s.owner_id = auth.uid()));
create policy "member sees own membership" on public.album_members for select using (user_id = auth.uid());

create policy "members read items" on public.shared_album_items for select using (public.is_album_member(album_id));
create policy "contributors add items" on public.shared_album_items for insert with check (author_id = auth.uid() and public.is_album_member(album_id, 'contributor'));
create policy "author or owner deletes" on public.shared_album_items for delete using (
  author_id = auth.uid() or exists (select 1 from public.shared_albums s where s.id = album_id and s.owner_id = auth.uid())
);

-- ---------- Storage: приватные корзины ----------
insert into storage.buckets (id, name, public) values ('memories', 'memories', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('albums', 'albums', false) on conflict do nothing;

-- memories/<owner_id>/... — только владелец.
create policy "memories owner rw" on storage.objects for all
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text);

-- albums/<album_id>/... — участники альбома читают, contributors пишут.
create policy "albums members read" on storage.objects for select
  using (bucket_id = 'albums' and public.is_album_member(((storage.foldername(name))[1])::uuid));
create policy "albums contributors write" on storage.objects for insert
  with check (bucket_id = 'albums' and public.is_album_member(((storage.foldername(name))[1])::uuid, 'contributor'));

-- Realtime для общих альбомов
alter publication supabase_realtime add table public.shared_album_items;
