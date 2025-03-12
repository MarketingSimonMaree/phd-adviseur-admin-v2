/*
  # Add session management fields

  1. Changes
    - Add `is_relevant` boolean field to mark important sessions
    - Add `is_archived` boolean field for archiving sessions
    - Add `deleted_at` timestamp for soft deletion
    - Add indexes for new fields for better query performance

  2. Security
    - Update RLS policies to handle new fields
*/

-- Add new columns to sessions table
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS is_relevant boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT null;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sessions_is_relevant ON sessions(is_relevant);
CREATE INDEX IF NOT EXISTS idx_sessions_is_archived ON sessions(is_archived);
CREATE INDEX IF NOT EXISTS idx_sessions_deleted_at ON sessions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time_btree ON sessions(start_time);

-- Update RLS policies
CREATE POLICY "Users can update session flags" 
ON sessions
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);