-- Perf follow-up for the design_v2 migration: index the new lookup, and avoid
-- re-evaluating auth.uid() per row in the new design_systems policies.
create index if not exists design_systems_owner_id_idx on design_systems (owner_id);

drop policy if exists "read design systems" on design_systems;
create policy "read design systems" on design_systems for select
  using (owner_id is null or owner_id = (select auth.uid()));

drop policy if exists "insert own design systems" on design_systems;
create policy "insert own design systems" on design_systems for insert
  with check (owner_id = (select auth.uid()));

drop policy if exists "update own design systems" on design_systems;
create policy "update own design systems" on design_systems for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "delete own design systems" on design_systems;
create policy "delete own design systems" on design_systems for delete
  using (owner_id = (select auth.uid()));
