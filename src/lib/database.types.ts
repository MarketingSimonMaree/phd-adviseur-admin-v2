export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string
          session_id: string
          start_time: string
          end_time: string | null
          status: 'active' | 'connecting' | 'connected' | 'completed' | 'error'
          heygen_status: string | null
          last_sync_at: string | null
          created_at: string
          updated_at: string
          is_relevant: boolean
          is_archived: boolean
          deleted_at: string | null
        }
        Insert: {
          id?: string
          session_id: string
          start_time?: string
          end_time?: string | null
          status?: 'active' | 'connecting' | 'connected' | 'completed' | 'error'
          heygen_status?: string | null
          last_sync_at?: string | null
          created_at?: string
          updated_at?: string
          is_relevant?: boolean
          is_archived?: boolean
          deleted_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          start_time?: string
          end_time?: string | null
          status?: 'active' | 'connecting' | 'connected' | 'completed' | 'error'
          heygen_status?: string | null
          last_sync_at?: string | null
          created_at?: string
          updated_at?: string
          is_relevant?: boolean
          is_archived?: boolean
          deleted_at?: string | null
        }
      }
      messages: {
        Row: {
          id: string
          session_id: string
          sender: 'user' | 'avatar'
          message: string
          timestamp: string
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          sender: 'user' | 'avatar'
          message: string
          timestamp?: string
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          sender?: 'user' | 'avatar'
          message?: string
          timestamp?: string
          created_at?: string
        }
      }
    }
    Enums: {
      session_status: 'active' | 'connecting' | 'connected' | 'completed' | 'error'
      message_sender: 'user' | 'avatar'
    }
  }
}

// HeyGen API Types
export interface HeyGenSession {
  session_id: string
  status: string
  created_at: number
}

export interface HeyGenResponse {
  sessions: HeyGenSession[]
}