-- Per-project settings: extra design systems ({"designSystems": [...]}) and
-- the rolling summary of older chat messages ({"summary": {...}}).
alter table projects add column if not exists settings jsonb not null default '{}'::jsonb;
