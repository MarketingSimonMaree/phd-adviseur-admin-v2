/*
  # Add session status tracking fields

  1. Changes
    - Add `heygen_status` column to track external service status
    - Add `last_sync_at` timestamp to track last synchronization
    - Add index on `status` for better query performance
    - Update status enum to match all possible states
    - Add constraint to ensure valid status values

  2. Security
    - Maintain existing RLS policies
*/

-- Add new columns for better status tracking
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS heygen_status text,
ADD COLUMN IF NOT EXISTS last_sync_at timestamptz DEFAULT now();

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Update status constraint to include all possible states
ALTER TABLE sessions 
DROP CONSTRAINT IF EXISTS sessions_status_check;

ALTER TABLE sessions 
ADD CONSTRAINT sessions_status_check 
CHECK (status = ANY (ARRAY['active'::text, 'connecting'::text, 'connected'::text, 'completed'::text, 'error'::text]));

-- Add constraint for heygen_status
ALTER TABLE sessions 
ADD CONSTRAINT sessions_heygen_status_check 
CHECK (heygen_status = ANY (ARRAY['active'::text, 'connecting'::text, 'connected'::text, 'completed'::text, 'error'::text, NULL::text]));