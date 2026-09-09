-- Standings, derived from completed matches. security_invoker keeps the
-- caller's RLS in force; matches and teams are publicly readable, so the
-- standings page works for signed-out visitors too.
create view public.team_standings
with (security_invoker = true) as
with results as (
  select m.season_id, m.home_team_id as team_id, m.home_points as points_for,
         m.away_points as points_against, m.status
  from public.matches m
  union all
  select m.season_id, m.away_team_id, m.away_points, m.home_points, m.status
  from public.matches m
  where m.away_team_id is not null
)
select
  t.id as team_id,
  t.season_id,
  t.name as team_name,
  count(r.team_id) filter (where r.status = 'completed') as matches_played,
  coalesce(sum(r.points_for) filter (where r.status = 'completed'), 0) as points_won,
  coalesce(sum(r.points_against) filter (where r.status = 'completed'), 0) as points_lost
from public.teams t
left join results r on r.team_id = t.id
group by t.id, t.season_id, t.name;

grant select on public.team_standings to anon, authenticated;
