/*
  # Add trash functionality for sessions

  1. Changes
    - Add `deleted_at` column to track when items are moved to trash
    - Add function to automatically hard delete sessions after 30 days in trash
    - Add trigger to handle automatic deletion

  2. Security
    - Enable RLS on sessions table (if not already enabled)
    - Add policies for trash management
*/

-- Add deleted_at column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sessions' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE sessions ADD COLUMN deleted_at timestamptz DEFAULT NULL;
    CREATE INDEX idx_sessions_deleted_at ON sessions(deleted_at);
  END IF;
END $$;

-- Function to clean up old deleted sessions (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_deleted_sessions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Hard delete sessions that have been in trash for more than 30 days
  DELETE FROM sessions 
  WHERE deleted_at IS NOT NULL 
    AND deleted_at < NOW() - INTERVAL '30 days';
  RETURN NULL;
END;
$$;

-- Create trigger to run cleanup periodically
DROP TRIGGER IF EXISTS trigger_cleanup_deleted_sessions ON sessions;
CREATE TRIGGER trigger_cleanup_deleted_sessions
  AFTER INSERT OR UPDATE
  ON sessions
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_deleted_sessions();

-- Update RLS policies
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policy for viewing sessions (including trashed ones)
CREATE POLICY "Users can view all sessions including trashed"
  ON sessions
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy for updating sessions
CREATE POLICY "Users can update sessions"
  ON sessions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);