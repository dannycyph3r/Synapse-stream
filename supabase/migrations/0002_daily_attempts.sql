-- SYNAPSE: two daily attempts, best one kept.
--
-- Each player gets two ranked attempts per division per day. The client posts
-- after each attempt with its attempt number (1 or 2) and its best run so far;
-- the server verifies the run, then this function keeps the better of the
-- stored and submitted scores. Resending the same attempt number changes
-- nothing, so a retry after a dropped connection is always safe.
--
-- Safe to run more than once.

alter table public.daily_scores
  add column if not exists attempts smallint not null default 1;

alter table public.daily_scores
  drop constraint if exists daily_scores_attempts_range;
alter table public.daily_scores
  add constraint daily_scores_attempts_range check (attempts between 1 and 2);

-- The server now updates rows (to keep the better attempt).
grant update on public.daily_scores to service_role;

create or replace function public.submit_daily_score(
  p_date_key     date,
  p_division     text,
  p_player_id    uuid,
  p_display_name text,
  p_fei_ms       integer,
  p_completed    integer,
  p_max_length   integer,
  p_attempt      integer
)
returns table (
  outcome      text,
  display_name text,
  fei_ms       integer,
  completed    integer,
  max_length   integer,
  attempts     smallint,
  submitted_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cur public.daily_scores%rowtype;
  result text;
begin
  if p_attempt is null or p_attempt not between 1 and 2 then
    raise exception 'attempt must be 1 or 2' using errcode = '22023';
  end if;

  -- Two passes at most: if a concurrent request inserts first, the second
  -- pass finds and locks that row.
  for pass in 1..2 loop
    select * into cur
      from public.daily_scores s
     where s.date_key = p_date_key and s.division = p_division and s.player_id = p_player_id
       for update;

    if not found then
      insert into public.daily_scores
        (date_key, division, player_id, display_name, fei_ms, completed, max_length, attempts)
      values
        (p_date_key, p_division, p_player_id, p_display_name, p_fei_ms, p_completed, p_max_length, p_attempt)
      on conflict on constraint daily_scores_one_per_player do nothing;
      if found then
        result := 'inserted';
        exit;
      end if;
      continue;
    end if;

    if p_attempt <= cur.attempts then
      -- A resend of an attempt already counted: nothing changes.
      result := 'unchanged';
    elsif (p_fei_ms, p_completed) > (cur.fei_ms, cur.completed) then
      update public.daily_scores s
         set display_name = p_display_name, fei_ms = p_fei_ms, completed = p_completed,
             max_length = p_max_length, attempts = p_attempt, submitted_at = now()
       where s.id = cur.id;
      result := 'improved';
    else
      -- The earlier attempt was better: keep its score and its time.
      update public.daily_scores s
         set display_name = p_display_name, attempts = p_attempt
       where s.id = cur.id;
      result := 'kept';
    end if;
    exit;
  end loop;

  return query
    select result, s.display_name, s.fei_ms, s.completed, s.max_length, s.attempts, s.submitted_at
      from public.daily_scores s
     where s.date_key = p_date_key and s.division = p_division and s.player_id = p_player_id;
end;
$$;

-- Only the server may call it. Browsers keep read-only access to the table.
revoke all on function public.submit_daily_score(date, text, uuid, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.submit_daily_score(date, text, uuid, text, integer, integer, integer, integer)
  to service_role;
