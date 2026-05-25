-- v2: rename groups, add master 'all' link, add guest upload table.

-- 1. Rename existing display names.
update photo_groups set display_name = 'Chris''s Parents' where id = 'my-parents';
update photo_groups set display_name = 'Chris''s Friends' where id = 'my-friends';
update photo_groups set display_name = 'Eileen''s Friends' where id = 'wife-friends';
update photo_groups set display_name = 'Eileen''s Family' where id = 'wife-family';
update photo_groups set display_name = 'Couple Photos' where id = 'couple';

-- 2. Master "all groups" link.  Visible to admins; one shared URL that surfaces
--    every photo and every guest upload, with category filter chips on the page.
insert into photo_groups (id, display_name, access_token, can_download, sort_order)
values ('all', 'All Photos (Master)', encode(gen_random_bytes(16), 'hex'), true, -1)
on conflict (id) do nothing;

-- 3. Guest-uploaded media (photos + videos).  Shared pool — uploads from any
--    group's link appear in the "Guest Uploads" tab of every gallery.
create table if not exists uploaded_media (
  id                uuid primary key default gen_random_uuid(),
  storage_path      text not null,
  thumbnail_path    text,
  file_name         text not null,
  media_type        text not null check (media_type in ('image', 'video')),
  mime_type         text,
  file_size         bigint,
  width             int,
  height            int,
  duration_seconds  real,
  uploader_name     text,
  uploaded_via      text references photo_groups(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists uploaded_media_created_idx on uploaded_media (created_at desc);

alter table uploaded_media enable row level security;
-- No policies = server-only access via service role (defense in depth).
