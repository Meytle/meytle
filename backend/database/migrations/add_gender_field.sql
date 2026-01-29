-- Add gender field to companion_applications table
ALTER TABLE companion_applications 
ADD COLUMN gender ENUM('male', 'female', 'other', 'prefer_not_to_say') 
AFTER date_of_birth;

-- Add gender field to client_verifications table  
ALTER TABLE client_verifications 
ADD COLUMN gender ENUM('male', 'female', 'other', 'prefer_not_to_say') 
AFTER date_of_birth;

-- Add index for better query performance when filtering by gender
CREATE INDEX idx_companion_gender ON companion_applications(gender);
CREATE INDEX idx_client_gender ON client_verifications(gender);


