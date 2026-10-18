-- SYNAPSE daily leaderboard.
--
-- Scores are written only by the server (service role) after it has replayed
-- and verified a run. Browsers never write to this table directly.

create table if not exists public.daily_scores (
  id            bigint generated always as identity primary key,
  date_key      date        not null,
  division      text        not null check (division in ('standard', 'spoken')),
  player_id     uuid        not null,
  display_name  text        not null check (display_name ~ '^[A-Za-z0-9 ._-]{2,20}$'),
  fei_ms        integer     not null check (fei_ms >= 0),
  completed     integer     not null check (completed >= 0),
  max_length    integer     not null check (max_length between 0 and 12),
  submitted_at  timestamptz not null default now(),
  -- One ranked record per player, per division, per day.
  constraint daily_scores_one_per_player unique (date_key, division, player_id)
);

create index if not exists daily_scores_rank_idx
  on public.daily_scores (date_key, division, fei_ms desc, completed desc, submitted_at asc);

alter table public.daily_scores enable row level security;

-- Anyone may read the board, but only its public columns: player_id is the
-- player's private device identifier and is never readable from a browser.
revoke select on public.daily_scores from anon, authenticated;
grant select (date_key, division, display_name, fei_ms, completed, max_length, submitted_at)
  on public.daily_scores to anon, authenticated;

create policy "daily scores are publicly readable"
  on public.daily_scores for select
  to anon, authenticated
  using (true);

-- No insert, update or delete policy exists for anon or authenticated, so
-- with RLS enabled those roles cannot write at all. Only the service role,
-- used by the server after verification, can insert.
revoke insert, update, delete on public.daily_scores from anon, authenticated;
