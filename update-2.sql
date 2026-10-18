-- ==========================================================
-- HARTTECH - SUPABASE UPDATE 2 (run once in the SQL Editor)
-- Adds: contact messages, member notes, announcements.
-- Safe to run more than once.
-- ==========================================================

-- ---------- 1. CONTACT MESSAGES ----------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject     text not null check (char_length(subject) between 1 and 120),
  message     text not null check (char_length(message) between 10 and 2000),
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.messages enable row level security;

-- Visitors can only SEND a message (as unread). They can never read any.
drop policy if exists "anyone can send a message" on public.messages;
create policy "anyone can send a message" on public.messages
  for insert to anon, authenticated with check (read = false);

drop policy if exists "admin manages messages" on public.messages;
create policy "admin manages messages" on public.messages
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 2. MEMBER NOTES (private, admin only) ----------
alter table public.members
  add column if not exists note text check (char_length(note) <= 500);

-- ---------- 3. ANNOUNCEMENTS / EVENTS (shown on the Join Us page) ----------
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 2 and 120),
  body        text check (char_length(body) <= 600),
  event_date  date,
  visible     boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.announcements enable row level security;

drop policy if exists "public reads visible announcements" on public.announcements;
create policy "public reads visible announcements" on public.announcements
  for select to anon, authenticated using (visible = true);

drop policy if exists "admin manages announcements" on public.announcements;
create policy "admin manages announcements" on public.announcements
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
