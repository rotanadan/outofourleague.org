/**
 * Database types for the Supabase schema in `supabase/migrations`.
 *
 * Regenerate after a migration:
 *   npx supabase gen types typescript --local > app/types/database.types.ts
 * or, against the hosted project:
 *   npx supabase gen types typescript --project-id <ref> > app/types/database.types.ts
 */

export type MemberRole = 'admin' | 'member'
export type TeamRole = 'captain' | 'bowler' | 'sub'
export type MatchStatus = 'scheduled' | 'completed' | 'cancelled'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          phone: string | null
          avatar_url: string | null
          role: MemberRole
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          role?: MemberRole
        }
        Update: {
          email?: string | null
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          role?: MemberRole
        }
        Relationships: []
      }
      leagues: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          venue: string | null
          day_of_week: number | null
          start_time: string | null
          match_fee_cents: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          venue?: string | null
          day_of_week?: number | null
          start_time?: string | null
          match_fee_cents?: number
          is_active?: boolean
        }
        Update: Partial<Database['public']['Tables']['leagues']['Insert']>
        Relationships: []
      }
      seasons: {
        Row: {
          id: string
          league_id: string
          name: string
          starts_on: string
          ends_on: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          league_id: string
          name: string
          starts_on: string
          ends_on?: string | null
          is_active?: boolean
        }
        Update: Partial<Database['public']['Tables']['seasons']['Insert']>
        Relationships: [{
          foreignKeyName: 'seasons_league_id_fkey'
          columns: ['league_id']
          isOneToOne: false
          referencedRelation: 'leagues'
          referencedColumns: ['id']
        }]
      }
      teams: {
        Row: {
          id: string
          season_id: string
          name: string
          captain_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          season_id: string
          name: string
          captain_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['teams']['Insert']>
        Relationships: [{
          foreignKeyName: 'teams_season_id_fkey'
          columns: ['season_id']
          isOneToOne: false
          referencedRelation: 'seasons'
          referencedColumns: ['id']
        }, {
          foreignKeyName: 'teams_captain_id_fkey'
          columns: ['captain_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        }]
      }
      team_members: {
        Row: {
          id: string
          team_id: string
          season_id: string
          profile_id: string
          role: TeamRole
          joined_at: string
        }
        Insert: {
          id?: string
          team_id: string
          season_id: string
          profile_id: string
          role?: TeamRole
        }
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>
        Relationships: [{
          foreignKeyName: 'team_members_team_id_season_id_fkey'
          columns: ['team_id', 'season_id']
          isOneToOne: false
          referencedRelation: 'teams'
          referencedColumns: ['id', 'season_id']
        }, {
          foreignKeyName: 'team_members_season_id_fkey'
          columns: ['season_id']
          isOneToOne: false
          referencedRelation: 'seasons'
          referencedColumns: ['id']
        }, {
          foreignKeyName: 'team_members_profile_id_fkey'
          columns: ['profile_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        }]
      }
      weeks: {
        Row: {
          id: string
          season_id: string
          week_number: number
          bowl_date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          season_id: string
          week_number: number
          bowl_date: string
          notes?: string | null
        }
        Update: Partial<Database['public']['Tables']['weeks']['Insert']>
        Relationships: [{
          foreignKeyName: 'weeks_season_id_fkey'
          columns: ['season_id']
          isOneToOne: false
          referencedRelation: 'seasons'
          referencedColumns: ['id']
        }]
      }
      matches: {
        Row: {
          id: string
          season_id: string
          week_id: string
          home_team_id: string
          away_team_id: string | null
          lanes: string | null
          home_points: number
          away_points: number
          status: MatchStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          season_id: string
          week_id: string
          home_team_id: string
          away_team_id?: string | null
          lanes?: string | null
          home_points?: number
          away_points?: number
          status?: MatchStatus
        }
        Update: Partial<Database['public']['Tables']['matches']['Insert']>
        Relationships: [{
          foreignKeyName: 'matches_week_id_season_id_fkey'
          columns: ['week_id', 'season_id']
          isOneToOne: false
          referencedRelation: 'weeks'
          referencedColumns: ['id', 'season_id']
        }, {
          foreignKeyName: 'matches_home_team_id_season_id_fkey'
          columns: ['home_team_id', 'season_id']
          isOneToOne: false
          referencedRelation: 'teams'
          referencedColumns: ['id', 'season_id']
        }, {
          foreignKeyName: 'matches_away_team_id_season_id_fkey'
          columns: ['away_team_id', 'season_id']
          isOneToOne: false
          referencedRelation: 'teams'
          referencedColumns: ['id', 'season_id']
        }, {
          foreignKeyName: 'matches_season_id_fkey'
          columns: ['season_id']
          isOneToOne: false
          referencedRelation: 'seasons'
          referencedColumns: ['id']
        }]
      }
      payments: {
        Row: {
          id: string
          profile_id: string
          season_id: string
          team_id: string
          match_id: string
          amount_cents: number
          currency: string
          status: PaymentStatus
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          paid_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          season_id: string
          team_id: string
          match_id: string
          amount_cents: number
          currency?: string
          status?: PaymentStatus
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          paid_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
        Relationships: [{
          foreignKeyName: 'payments_profile_id_fkey'
          columns: ['profile_id']
          isOneToOne: false
          referencedRelation: 'profiles'
          referencedColumns: ['id']
        }, {
          foreignKeyName: 'payments_season_id_fkey'
          columns: ['season_id']
          isOneToOne: false
          referencedRelation: 'seasons'
          referencedColumns: ['id']
        }, {
          foreignKeyName: 'payments_team_fkey'
          columns: ['team_id', 'season_id']
          isOneToOne: false
          referencedRelation: 'teams'
          referencedColumns: ['id', 'season_id']
        }, {
          foreignKeyName: 'payments_match_fkey'
          columns: ['match_id', 'season_id']
          isOneToOne: false
          referencedRelation: 'matches'
          referencedColumns: ['id', 'season_id']
        }]
      }
    }
    Views: {
      team_standings: {
        Row: {
          team_id: string
          season_id: string
          team_name: string
          matches_played: number
          points_won: number
          points_lost: number
        }
        Relationships: []
      }
      team_match_dues: {
        Row: {
          match_id: string
          season_id: string
          week_id: string
          week_number: number
          bowl_date: string
          team_id: string
          team_name: string
          opponent_team_id: string
          opponent_name: string
          fee_cents: number
          paid_cents: number
          pending_cents: number
          remaining_cents: number
        }
        Relationships: []
      }
    }
    Functions: {
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_captain_of: {
        Args: { p_team_id: string }
        Returns: boolean
      }
      reserve_team_payment: {
        Args: { p_profile_id: string, p_match_id: string, p_amount_cents: number }
        Returns: Database['public']['Tables']['payments']['Row']
      }
    }
    Enums: {
      member_role: MemberRole
      team_role: TeamRole
      match_status: MatchStatus
      payment_status: PaymentStatus
    }
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']>
  = Database['public']['Tables'][T]['Row']

export type Profile = Tables<'profiles'>
export type League = Tables<'leagues'>
export type Season = Tables<'seasons'>
export type Team = Tables<'teams'>
export type TeamMember = Tables<'team_members'>
export type Week = Tables<'weeks'>
export type Match = Tables<'matches'>
export type Payment = Tables<'payments'>
export type TeamStanding = Database['public']['Views']['team_standings']['Row']
export type TeamMatchDue = Database['public']['Views']['team_match_dues']['Row']
