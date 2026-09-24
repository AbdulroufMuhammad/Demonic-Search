-- Applied to Supabase project demonic-search (gsoiexqtaiyjepzqyfso).
create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table design_systems (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  tokens jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  template text not null default 'blank',
  model_profile text not null default 'quality',
  design_system_id uuid references design_systems(id) on delete set null,
  goal text,
  status text not null default 'idle',
  budget jsonb not null default '{"tokensLeft":300000,"searchesLeft":150,"rounds":0,"maxRounds":1}'::jsonb,
  plan jsonb,
  thumbnail_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  role text not null,
  content text not null default '',
  created_at timestamptz not null default now()
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  short_id text not null,
  url text not null,
  title text,
  text text,
  content_hash text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, short_id)
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  facet_id text,
  text text not null,
  quote text,
  source_ids uuid[] not null default '{}',
  confidence numeric,
  ok boolean,
  created_at timestamptz not null default now()
);

create table gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  facet_id text,
  question text not null,
  priority text not null default 'medium',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  path text not null,
  version int not null default 1,
  storage_path text not null,
  content_type text not null default 'text/html',
  created_at timestamptz not null default now(),
  unique (project_id, path, version)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  role text,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_project_created_idx on events (project_id, created_at);
create index messages_project_created_idx on messages (project_id, created_at);
create index sources_project_idx on sources (project_id);
create index claims_project_idx on claims (project_id);
create index files_project_path_idx on files (project_id, path);

alter table profiles enable row level security;
alter table design_systems enable row level security;
alter table projects enable row level security;
alter table messages enable row level security;
alter table sources enable row level security;
alter table claims enable row level security;
alter table gaps enable row level security;
alter table files enable row level security;
alter table events enable row level security;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own design systems" on design_systems for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own projects" on projects for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "project messages" on messages for all
  using (exists (select 1 from projects p where p.id = messages.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = messages.project_id and p.owner_id = auth.uid()));

create policy "project sources" on sources for all
  using (exists (select 1 from projects p where p.id = sources.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = sources.project_id and p.owner_id = auth.uid()));

create policy "project claims" on claims for all
  using (exists (select 1 from projects p where p.id = claims.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = claims.project_id and p.owner_id = auth.uid()));

create policy "project gaps" on gaps for all
  using (exists (select 1 from projects p where p.id = gaps.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = gaps.project_id and p.owner_id = auth.uid()));

create policy "project files" on files for all
  using (exists (select 1 from projects p where p.id = files.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = files.project_id and p.owner_id = auth.uid()));

create policy "project events" on events for all
  using (exists (select 1 from projects p where p.id = events.project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = events.project_id and p.owner_id = auth.uid()));

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Storage
insert into storage.buckets (id, name, public) values ('artifacts', 'artifacts', true)
on conflict (id) do nothing;

create policy "public read artifacts" on storage.objects for select
  using (bucket_id = 'artifacts');

create policy "owner write artifacts" on storage.objects for insert
  with check (bucket_id = 'artifacts' and auth.role() = 'service_role');

create policy "owner update artifacts" on storage.objects for update
  using (bucket_id = 'artifacts' and auth.role() = 'service_role');
