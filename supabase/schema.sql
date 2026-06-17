create extension if not exists pgcrypto;

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  role text not null check (role in ('admin', 'responsible')),
  unit_id uuid references public.units(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  title text not null,
  description text,
  date date not null,
  time_period text,
  scheduled_time time,
  content_type text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'not_done')),
  responsible_id uuid references public.users(id) on delete set null,
  reference_url text,
  source_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  status text not null check (status in ('pending', 'in_progress', 'completed', 'not_done')),
  note text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units(id) on delete cascade,
  title text not null,
  description text,
  content_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  month date not null,
  planned_tasks integer not null default 0,
  completed_tasks integer not null default 0,
  execution_rate numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (unit_id, month)
);

create index if not exists idx_users_unit_id on public.users(unit_id);
create index if not exists idx_tasks_unit_date on public.tasks(unit_id, date);
create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_task_logs_task_created on public.task_logs(task_id, created_at desc);
create index if not exists idx_task_logs_unit_created on public.task_logs(unit_id, created_at desc);

alter table public.units enable row level security;
alter table public.users enable row level security;
alter table public.tasks enable row level security;
alter table public.task_logs enable row level security;
alter table public.content_ideas enable row level security;
alter table public.monthly_reports enable row level security;

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.current_user_unit()
returns uuid
language sql
security definer
set search_path = public
as $$
  select unit_id from public.users where id = auth.uid()
$$;

drop policy if exists "units read authenticated" on public.units;
create policy "units read authenticated"
on public.units for select
to authenticated
using (true);

drop policy if exists "users read own or admin" on public.users;
create policy "users read own or admin"
on public.users for select
to authenticated
using (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "users admin write" on public.users;
create policy "users admin write"
on public.users for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "tasks scoped read" on public.tasks;
create policy "tasks scoped read"
on public.tasks for select
to authenticated
using (public.current_user_role() = 'admin' or unit_id = public.current_user_unit());

drop policy if exists "tasks scoped update" on public.tasks;
create policy "tasks scoped update"
on public.tasks for update
to authenticated
using (public.current_user_role() = 'admin' or unit_id = public.current_user_unit())
with check (public.current_user_role() = 'admin' or unit_id = public.current_user_unit());

drop policy if exists "tasks admin insert" on public.tasks;
create policy "tasks admin insert"
on public.tasks for insert
to authenticated
with check (public.current_user_role() = 'admin');

drop policy if exists "tasks admin delete" on public.tasks;
create policy "tasks admin delete"
on public.tasks for delete
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "task logs scoped read" on public.task_logs;
create policy "task logs scoped read"
on public.task_logs for select
to authenticated
using (public.current_user_role() = 'admin' or unit_id = public.current_user_unit());

drop policy if exists "task logs scoped insert" on public.task_logs;
create policy "task logs scoped insert"
on public.task_logs for insert
to authenticated
with check (public.current_user_role() = 'admin' or unit_id = public.current_user_unit());

drop policy if exists "ideas scoped read" on public.content_ideas;
create policy "ideas scoped read"
on public.content_ideas for select
to authenticated
using (unit_id is null or public.current_user_role() = 'admin' or unit_id = public.current_user_unit());

drop policy if exists "ideas admin write" on public.content_ideas;
create policy "ideas admin write"
on public.content_ideas for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "reports admin read" on public.monthly_reports;
create policy "reports admin read"
on public.monthly_reports for select
to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "reports admin write" on public.monthly_reports;
create policy "reports admin write"
on public.monthly_reports for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

insert into public.units (name, city)
values
  ('DentalMed Joao Pessoa', 'Joao Pessoa'),
  ('DentalMed Campina Grande', 'Campina Grande'),
  ('DentalMed Recife', 'Recife'),
  ('DentalMed Guarabira', 'Guarabira')
on conflict (city) do nothing;

insert into public.content_ideas (title, description, content_type)
values
  ('Dica do Academico', 'Explique um material essencial para estudantes e convide para conhecer na loja.', 'Educativo'),
  ('Favorito da Bancada', 'Mostre um produto muito procurado por dentistas e destaque um beneficio pratico.', 'Produto'),
  ('Enquete rapida', 'Pergunte se o publico ja usou o produto em destaque e responda nos stories seguintes.', 'Interacao')
on conflict do nothing;
