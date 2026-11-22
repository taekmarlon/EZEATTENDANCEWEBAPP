# EZ Center Portal — Web App

Standalone web & installable Progressive Web App (PWA) for **EZ Center Portal**, backed by **Supabase** (PostgreSQL + Row Level Security + Storage + Edge Functions) with **Teacher**, **Director**, and **Admin** role portals.

## Features
- **3-Role Access Portals**:
  - **Teacher**: Restricted via Supabase RLS to two or more assigned schools and exact assigned specializations; manages roster, attendance, rubrics, grading, and CSV export.
  - **Director**: Cross-school access and interactive analytics reports & queries.
  - **Admin**: User/role provisioning, multi-school/multi-specialization assignments, grading scale & threshold customization, custom student fields, JSON import/export, and audit logs.
- **Installable PWA**: Works across desktop browsers, Android Chrome ("Install app"), and iOS/macOS Safari ("Add to Home Screen" or `.mobileconfig`).
- **Vercel Ready**: Pre-configured `vercel.json` with SPA rewrites and Service Worker cache headers.

## Quick Start (Local)
```bash
npm install
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY inside .env.local
npm run dev
```

## Scripts
- `npm run dev` — Start Vite dev server on port `3000`
- `npm run lint` — Run TypeScript typechecking (`tsc --noEmit`)
- `npm test` — Run Vitest suite
- `npm run build` — Build production bundle + PWA service worker into `dist/`

## Documentation
- [Vercel Deployment & New GitHub Repo Guide](docs/VERCEL_DEPLOY.md)
- [Supabase Setup & Migrations](docs/SUPABASE_SETUP.md)
