-- Sample data for local development (`supabase db reset` runs this).
-- Creates one league, one active season, eight teams with their rosters, and a
-- full round-robin schedule.

insert into public.leagues (name, slug, description, venue, day_of_week, start_time, match_fee_cents)
values (
  'Out of Our League',
  'out-of-our-league',
  'A very serious Saturday night bowling league.',
  'Sunset Lanes',
  6,
  '19:00',
  6000
);

insert into public.seasons (league_id, name, starts_on, ends_on, is_active)
select id, 'Fall 2026', date '2026-09-12', date '2026-12-05', true
from public.leagues where slug = 'out-of-our-league';

insert into public.teams (season_id, name)
select s.id, t.name
from public.seasons s
cross join (values
  ('Turkey Hunters'),
  ('2 Girls With Balls'),
  ('Pin Pals'),
  ('Strikes R Us'),
  ('4 Balls 2 Racks'),
  ('Spared Splitless'),
  ('Wii Bowling 4 Reals'),
  ('Lickity Splits')
) as t(name)
where s.name = 'Fall 2026';

-- Rosters, from the league's LeagueSecretary.com summary (where Lickity Splits
-- is still listed as "TBD"), with each bowler's week-1 average as their
-- starting average. Each bowler is an auth user with a made-up email
-- and no password; the on_auth_user_created trigger gives them a profile.
-- GoTrue can't read NULLs in the token columns, so those are set to ''.
with roster (team, full_name, starting_average) as (
  values
    ('Turkey Hunters', 'Anna Quinn', 138),
    ('Turkey Hunters', 'Bruce Quinn', 141),
    ('Turkey Hunters', 'Katie Steinke', 61),
    ('Turkey Hunters', 'Stephen Steinke', 144),
    ('2 Girls With Balls', 'Jesse Allison', 189),
    ('2 Girls With Balls', 'Wendy Allison', 148),
    ('2 Girls With Balls', 'Jenny Hawthorne', 109),
    ('2 Girls With Balls', 'Sean Hawthorne', 118),
    ('Pin Pals', 'Jenny Hoke', 143),
    ('Pin Pals', 'Nate Hoke', 158),
    ('Pin Pals', 'Dan Schwartz', 152),
    ('Pin Pals', 'Sarah Schwartz', 127),
    ('Strikes R Us', 'John Palomino', 156),
    ('Strikes R Us', 'Mai Palomino', 97),
    ('Strikes R Us', 'Pam Palomino', 112),
    ('Strikes R Us', 'Tristan Palomino', 214),
    ('4 Balls 2 Racks', 'Christie Mallet', 121),
    ('4 Balls 2 Racks', 'Tom Mallet', 177),
    ('4 Balls 2 Racks', 'Dax Stoehr', 140),
    ('4 Balls 2 Racks', 'Emily Stoehr', 120),
    ('Spared Splitless', 'Cary Cunningham', 118),
    ('Spared Splitless', 'Shannon Cunningham', 100),
    ('Spared Splitless', 'Joe Palkowitsch', 149),
    ('Spared Splitless', 'Sarah Palkowitsch', 91),
    ('Wii Bowling 4 Reals', 'Amy Huss', 93),
    ('Wii Bowling 4 Reals', 'Andrew Huss', 144),
    ('Wii Bowling 4 Reals', 'Bridget Huss', 103),
    ('Wii Bowling 4 Reals', 'Mike Huss', 126),
    ('Lickity Splits', 'Tessa Fox', 101),
    ('Lickity Splits', 'Eric Gutterman', 105),
    ('Lickity Splits', 'Erica Hathaway', 123),
    ('Lickity Splits', 'Jake Hathaway', 205)
),
bowlers as (
  select gen_random_uuid() as id, team, full_name, starting_average,
         'bowler-' || substr(md5(random()::text), 1, 10) || '@example.com' as email
  from roster
),
users as (
  insert into auth.users (
    instance_id, id, aud, role, email, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select '00000000-0000-0000-0000-000000000000', b.id, 'authenticated', 'authenticated',
         b.email, now(),
         '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', b.full_name),
         now(), now(), '', '', '', ''
  from bowlers b
  returning id
)
insert into public.team_members (team_id, season_id, profile_id, starting_average)
select t.id, t.season_id, b.id, b.starting_average
from bowlers b
join users u on u.id = b.id
join public.teams t on t.name = b.team
join public.seasons s on s.id = t.season_id and s.name = 'Fall 2026';

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
