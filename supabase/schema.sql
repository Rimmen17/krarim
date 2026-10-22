-- Krarim: tables and access rules.
-- Run once in the Supabase SQL editor of a new project.
-- Two equal partners: both read and change everything. Visitors who are not logged in get nothing.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  location text not null default '' check (char_length(location) <= 80),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at > starts_at),
  all_day boolean not null default false,
  -- Whose event it is; empty means both.
  who uuid references public.profiles on delete set null,
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

-- The to-do list and the shopping list exist once each; the rest are lists they make themselves.
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  kind text not null default 'custom' check (kind in ('todo', 'shopping', 'custom')),
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create unique index lists_one_per_fixed_kind on public.lists (kind) where kind <> 'custom';

create table public.items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  done boolean not null default false,
  done_at timestamptz,
  assignee uuid references public.profiles on delete set null,
  -- Set: a private to-do that only this person can see. Empty: shared.
  owner uuid references public.profiles on delete cascade,
  due date,
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create index events_starts_at_idx on public.events (starts_at);
create index items_list_id_idx on public.items (list_id);

insert into public.lists (name, kind, created_by) values ('To-do', 'todo', null), ('Indkøb', 'shopping', null);

-- Every new login gets a profile. The name comes from the user's metadata
-- ("name") when set, otherwise from the part of the email before the @.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), initcap(split_part(new.email, '@', 1)))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.lists enable row level security;
alter table public.items enable row level security;

revoke all on public.profiles, public.events, public.lists, public.items from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, delete on public.events, public.lists, public.items to authenticated;
-- Column grants: who made a row, and what kind a list is, cannot be changed afterwards.
grant update (title, description, location, starts_at, ends_at, all_day, who) on public.events to authenticated;
grant update (name) on public.lists to authenticated;
grant update (text, done, done_at, assignee, due) on public.items to authenticated;

create policy "partners read profiles" on public.profiles
  for select to authenticated using (true);

create policy "partners read events" on public.events
  for select to authenticated using (true);
create policy "partners add events" on public.events
  for insert to authenticated with check (created_by = auth.uid());
create policy "partners edit events" on public.events
  for update to authenticated using (true) with check (true);
create policy "partners delete events" on public.events
  for delete to authenticated using (true);

create policy "partners read lists" on public.lists
  for select to authenticated using (true);
-- New lists are always their own kind; the to-do and shopping lists cannot be deleted.
create policy "partners add lists" on public.lists
  for insert to authenticated with check (created_by = auth.uid() and kind = 'custom');
create policy "partners rename lists" on public.lists
  for update to authenticated using (true) with check (true);
create policy "partners delete own lists" on public.lists
  for delete to authenticated using (kind = 'custom');

-- Items: shared ones are for both; a private to-do (owner set) exists only for its owner,
-- who can neither see nor touch the other's. Private items belong on the to-do list only.
-- The owner column is not in the update grant, so a task can never change hands.
create policy "partners read items" on public.items
  for select to authenticated using (owner is null or owner = auth.uid());
create policy "partners add items" on public.items
  for insert to authenticated with check (
    created_by = auth.uid()
    and (
      owner is null
      or (owner = auth.uid() and exists (select 1 from public.lists l where l.id = list_id and l.kind = 'todo'))
    )
  );
create policy "partners edit items" on public.items
  for update to authenticated
  using (owner is null or owner = auth.uid())
  with check (owner is null or owner = auth.uid());
create policy "partners delete items" on public.items
  for delete to authenticated using (owner is null or owner = auth.uid());

-- Live updates in the open app (Supabase Realtime respects the rules above).
alter publication supabase_realtime add table public.events, public.lists, public.items;
