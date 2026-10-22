# Moving the NGG apps into one Supabase project

One-off runbook. It moves the four NGG apps — boards, quiz, simulations and the
leadership auction — out of their separate Supabase projects and into the shared
project `xyuqeivoplqjfnnfnagh`. Each app gets a schema of its own there
(`board`, `quiz`, `sim` + `sim_private`, `auction`). The quiz and simulation data
come along with their accounts and the quiz's Storage files. The boards and the
auction start fresh: the auction from its seed, and the boards with a profile for
every @nggconsult.com account.

`migrate.mjs` performs every database and configuration step through the Supabase
Management API. It reads the SQL from the four repositories, so all four must be
checked out on the branch that carries the shared-project migrations
(`ccr-41983ca1-w8aefj`) under `$REPOS` (default `/home/user`).

## Before you start

- **Access token.** A Supabase personal access token
  (supabase.com/dashboard/account/tokens) reaches every project in the account.
  Create one only for this run, give it the shortest expiry offered, store it in
  the session's environment settings (never in a chat or a file), and revoke it
  as soon as the run is over.
- **A quiet window.** Data is copied at the moment `data` runs. Quiz games or
  simulation sessions recorded in the old projects after that, and before the
  apps are switched over, stay behind. `data` can be re-run: it adds rows it has
  not seen, but it does not update rows that changed in the meantime.
- **Nothing is deleted.** The old projects stay as they are and remain the
  fallback until the shared project has been verified in real use.

## Steps

```bash
cd ops/shared-supabase
export TARGET_REF=xyuqeivoplqjfnnfnagh QUIZ_REF=mptlhgsexhlsmrxcvdhp
node migrate.mjs projects        # names and refs of every project in the account
export SIM_REF=<the simulations project>   # identify it by name (or: projects --probe)
export BOARD_REF=ljrnmcpnbduuzjjnmdpw      # only read, for its Auth URLs; optional
```

| # | Step | What it does | Check |
|---|------|--------------|-------|
| 1 | `preflight` | Read-only. The target must be empty: no users, no app schemas. Lists the source row counts, accounts outside @nggconsult.com, Storage objects, and every Supabase URL stored in the data. | Target `users: 0`, `app_schemas: []`. |
| 2 | `users` | Copies the quiz and simulation accounts, passwords included, before any schema exists, so no signup trigger runs. One person registered in both apps becomes one account: the one used most recently keeps its id and password. Anonymous sign-ins are not copied. | `imported` = distinct e-mails; note `merged_duplicates`. |
| 3 | `schema` | Runs every app's SQL, in the order the apps depend on: simulations, quiz, boards, auction + seed. Each file is one transaction; a file that fails rolls back on its own and the step can be re-run. | `37 files applied`. |
| 4 | `data` | Copies the quiz and simulation rows, mapping owners onto the merged accounts and quiz Storage URLs onto the new buckets. The quiz's scoring triggers are paused during the copy, so recorded points are neither re-scored nor added twice. | Every table: `source` = `target`. |
| 5 | `storage` | Copies the quiz's `logos` / `media` files into `quiz-logos` / `quiz-media`. | Object counts match. |
| 6 | `postgrest` | Adds `auction,board,quiz,sim` to the Data API's exposed schemas. | — |
| 7 | `auth` | Prints the merged Auth plan, then writes it with `auth --apply`: every app's URLs in the redirect allow-list, e-mail confirmation on, anonymous sign-ins off, and customised e-mail texts copied over. Custom SMTP cannot be copied; it is reported. | Read the plan before `--apply`. |
| 8 | `functions` | Deploys the simulations' Edge Functions (JWT verification off, as before) and lists the secrets still missing. | — |
| 9 | `keys` | Prints the target's public (anon / publishable) keys for the apps' settings. Secret keys are never printed. | `legacy JWT keys enabled: true` — the Edge Functions rely on the injected legacy keys; if false, re-enable them (Project Settings → API Keys). |
| 10 | `verify` | Calls the Data API as an anonymous browser would: each app reads what it should, and nothing it should not. | Every line `PASS`. |

Progress is kept in `state.json` (git-ignored; it holds account ids, nothing
secret). Every step can be run again and skips what it has already done.

## By hand, after the run

1. **Edge Function secrets** (Dashboard → Edge Functions → Secrets):
   `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_VOICE_MALE`,
   `ELEVENLABS_VOICE_FEMALE`, `ELEVENLABS_WEBHOOK_SECRET`.
2. **ElevenLabs** post-call webhook →
   `https://xyuqeivoplqjfnnfnagh.supabase.co/functions/v1/elevenlabs-postcall`.
3. **App settings** — new URL and keys. The service key is copied from the
   dashboard (Project Settings → API Keys):

   | App | Where | Variables |
   |-----|-------|-----------|
   | Auction | Vercel | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
   | Boards | Vercel | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (+ `SUPABASE_SERVICE_ROLE_KEY` only with `ORG_SHARED_PASSWORD`, which is not recommended — see DEPLOY.md) |
   | Quiz | GitHub → Settings → Secrets → Actions | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
   | Simulations | Vercel | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |

4. **Merge** each repository's shared-project branch. The merge deploys code
   that reads the new schemas; with the settings above already in place, each
   app switches over in a single deploy.
5. **Revoke** the access token and remove it from the environment.

To roll back an app, restore its old settings and revert the merge. The old
projects were never modified.

## Rehearsal

`MODE=local` runs the same SQL against local Postgres databases
(`LOCAL_DB_<ref>=<database>`, after `npm install`) that stand in for the projects.
The HTTP-only steps (storage, postgrest, auth, functions, keys, verify) need the
real API.
