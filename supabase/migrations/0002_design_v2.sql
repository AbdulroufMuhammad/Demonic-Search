-- Design v2: share links, design-system fonts, per-facet sources, and a fix
-- for claims.source_ids (it stores short IDs like "S3", not uuids).

alter table claims alter column source_ids drop default;
alter table claims alter column source_ids type text[] using source_ids::text[];
alter table claims alter column source_ids set default '{}';

alter table sources add column if not exists facet_id text;

alter table projects add column if not exists share_access text not null default 'private';
alter table projects drop constraint if exists projects_share_access_check;
alter table projects add constraint projects_share_access_check
  check (share_access in ('private', 'view', 'edit'));

-- tokens is now {"colors":[{"name","hex"}],"fonts":[{"role","stack"}]}
alter table design_systems add column if not exists updated_at timestamptz not null default now();

-- Global (owner_id null) rows are the seeded starter systems every user sees
-- alongside their own; only a user's own rows can be mutated.
alter table design_systems alter column owner_id drop not null;

drop policy if exists "own design systems" on design_systems;
create policy "read design systems" on design_systems for select
  using (owner_id is null or owner_id = auth.uid());
create policy "insert own design systems" on design_systems for insert
  with check (owner_id = auth.uid());
create policy "update own design systems" on design_systems for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "delete own design systems" on design_systems for delete
  using (owner_id = auth.uid());

insert into design_systems (id, owner_id, name, tokens) values
  ('00000000-0000-4000-8000-000000000001', null, 'Nocturne', '{
    "colors": [
      {"name": "Background", "hex": "#161826"},
      {"name": "Surface", "hex": "#232532"},
      {"name": "Text", "hex": "#e9e9ed"},
      {"name": "Accent", "hex": "#9184d9"},
      {"name": "Accent 2", "hex": "#a7a1db"}
    ],
    "fonts": [
      {"role": "Heading", "stack": "''Inter'', sans-serif"},
      {"role": "Body", "stack": "''Inter'', sans-serif"}
    ]
  }'::jsonb),
  ('00000000-0000-4000-8000-000000000002', null, 'Organic', '{
    "colors": [
      {"name": "Background", "hex": "#f5ead8"},
      {"name": "Surface", "hex": "#ebddc5"},
      {"name": "Text", "hex": "#201e1d"},
      {"name": "Accent", "hex": "#c67139"},
      {"name": "Accent 2", "hex": "#7a8a5e"}
    ],
    "fonts": [
      {"role": "Heading", "stack": "''Caprasimo'', serif"},
      {"role": "Body", "stack": "''Figtree'', sans-serif"}
    ]
  }'::jsonb),
  ('00000000-0000-4000-8000-000000000003', null, 'Modernist', '{
    "colors": [
      {"name": "Background", "hex": "#f3f2f2"},
      {"name": "Surface", "hex": "#eae9e9"},
      {"name": "Text", "hex": "#201e1d"},
      {"name": "Accent", "hex": "#ec3013"},
      {"name": "Accent 2", "hex": "#e15b47"}
    ],
    "fonts": [
      {"role": "Heading", "stack": "''Archivo'', sans-serif"},
      {"role": "Body", "stack": "''Archivo'', sans-serif"}
    ]
  }'::jsonb),
  ('00000000-0000-4000-8000-000000000004', null, 'Classical', '{
    "colors": [
      {"name": "Background", "hex": "#f3f2f2"},
      {"name": "Surface", "hex": "#eae9e9"},
      {"name": "Text", "hex": "#201f1d"},
      {"name": "Accent", "hex": "#b68235"},
      {"name": "Accent 2", "hex": "#ac803e"}
    ],
    "fonts": [
      {"role": "Heading", "stack": "''Cormorant Garamond'', serif"},
      {"role": "Body", "stack": "''Lora'', serif"}
    ]
  }'::jsonb)
on conflict (id) do update set name = excluded.name, tokens = excluded.tokens;
