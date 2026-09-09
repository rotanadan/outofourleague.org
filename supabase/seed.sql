-- Sample data for local development (`supabase db reset` runs this).
-- Creates one league, one active season, eight teams, and a full round-robin
-- schedule. No profiles: those come from real signups.

insert into public.leagues (name, slug, description, venue, day_of_week, start_time, weekly_fee_cents)
values (
  'Out of Our League',
  'out-of-our-league',
  'A very serious Saturday night bowling league.',
  'Sunset Lanes',
  6,
  '19:00',
  2500
);

insert into public.seasons (league_id, name, starts_on, ends_on, is_active)
select id, 'Fall 2026', date '2026-09-12', date '2026-12-05', true
from public.leagues where slug = 'out-of-our-league';

insert into public.teams (season_id, name)
select s.id, t.name
from public.seasons s
cross join (values
  ('Gutter Guys'),
  ('Pin Pals'),
  ('Split Happens'),
  ('Bowl Movements'),
  ('Alley Cats'),
  ('Spare Me'),
  ('Turkey Hunters'),
  ('Lane Violation')
) as t(name)
where s.name = 'Fall 2026';

-- Seven bowl dates, every other Saturday from the season start.
insert into public.weeks (season_id, week_number, bowl_date)
select s.id, w.n::smallint, s.starts_on + ((w.n - 1) * 14)
from public.seasons s
cross join generate_series(1, 7) as w(n)
where s.name = 'Fall 2026';

-- Round-robin pairings (circle method: team 1 is fixed, the rest rotate).
do $$
declare
  v_season uuid;
  v_teams uuid[];
  v_week uuid;
  n int;
  w int;
  i int;
begin
  select id into v_season from public.seasons where name = 'Fall 2026';
  select array_agg(id order by name) into v_teams from public.teams where season_id = v_season;
  n := array_length(v_teams, 1);

  for w in 1..(n - 1) loop
    select id into v_week from public.weeks where season_id = v_season and week_number = w;

    for i in 1..(n / 2) loop
      insert into public.matches (season_id, week_id, home_team_id, away_team_id, lanes)
      values (v_season, v_week, v_teams[i], v_teams[n + 1 - i], (2 * i - 1) || '-' || (2 * i));
    end loop;

    v_teams := array_prepend(v_teams[1], array_append(v_teams[3:n], v_teams[2]));
  end loop;
end;
$$;
