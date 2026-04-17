-- ── Outlook / Microsoft Graph agent config ───────────────────────────────────
-- Run this in the Supabase SQL editor.
-- Adds the outlook agent_config row so the check-inbox cron reads live params.

INSERT INTO agent_configs (agent_name, label, config) VALUES
(
  'outlook',
  'Outlook / Microsoft Graph',
  '{
    "mailboxes":           ["andrew@valuence.vc"],
    "lookbackHours":       25,
    "maxPerMailbox":       50,
    "autoCreateCompanies": true,
    "additionalSkipPatterns": [],
    "schedule":            "0 7 * * *"
  }'
)
ON CONFLICT (agent_name) DO NOTHING;
