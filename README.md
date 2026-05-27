# Viboard

An infinite-canvas moodboard for collecting ideas, references, and embeds in one place. Pan and zoom freely, mix sticky notes with rich media blocks, draw on the canvas, and optionally sync boards to Supabase when you sign in.

Built with **React 19**, **Vite**, **Tailwind CSS**, **Zustand**, and **Supabase**.

## Features

- **Infinite canvas** — pan, zoom, multi-select, align, distribute, group, and tidy blocks
- **Rich block types** — stickies, text, images, links, shapes, frames, drawings, audio, PDFs, and embeds (YouTube, X, Instagram, Figma, GitHub, Substack, and more)
- **Works offline-first** — use the board without auth; local autosave and `.viboard.json` import/export
- **Cloud boards** — sign in (OAuth via Supabase) to create, rename, and sync moodboards from the dashboard
- **Search** — fuzzy search across block content on the board
- **Export** — export the board or selection as PNG (keyboard shortcuts in-app)

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ (recommended)
- npm (ships with Node)

Supabase is **optional**. Without credentials, the app runs with a no-op client so you can still edit boards locally.

## Quick start

```bash
git clone https://github.com/suryanewa/viboard.git
cd viboard
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`). Visit `/` for an anonymous board, or sign in when Supabase is configured.

## Environment variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key
```

These match the client setup in `src/lib/supabase.ts`. Do not commit secrets; keep `.env` out of version control.

### Portfolio / Atlas embed

For a read-only demo board embedded under a subpath (e.g. on a portfolio site):

```env
VITE_PORTFOLIO_ATLAS=1
```

This loads `PortfolioApp` instead of the full app, sets Vite `base` to `/atlas/viboard/`, and fetches the bundled Atlas snapshot.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server with HMR        |
| `npm run build`   | Typecheck and production build       |
| `npm run preview` | Serve the production build locally   |
| `npm run lint`    | Run ESLint                           |

## Supabase (optional backend)

SQL migrations live in `supabase/migrations/`. They define `public.moodboards` (metadata + snapshot references), RLS policies scoped to `auth.uid()`, and storage for large compressed board snapshots.

Typical workflow with the [Supabase CLI](https://supabase.com/docs/guides/cli):

1. Link your project and apply migrations, or run the SQL in the Supabase SQL editor.
2. Enable the auth provider(s) you want (e.g. Google, GitHub).
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`.

## Project layout

```
src/
  App.tsx           # Auth, routing (login, dashboard, board)
  PortfolioApp.tsx  # Embedded read-only Atlas board
  pages/            # Login, Dashboard, Board
  components/       # Canvas, blocks, toolbar, menus
  store.ts          # Board state (Zustand)
  lib/              # Supabase, save/load, search, commands
public/
  tutorial-board.viboard.json   # Sample board
supabase/migrations/            # Postgres schema and RLS
```

## Deployment

The repo includes a `vercel.json` SPA rewrite so client-side routes work on Vercel. Build with `npm run build` and deploy the `dist` output, or connect the GitHub repo to Vercel for automatic deploys.

## License

No license file is included yet. All rights reserved unless otherwise noted by the repository owner.
