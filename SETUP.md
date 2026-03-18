# Valuence OS — Setup Guide

Complete step-by-step instructions to get the system running locally.

---

## STEP 1 — Install Node.js

1. Go to: https://nodejs.org
2. Download and install the **LTS** version (e.g. 20.x)
3. Verify it worked: open a new terminal and run `node --version`
   You should see something like `v20.x.x`

---

## STEP 2 — Install dependencies

Open a terminal in this folder (`C:\Users\sh225\Valuence OS`) and run:

```
npm install
```

This downloads ~200MB of packages into the `node_modules/` folder. Takes 1-3 minutes.

---

## STEP 3 — Set up Supabase

### 3a. Create a Supabase project
1. Go to: https://supabase.com
2. Sign up / log in
3. Click **New project**
4. Name it: `valuence-os`
5. Choose a region (pick one near you)
6. Set a strong database password (save it somewhere)
7. Wait ~2 minutes for it to spin up

### 3b. Run the database schema
1. In Supabase, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file: `supabase/migrations/001_initial_schema.sql` from this folder
4. Copy its entire contents and paste into the SQL editor
5. Click **Run** (green button)
6. You should see: "Success. No rows returned"

### 3c. Get your API keys
1. In Supabase, go to **Project Settings → API**
2. Copy:
   - **Project URL** (looks like: `https://abcdefgh.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)
   - **service_role** key (keep this secret — has full access)

### 3d. Configure Supabase Auth
1. Go to **Authentication → URL Configuration**
2. Set **Site URL** to: `http://localhost:3000`
3. Add to **Redirect URLs**: `http://localhost:3000/auth/callback`

---

## STEP 4 — Get your Anthropic API key

1. Go to: https://console.anthropic.com
2. Sign in / create account
3. Go to **API Keys**
4. Click **Create Key**
5. Copy the key (starts with `sk-ant-...`)

---

## STEP 5 — Set up environment variables

1. Copy `.env.local.example` to `.env.local`:
   ```
   copy .env.local.example .env.local
   ```
2. Open `.env.local` in any text editor and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ANTHROPIC_API_KEY=sk-ant-...
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

---

## STEP 6 — Run the app

```
npm run dev
```

Open your browser at: **http://localhost:3000**

You should see the Valuence OS login page.

---

## STEP 7 — Create your account

1. On the login page, enter your email
2. Click **Send Magic Link**
3. Check your email and click the link
4. You'll be redirected to the dashboard

---

## STEP 8 — Import Airtable data (optional)

### 8a. Place your CSV files
Copy your Airtable exports to: `C:\Users\sh225\Valuence OS\Airtable\`

Expected filenames:
- `companies.csv` (or `organizations.csv`)
- `contacts.csv` (or `people.csv`)
- `interactions.csv` (or `meetings.csv`)

### 8b. Preview what will be imported (dry run)
```
DRY_RUN=true npx tsx scripts/migrate-airtable.ts
```
This shows what would be inserted without actually touching the database.

### 8c. Run the actual migration
```
npx tsx scripts/migrate-airtable.ts
```

The script will print a summary of what was imported, skipped, and any errors.

---

## Available URLs

| URL | What it is |
|-----|-----------|
| http://localhost:3000 | Auto-redirects to login or dashboard |
| http://localhost:3000/dashboard | Fund overview |
| http://localhost:3000/crm | CRM hub |
| http://localhost:3000/crm/companies | All companies |
| http://localhost:3000/crm/contacts | All contacts |
| http://localhost:3000/pipeline | Deal pipeline (kanban) |
| http://localhost:3000/sourcing | Sourcing intelligence |
| http://localhost:3000/portfolio | Portfolio monitoring |
| http://localhost:3000/memos | IC memos |
| http://localhost:3000/lp | LP tracker + fundraising |
| http://localhost:3000/chat | AI chat (ask Claude anything) |

---

## Deploying to Vercel (production)

1. Push this folder to a GitHub repo
2. Go to https://vercel.com and import the repo
3. In the Vercel project settings, add all environment variables from `.env.local`
4. Also add: `NEXT_PUBLIC_APP_URL=https://your-vercel-url.vercel.app`
5. In Supabase Auth → URL Configuration, add your Vercel URL to Redirect URLs

---

## Troubleshooting

**"Module not found" errors** → Run `npm install` again

**"Invalid API key"** → Check `.env.local` — no quotes, no spaces around `=`

**Login link doesn't work** → Check Supabase Auth settings — Site URL must match where you're accessing the app

**Chat returns errors** → Check your `ANTHROPIC_API_KEY` in `.env.local`

**Migration script fails** → Make sure `SUPABASE_SERVICE_ROLE_KEY` is set (not the anon key)
