-- Out of Our League — core schema
--
-- Model: a league runs seasons; a season has teams, a roster (team_members),
-- numbered weeks, and matches inside those weeks. Weekly fees are tracked as
-- payments rows that Stripe fills in later.

create extension if not exists pgcrypto;

create type public.member_role as enum ('admin', 'member');
create type public.team_role as enum ('captain', 'bowler', 'sub');
create type public.match_status as enum ('scheduled', 'completed', 'cancelled');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

-- ---------------------------------------------------------------- profiles --
-- One row per auth.users row, created by the trigger at the bottom of this file.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  phone text,
  avatar_url text,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- leagues --
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  venue text,
  -- 0 = Sunday .. 6 = Saturday, matching JS getDay()
  day_of_week smallint check (day_of_week between 0 and 6),
  start_time time,
  weekly_fee_cents integer not null default 0 check (weekly_fee_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- seasons --
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, name),
  check (ends_on is null or ends_on >= starts_on)
);

-- Only one season per league may be the active one.
create unique index seasons_one_active_per_league
  on public.seasons (league_id)
  where is_active;

-- ------------------------------------------------------------------- teams --
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  name text not null,
  captain_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, name),
  -- Target for the composite foreign keys below, which keep every roster spot
  -- and match inside the same season as its team.
  unique (id, season_id)
);

create index teams_season_id_idx on public.teams (season_id);

-- ------------------------------------------------------------ team_members --
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  season_id uuid not null references public.seasons (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.team_role not null default 'bowler',
  joined_at timestamptz not null default now(),
  foreign key (team_id, season_id) references public.teams (id, season_id) on delete cascade,
  -- A bowler holds at most one roster spot per season.
  unique (season_id, profile_id)
);

create index team_members_team_id_idx on public.team_members (team_id);
create index team_members_profile_id_idx on public.team_members (profile_id);

-- ------------------------------------------------------------------- weeks --
create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  week_number smallint not null check (week_number > 0),
  bowl_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (season_id, week_number),
  unique (id, season_id)
);

create index weeks_season_date_idx on public.weeks (season_id, bowl_date);

-- ----------------------------------------------------------------- matches --
-- away_team_id is null for a bye.
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  week_id uuid not null,
  home_team_id uuid not null,
  away_team_id uuid,
  lanes text,
  home_points numeric(5, 1) not null default 0,
  away_points numeric(5, 1) not null default 0,
  status public.match_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (week_id, season_id) references public.weeks (id, season_id) on delete cascade,
  foreign key (home_team_id, season_id) references public.teams (id, season_id) on delete cascade,
  foreign key (away_team_id, season_id) references public.teams (id, season_id) on delete cascade,
  check (away_team_id is null or home_team_id <> away_team_id)
);

create index matches_week_id_idx on public.matches (week_id);
create index matches_home_team_idx on public.matches (home_team_id);
create index matches_away_team_idx on public.matches (away_team_id);

-- ---------------------------------------------------------------- payments --
-- Weekly dues. Rows are written by the server (service role) during the Stripe
-- checkout flow and updated by the webhook; bowlers only ever read their own.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  week_id uuid references public.weeks (id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  status public.payment_status not null default 'pending',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_profile_season_idx on public.payments (profile_id, season_id);
create index payments_week_idx on public.payments (week_id);

-- Never double-charge a bowler for the same week.
create unique index payments_one_settled_per_week
  on public.payments (profile_id, week_id)
  where week_id is not null and status in ('pending', 'paid');

-- =========================================================== helpers ========

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger leagues_set_updated_at before update on public.leagues
  for each row execute function public.set_updated_at();
create trigger seasons_set_updated_at before update on public.seasons
  for each row execute function public.set_updated_at();
create trigger teams_set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();
create trigger matches_set_updated_at before update on public.matches
  for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Give every new auth user a profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only an admin may change someone's role — including their own.
--
-- The check is skipped when there is no JWT, i.e. a direct connection: Studio,
-- psql, or the service role. Those bypass row level security anyway, and the
-- first admin has to be promoted from one of them — with no admin yet,
-- `is_admin()` is false for everybody and the role would be unreachable.
-- Anonymous PostgREST requests stay blocked either way: every write policy on
-- `profiles` is `to authenticated`.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
    and auth.uid() is not null
    and not public.is_admin() then
    raise exception 'only admins may change a member role';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- Is the current user the captain of this team?
create or replace function public.is_captain_of(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teams
    where id = p_team_id and captain_id = auth.uid()
  );
$$;

-- =============================================================== RLS ========

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.seasons enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.weeks enable row level security;
alter table public.matches enable row level security;
alter table public.payments enable row level security;

-- profiles: the roster is visible to signed-in members only (it holds contact
-- details); everyone edits their own row, admins edit any.
create policy "profiles are readable by members"
  on public.profiles for select to authenticated using (true);

create policy "members update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "admins manage profiles"
  on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- League structure is public: schedule, teams and rosters show on the site
-- without an account. Writes are admin-only.
create policy "leagues are public" on public.leagues for select using (true);
create policy "admins manage leagues" on public.leagues for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "seasons are public" on public.seasons for select using (true);
create policy "admins manage seasons" on public.seasons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "teams are public" on public.teams for select using (true);
create policy "admins manage teams" on public.teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "captains update their team" on public.teams for update to authenticated
  using (captain_id = (select auth.uid()))
  with check (captain_id = (select auth.uid()));

create policy "rosters are public" on public.team_members for select using (true);
create policy "admins manage rosters" on public.team_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "captains manage their roster" on public.team_members for all to authenticated
  using (public.is_captain_of(team_id))
  with check (public.is_captain_of(team_id));

create policy "weeks are public" on public.weeks for select using (true);
create policy "admins manage weeks" on public.weeks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "matches are public" on public.matches for select using (true);
create policy "admins manage matches" on public.matches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- payments: you see your own, admins see all. Inserts and updates come from the
-- server with the service role key, which bypasses RLS.
create policy "members read their own payments"
  on public.payments for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "admins manage payments"
  on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
