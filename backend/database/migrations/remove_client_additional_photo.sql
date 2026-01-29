-- Remove additional_photo column from users table (only used by clients)
-- This simplifies client profile completion from requiring 2 photos to just 1 (profile picture)
ALTER TABLE users DROP COLUMN IF EXISTS additional_photo;

