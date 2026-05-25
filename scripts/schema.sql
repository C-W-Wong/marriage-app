-- Wedding photo gallery schema
-- All access is gated through the server using the service-role key.
-- We still enable RLS as defense-in-depth so the publishable/anon key
-- can never read these tables directly.

create extension if not exists pgcrypto;

create table if not exists photo_groups (
  id            text primary key,           -- e.g. 'couple', 'my-parents'
  display_name  text not null,
  access_token  text unique,                -- null for couple (no direct link, served to every group)
  can_download  boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists photos (
  id              uuid primary key default gen_random_uuid(),
  group_id        text not null references photo_groups(id) on delete cascade,
  storage_path    text not null,            -- path inside the bucket for the full-res original
  thumbnail_path  text,                     -- path inside the bucket for the browsing thumbnail
  file_name       text not null,            -- original filename (for download)
  file_size       bigint,
  width           int,
  height          int,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (group_id, file_name)
);

create index if not exists photos_group_idx on photos(group_id, sort_order, id);

alter table photo_groups enable row level security;
alter table photos       enable row level security;

-- No policies = no access from anon/publishable keys. Server uses service_role.

-- Seed the 5 groups + couple gallery if they don't exist yet.
-- Tokens are generated inline; the upload script will skip seeding if rows exist.
insert into photo_groups (id, display_name, access_token, can_download, sort_order)
values
  ('couple',       'Couple Photos', null,                                      false, 0),
  ('my-parents',   'My Parents',    encode(gen_random_bytes(16), 'hex'),       true,  1),
  ('my-friends',   'My Friends',    encode(gen_random_bytes(16), 'hex'),       true,  2),
  ('wife-friends', 'Wife''s Friends', encode(gen_random_bytes(16), 'hex'),     true,  3),
  ('wife-family',  'Wife''s Family',  encode(gen_random_bytes(16), 'hex'),     true,  4)
on conflict (id) do nothing;
