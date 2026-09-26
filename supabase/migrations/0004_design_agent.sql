-- Single design-agent workspace: a project can be based on a GitHub codebase,
-- and messages carry structured extras (comment targets, attachments,
-- answered questions, files a turn created/edited).
alter table projects add column if not exists codebase text;
alter table messages add column if not exists meta jsonb not null default '{}'::jsonb;
