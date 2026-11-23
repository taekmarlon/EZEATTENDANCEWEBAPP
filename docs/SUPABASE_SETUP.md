# EZ Center Web Portal — Supabase Setup Guide

## 1. Create or Connect Your Supabase Project
1. Sign in at [supabase.com](https://supabase.com) and open your project.
2. Copy **Project URL** (`VITE_SUPABASE_URL`) and **Anon / Public Key** (`VITE_SUPABASE_ANON_KEY`) from **Project Settings → API**.
3. For local development, create `.env.local`:
   ```env
   VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
   VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
   ```
4. For production on **Vercel**, add those exact same two variables under **Project Settings → Environment Variables**.

## 2. Apply Database Migrations
Run the six migration files in order in the **Supabase SQL Editor** (or via `supabase db push`):
1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_seed_defaults.sql`
4. `supabase/migrations/004_profile_recovery.sql`
5. `supabase/migrations/005_upgrade_rbac_and_coteaching.sql`
6. `supabase/migrations/006_auto_seed_default_specializations.sql`

> **RBAC, Co-Teaching & Security:** `005_upgrade_rbac_and_coteaching.sql` adds granular `director_permissions` enforcement in RLS, allows Directors (when enabled) to assign Teachers to specializations, enforces a max of **2 co-teachers per specialization**, and enables co-teacher listing.
> **Default Specializations Seed & Trigger:** `006_auto_seed_default_specializations.sql` backfills the 17 standard specializations across all existing schools and installs a trigger to auto-create them for every future school.

## 3. Deploy the `admin-users` Edge Function & Auth Settings
1. Open **Authentication → Providers → Email** and turn **OFF** **Confirm email** so all users can log in immediately on first login.
2. Deploy `supabase/functions/admin-users/index.ts` (enables Admin **Create User** with `email_confirm: true`, **Reset User Password**, and **Delete User**):
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy admin-users
   ```
   *(Or deploy it via **Supabase Dashboard → Edge Functions → Via Editor** named `admin-users`.)*
3. Under **Authentication → URL Configuration**, set **Site URL** to `https://YOUR_VERCEL_DOMAIN.vercel.app` and add `https://YOUR_VERCEL_DOMAIN.vercel.app/**` to **Redirect URLs**.
