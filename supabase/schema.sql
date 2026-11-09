-- Ricochet Cards: run once in Supabase -> SQL Editor -> New query -> Run.
-- Public, login-free game: anyone can add and read rows; nobody can edit or delete them.

create table if not exists rooms (
  code        text primary key,
  status      text not null default 'waiting' check (status in ('waiting', 'playing', 'done')),
  created_at  timestamptz not null default now()
);

create table if not exists throws (
  id          bigint generated always as identity primary key,
  room_code   text not null,
  player      text not null,
  turn        int  not null,
  bounces     int  not null,
  rank        int  not null,
  score       int  not null,
  path        jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists ghost_runs (
  id            bigint generated always as identity primary key,
  player_name   text not null,
  layout        text,
  throws        jsonb not null,
  total_score   int  not null,
  created_at    timestamptz not null default now()
);

create table if not exists best_scores (
  id            bigint generated always as identity primary key,
  player_name   text not null,
  mode          text not null,
  score         int  not null,
  created_at    timestamptz not null default now()
);

alter table rooms       enable row level security;
alter table throws      enable row level security;
alter table ghost_runs  enable row level security;
alter table best_scores enable row level security;

-- read + insert only (no update / delete policy = not allowed)
do $$
declare t text;
begin
  foreach t in array array['rooms', 'throws', 'ghost_runs', 'best_scores'] loop
    execute format('drop policy if exists "anon read" on %I', t);
    execute format('drop policy if exists "anon insert" on %I', t);
    execute format('create policy "anon read"   on %I for select to anon using (true)', t);
    execute format('create policy "anon insert" on %I for insert to anon with check (true)', t);
  end loop;
end $$;

-- limits so a bad client can't store huge rows
alter table ghost_runs  add constraint ghost_runs_size  check (pg_column_size(throws) < 20000) not valid;
alter table throws      add constraint throws_size      check (path is null or pg_column_size(path) < 20000) not valid;
