/*
  # Initial Schema for Avatar Chat Monitoring

  1. New Tables
    - `sessions`
      - `id` (uuid, primary key)
      - `session_id` (text, unique identifier)
      - `start_time` (timestamp)
      - `end_time` (timestamp)
      - `duration` (interval, computed)
      - `status` (text)
    
    - `messages`
      - `id` (uuid, primary key)
      - `session_id` (text, foreign key)
      - `sender` (text)
      - `message` (text)
      - `timestamp` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id text UNIQUE NOT NULL,
    start_time timestamptz DEFAULT now(),
    end_time timestamptz,
    duration interval GENERATED ALWAYS AS (end_time - start_time) STORED,
    status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'error')),
    created_at timestamptz DEFAULT now()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id text REFERENCES sessions(session_id),
    sender text NOT NULL CHECK (sender IN ('user', 'avatar')),
    message text NOT NULL,
    timestamp timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policies for sessions
CREATE POLICY "Allow authenticated users to read sessions"
    ON sessions
    FOR SELECT
    TO authenticated
    USING (true);

-- Policies for messages
CREATE POLICY "Allow authenticated users to read messages"
    ON messages
    FOR SELECT
    TO authenticated
    USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);