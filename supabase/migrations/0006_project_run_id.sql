-- The id of the turn that currently owns a project. A turn stops as soon as
-- it sees it has been stopped or replaced by a newer run.
alter table projects add column if not exists run_id text;
