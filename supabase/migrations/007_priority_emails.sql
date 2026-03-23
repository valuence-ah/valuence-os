-- Add priority to companies (High / Medium / Low)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('High', 'Medium', 'Low'));

-- Add emails array to contacts for multiple email support
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS emails TEXT[];
