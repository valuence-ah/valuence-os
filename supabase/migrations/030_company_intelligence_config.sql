-- ── Company Intelligence AI Config ──────────────────────────────────────────
-- Seeds the ai_configs row for the Company Intelligence panel.
-- The prompt is editable in Admin → AI Config → Company Intelligence.

INSERT INTO ai_configs (name, label, model, max_tokens, temperature, system_prompt, user_prompt)
VALUES (
  'company_intelligence',
  'Company Intelligence',
  'claude-sonnet-4-6',
  1024,
  0.20,
  'You are a VC intelligence analyst. Return only valid JSON arrays as instructed.',
  ''
)
ON CONFLICT (name) DO NOTHING;
