/*
  # Widget Preferences Storage

  1. New Tables
    - `widget_preferences`
      - `id` (uuid, primary key) - Unique identifier for the preference
      - `widget_type` (text, not null) - Type of widget (e.g., 'photo', 'calendar', 'weather')
      - `preference_key` (text, not null) - Key for the preference (e.g., 'photosPerView', 'transitionType')
      - `preference_value` (text, not null) - JSON-stringified value of the preference
      - `created_at` (timestamptz) - When the preference was created
      - `updated_at` (timestamptz) - When the preference was last updated
      - Unique constraint on (widget_type, preference_key) to ensure one value per preference

  2. Security
    - Enable RLS on `widget_preferences` table
    - Add policy for anyone to read preferences (public read)
    - Add policy for anyone to insert/update preferences (public write)
    
  Note: This is a single-user home dashboard, so we're using permissive policies.
  For multi-user scenarios, you would add user authentication.
*/

-- Create widget preferences table
CREATE TABLE IF NOT EXISTS widget_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_type text NOT NULL,
  preference_key text NOT NULL,
  preference_value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(widget_type, preference_key)
);

-- Enable RLS
ALTER TABLE widget_preferences ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read preferences (single-user dashboard)
CREATE POLICY "Anyone can read widget preferences"
  ON widget_preferences
  FOR SELECT
  USING (true);

-- Allow anyone to insert preferences
CREATE POLICY "Anyone can insert widget preferences"
  ON widget_preferences
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update preferences
CREATE POLICY "Anyone can update widget preferences"
  ON widget_preferences
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_widget_preferences_updated_at
  BEFORE UPDATE ON widget_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();