-- ==========================================================
-- HARTTECH - SUPABASE SETUP (run once in the SQL Editor)
-- Creates: admins, team_members, members, photo bucket,
--          security rules (RLS) and a public member counter.
-- ==========================================================

-- ---------- 1. ADMINS ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- An admin can see their own row (used by the admin page to confirm access)
drop policy if exists "admin reads own row" on public.admins;
create policy "admin reads own row" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- ---------- 2. TEAM MEMBERS (shown on about.html) ----------
create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  title       text check (char_length(title) <= 80),
  bio         text check (char_length(bio) <= 500),
  photo_url   text,
  sort_order  integer not null default 0,
  visible     boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.team_members enable row level security;

drop policy if exists "public reads visible team" on public.team_members;
create policy "public reads visible team" on public.team_members
  for select to anon, authenticated using (visible = true);

drop policy if exists "admin manages team" on public.team_members;
create policy "admin manages team" on public.team_members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 3. MEMBERS (community registrations) ----------
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (char_length(full_name) between 2 and 80),
  email       text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  interest    text check (interest in ('web','design','security','other')),
  role        text not null default 'member' check (role in ('member','moderator','admin')),
  status      text not null default 'pending' check (status in ('pending','active','rejected')),
  consent     boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.members enable row level security;

-- Visitors may ONLY register themselves as a pending "member" who gave consent.
-- They can never read the list, and cannot choose their own role or status.
drop policy if exists "anyone can register" on public.members;
create policy "anyone can register" on public.members
  for insert to anon, authenticated
  with check (role = 'member' and status = 'pending' and consent = true);

drop policy if exists "admin manages members" on public.members;
create policy "admin manages members" on public.members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 4. PUBLIC MEMBER COUNT (a number only, never the list) ----------
create or replace function public.active_member_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer from public.members where status = 'active';
$$;
grant execute on function public.active_member_count() to anon, authenticated;

-- ---------- 5. PHOTO STORAGE ----------
insert into storage.buckets (id, name, public)
values ('team-photos', 'team-photos', true)
on conflict (id) do nothing;

drop policy if exists "admin uploads team photos" on storage.objects;
create policy "admin uploads team photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'team-photos' and public.is_admin());

drop policy if exists "admin updates team photos" on storage.objects;
create policy "admin updates team photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'team-photos' and public.is_admin());

drop policy if exists "admin deletes team photos" on storage.objects;
create policy "admin deletes team photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'team-photos' and public.is_admin());

-- ==========================================================
-- AFTER RUNNING THE SCRIPT ABOVE:
-- 1. Supabase dashboard -> Authentication -> Users -> "Add user"
--    Create YOUR account (email + strong password, tick "Auto confirm").
--    Also turn OFF public sign-ups: Authentication -> Sign In / Providers
--    -> disable "Allow new users to sign up".
-- 2. Then run this line with YOUR email to make yourself the admin:
--
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'YOUR_EMAIL_HERE';
-- ==========================================================
