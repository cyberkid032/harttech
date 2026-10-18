-- ==========================================================
-- HARTTECH - SUPABASE UPDATE 3 (run once in the SQL Editor)
-- Adds: projects (shown on projects.html) + image storage.
-- Safe to run more than once.
-- ==========================================================

create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 2 and 100),
  description  text check (char_length(description) <= 400),
  image_url    text,
  link_url     text check (link_url is null or link_url ~* '^https://'),
  sort_order   integer not null default 0,
  visible      boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.projects enable row level security;

drop policy if exists "public reads visible projects" on public.projects;
create policy "public reads visible projects" on public.projects
  for select to anon, authenticated using (visible = true);

drop policy if exists "admin manages projects" on public.projects;
create policy "admin manages projects" on public.projects
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Image storage (public to view, admin only to change)
insert into storage.buckets (id, name, public)
values ('project-images', 'project-images', true)
on conflict (id) do nothing;

drop policy if exists "admin uploads project images" on storage.objects;
create policy "admin uploads project images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-images' and public.is_admin());

drop policy if exists "admin updates project images" on storage.objects;
create policy "admin updates project images" on storage.objects
  for update to authenticated
  using (bucket_id = 'project-images' and public.is_admin());

drop policy if exists "admin deletes project images" on storage.objects;
create policy "admin deletes project images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-images' and public.is_admin());
