-- Dues move from "each bowler pays a weekly fee" to "each team owes a fee for
-- every match it plays". Anyone on the team can pay any part of a match's
-- balance, and between them the team can never pay more than the fee.

-- ----------------------------------------------------------------- leagues --
alter table public.leagues rename column weekly_fee_cents to match_fee_cents;

comment on column public.leagues.match_fee_cents is
  'What each team owes per match it plays. Byes and cancelled matches are free.';

-- ----------------------------------------------------------------- matches --
-- Target for the composite foreign key below, which keeps a payment inside the
-- same season as its match (the same pattern the rest of the schema uses).
alter table public.matches
  add constraint matches_id_season_id_key unique (id, season_id);

-- ---------------------------------------------------------------- payments --
-- A payment is now a contribution toward one team's balance for one match.
-- Teammates each pay part and one bowler can pay more than once, so the old
-- one-payment-per-bowler-per-week rule goes, along with week_id: the week comes
-- from the match.
drop index public.payments_one_settled_per_week;
alter table public.payments drop column week_id;

-- The team and match keys are NO ACTION rather than cascade: payments are money
-- records, so deleting a team or match that has them fails instead of quietly
-- taking the history with it. (Deleting a whole season still removes its
-- payments, as before.)
alter table public.payments
  add column team_id uuid not null,
  add column match_id uuid not null,
  add constraint payments_team_fkey foreign key (team_id, season_id)
    references public.teams (id, season_id),
  add constraint payments_match_fkey foreign key (match_id, season_id)
    references public.matches (id, season_id);

create index payments_team_match_idx on public.payments (team_id, match_id);
create index payments_match_idx on public.payments (match_id, season_id);

-- Teammates can see what the team has paid, so everyone knows what's left.
create policy "members read their team's payments"
  on public.payments for select to authenticated
  using (exists (
    select 1 from public.team_members tm
    where tm.team_id = payments.team_id
      and tm.profile_id = (select auth.uid())
  ));

-- --------------------------------------------------------- team_match_dues --
-- One row per team per match: the fee, and what's paid, in progress and left.
--
-- security_invoker keeps the caller's RLS on payments in force: admins see every
-- team's payments, a bowler sees only their own team's (other teams read as
-- unpaid), and the service role sees everything. A bye isn't a match, so the
-- team with the bye has no row that week.
--
-- A pending payment is an open Stripe Checkout session. It holds its share of
-- the balance for 35 minutes (sessions are created to expire after 30), so two
-- teammates can't both pay the last of it; after that it stops counting whether
-- or not the expiry webhook ever arrives.
create view public.team_match_dues
with (security_invoker = true) as
with sides as (
  select m.id as match_id, m.season_id, m.week_id, m.status,
         m.home_team_id as team_id, m.away_team_id as opponent_team_id
  from public.matches m
  where m.away_team_id is not null
  union all
  select m.id, m.season_id, m.week_id, m.status, m.away_team_id, m.home_team_id
  from public.matches m
  where m.away_team_id is not null
),
totals as (
  select p.match_id, p.team_id,
         sum(p.amount_cents) filter (where p.status = 'paid') as paid_cents,
         sum(p.amount_cents) filter (
           where p.status = 'pending' and p.created_at > now() - interval '35 minutes'
         ) as pending_cents
  from public.payments p
  group by p.match_id, p.team_id
),
fees as (
  select s.*,
         case when s.status = 'cancelled' then 0 else l.match_fee_cents end as fee_cents
  from sides s
  join public.seasons se on se.id = s.season_id
  join public.leagues l on l.id = se.league_id
)
select
  f.match_id,
  f.season_id,
  f.week_id,
  w.week_number,
  w.bowl_date,
  f.team_id,
  t.name as team_name,
  f.opponent_team_id,
  o.name as opponent_name,
  f.fee_cents,
  coalesce(tot.paid_cents, 0)::integer as paid_cents,
  coalesce(tot.pending_cents, 0)::integer as pending_cents,
  greatest(f.fee_cents - coalesce(tot.paid_cents, 0), 0)::integer as remaining_cents
from fees f
join public.weeks w on w.id = f.week_id
join public.teams t on t.id = f.team_id
join public.teams o on o.id = f.opponent_team_id
left join totals tot on tot.match_id = f.match_id and tot.team_id = f.team_id;

-- Balances are for signed-in bowlers, not the public site.
revoke all on public.team_match_dues from anon;
grant select on public.team_match_dues to authenticated;

-- ---------------------------------------------------- reserve_team_payment --
-- Hold part of a team's match balance for a bowler about to check out, and
-- return the pending payment row. The checks and the insert run under a lock
-- per team per match, so teammates checking out at the same moment can't
-- together go over the fee.
--
-- Server-only (service role). Failures raise a fixed message that the checkout
-- route maps to something a bowler can act on.
create function public.reserve_team_payment(
  p_profile_id uuid,
  p_match_id uuid,
  p_amount_cents integer
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_due public.team_match_dues;
  v_available integer;
  v_payment public.payments;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid_amount';
  end if;

  -- The bowler's team, provided it plays in this match.
  select tm.team_id into v_team_id
  from public.matches m
  join public.team_members tm
    on tm.season_id = m.season_id
   and tm.team_id in (m.home_team_id, m.away_team_id)
  where m.id = p_match_id
    and tm.profile_id = p_profile_id;

  if v_team_id is null then
    raise exception 'not_on_a_team_in_match';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_team_id::text || ':' || p_match_id::text, 0));

  -- Read after taking the lock, so a teammate's reservation that just committed
  -- is counted.
  select * into v_due
  from public.team_match_dues
  where team_id = v_team_id and match_id = p_match_id;

  if not found or v_due.fee_cents = 0 then
    raise exception 'nothing_owed';
  end if;

  v_available := v_due.remaining_cents - v_due.pending_cents;

  if v_due.remaining_cents = 0 then
    raise exception 'already_paid';
  elsif v_available <= 0 then
    raise exception 'payment_in_progress';
  elsif p_amount_cents > v_available then
    raise exception 'over_balance';
  end if;

  insert into public.payments (profile_id, season_id, team_id, match_id, amount_cents)
  values (p_profile_id, v_due.season_id, v_team_id, p_match_id, p_amount_cents)
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.reserve_team_payment(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_team_payment(uuid, uuid, integer) to service_role;
