-- Temporary access keys. The main key lives in the MAIN_ACCESS_KEY environment variable;
-- the main key's holder creates these, each with an expiry, and can revoke them.
-- Only a SHA-256 hash of each key is stored; the key itself is shown once, at creation.
create table if not exists access_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Temporary key',
  key_hash text not null unique,
  hint text not null default '',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Only the server (service role) reads or writes keys.
alter table access_keys enable row level security;
