// NGG Supabase consolidation tool.
//
// Installs every app's schema in the shared project, carries the quiz and
// simulation data (with their auth users and the quiz's Storage files) over
// from the standalone projects, and configures the Data API.
//
//   node migrate.mjs <step>
//   steps: projects [--probe] | preflight | users | schema | data | storage |
//          postgrest | auth [--apply] | functions | keys | verify
//   (see README.md in this folder for the order and what each step checks)
//
// Env:
//   SUPABASE_ACCESS_TOKEN   personal access token; read here, never printed.
//                           Leave unset when the environment's network secrets
//                           inject it for api.supabase.com.
//   TARGET_REF QUIZ_REF SIM_REF [BOARD_REF]
//   REPOS                   folder holding the four checked-out repos
//                           (default /home/user); they must be on the branch
//                           that carries the shared-project migrations
//   MODE=local              rehearsal: run the same SQL against local databases
//                           named by LOCAL_DB_<ref> (needs `npm install`)
//
// Every write is idempotent (ON CONFLICT DO NOTHING, applied-file bookkeeping in
// state.json), so a step that stops halfway can simply be run again.

import fs from 'node:fs'
import path from 'node:path'

const REPOS = process.env.REPOS ?? '/home/user'
const STATE_FILE = new URL(process.env.STATE_FILE ?? './state.json', import.meta.url)
const MODE = process.env.MODE ?? 'remote'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const TARGET = need('TARGET_REF')
const QUIZ = process.env.QUIZ_REF
const SIM = process.env.SIM_REF
const BOARD = process.env.BOARD_REF
const ORG_EMAIL = /^[^@\s]+@nggconsult\.com$/i

function need(name) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {}
function save() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- transport ----------

async function api(method, p, body, { form } = {}) {
  if (MODE === 'local') throw new Error(`api ${method} ${p} is not available in local mode`)
  for (let attempt = 0; ; attempt++) {
    const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}
    let payload
    if (form) payload = form
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    const res = await fetch(`https://api.supabase.com${p}`, { method, headers, body: payload })
    const text = await res.text()
    if (res.ok) return text ? JSON.parse(text) : null
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(2000 * 2 ** attempt)
      continue
    }
    throw new Error(`${method} ${p} -> ${res.status}: ${text.slice(0, 1500)}`)
  }
}

async function sql(ref, query, parameters) {
  if (MODE === 'local') {
    const db = process.env[`LOCAL_DB_${ref}`]
    if (!db) throw new Error(`LOCAL_DB_${ref} is not set`)
    const { default: pg } = await import('pg')
    const client = new pg.Client({ host: '/var/lib/postgresql/nggtest', port: 54329, user: 'postgres', database: db })
    await client.connect()
    try {
      const res = parameters ? await client.query(query, parameters) : await client.query(query)
      const last = Array.isArray(res) ? res[res.length - 1] : res
      return last?.rows ?? []
    } finally {
      await client.end()
    }
  }
  return api('POST', `/v1/projects/${ref}/database/query`, parameters ? { query, parameters } : { query })
}

/** Runs a query whose single row has a `data` json column and returns it. */
async function data(ref, query, parameters) {
  const rows = await sql(ref, query, parameters)
  return rows?.[0]?.data ?? null
}

async function insertableColumns(ref, schema, table) {
  return data(
    ref,
    `select coalesce(json_agg(a.attname order by a.attnum), '[]') as data
       from pg_attribute a
      where a.attrelid = format('%I.%I', $1::text, $2::text)::regclass
        and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attidentity <> 'a'`,
    [schema, table],
  )
}

const qi = (name) => `"${name.replace(/"/g, '""')}"`

/** Inserts rows (objects) into schema.table through json_populate_recordset. */
async function insertRows(ref, schema, table, cols, rows, conflict = 'on conflict do nothing') {
  if (!rows.length) return
  const list = cols.map(qi).join(', ')
  await sql(
    ref,
    `insert into ${qi(schema)}.${qi(table)} (${list})
     select ${list} from json_populate_recordset(null::${qi(schema)}.${qi(table)}, $1::json)
     ${conflict}`,
    [JSON.stringify(rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null]))))],
  )
}

// ---------- steps ----------

async function stepProjects() {
  const projects = await api('GET', '/v1/projects')
  const probe = process.argv.includes('--probe')
  for (const p of projects) {
    let kind = ''
    if (probe) try {
      const rows = await sql(
        p.id,
        `select to_regclass('public.quizzes') is not null as quiz,
                to_regclass('public.simulations') is not null as sim,
                to_regclass('public.auction_rounds') is not null as auction,
                to_regclass('public.live_rooms') is not null as board,
                (select count(*) from auth.users)::int as users`,
      )
      const r = rows[0]
      kind = ['quiz', 'sim', 'auction', 'board'].filter((k) => r[k]).join('+') + ` users=${r.users}`
    } catch (e) {
      kind = `(not queryable: ${String(e.message).slice(0, 80)})`
    }
    console.log(`${p.id}  ${p.status.padEnd(16)} ${p.region.padEnd(14)} ${p.name}  -> ${kind}`)
  }
}

const QUIZ_TABLES = [
  { table: 'folders', users: ['owner_id'] },
  { table: 'quizzes', users: ['owner_id'] },
  { table: 'questions', users: [] },
  { table: 'game_sessions', users: ['host_id'] },
  { table: 'players', users: [] },
  { table: 'answers', users: [], page: 1000 },
]
const SIM_TABLES = [
  { table: 'profiles', users: ['id'] },
  { table: 'simulations', users: ['owner_id'], page: 50 },
  { table: 'simulation_share_links', users: ['owner_id'] },
  { table: 'participants', users: ['owner_id'] },
  { table: 'simulation_sessions', users: ['owner_id'], page: 10 },
  { table: 'simulation_reports', users: ['owner_id'], page: 20 },
]

async function count(ref, rel) {
  return (await sql(ref, `select count(*)::int as n from ${rel}`))[0].n
}

async function stepPreflight() {
  const t = (await sql(TARGET, `select current_user as usr, version() as v,
      (select count(*)::int from auth.users) as users,
      (select coalesce(json_agg(nspname order by nspname), '[]') from pg_namespace
        where nspname in ('auction','board','quiz','sim','sim_private')) as app_schemas,
      (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r','v')) as public_relations,
      (select coalesce(json_agg(id order by id), '[]') from storage.buckets) as buckets,
      (select coalesce(json_agg(tgname order by tgname), '[]') from pg_trigger
        where tgrelid = 'auth.users'::regclass and not tgisinternal) as auth_triggers`))[0]
  console.log('TARGET', TARGET, JSON.stringify({ ...t, v: String(t.v).split(' ').slice(0, 2).join(' ') }))
  for (const [app, ref, tables] of [['quiz', QUIZ, QUIZ_TABLES], ['sim', SIM, SIM_TABLES]]) {
    if (!ref) continue
    const counts = {}
    for (const { table } of tables) counts[table] = await count(ref, `public.${table}`)
    const u = (await sql(ref, `select count(*)::int as users,
        count(*) filter (where is_anonymous)::int as anonymous,
        count(*) filter (where email is null)::int as no_email,
        count(*) filter (where email is not null and lower(email) !~ '^[^@[:space:]]+@nggconsult\\.com$')::int as other_domain,
        count(*) filter (where email_confirmed_at is null)::int as unconfirmed,
        (select count(*)::int from auth.identities) as identities,
        (select coalesce(json_agg(distinct split_part(lower(email), '@', 2)), '[]') from auth.users
          where email is not null and lower(email) !~ '^[^@[:space:]]+@nggconsult\\.com$') as other_domains
      from auth.users`))[0]
    const objects = await data(ref, `select coalesce(json_agg(json_build_object('bucket', bucket_id, 'n', n)), '[]') as data
      from (select bucket_id, count(*)::int as n from storage.objects group by 1) s`)
    const urls = await data(ref, `select coalesce(json_agg(distinct m[1]), '[]') as data from (
        select regexp_matches(t::text, 'https://([a-z0-9]{20})\\.supabase\\.co', 'g') as m
        from (${tables.map(({ table }) => `select row_to_json(x)::text as t from public.${table} x`).join(' union all ')}) s) r`)
    console.log(app.toUpperCase(), ref, JSON.stringify({ counts, auth: u, storage: objects, supabase_urls_in_data: urls }))
  }
}

async function loadUsers(ref) {
  const users = await data(ref, `select coalesce(json_agg(u order by u.created_at, u.id), '[]') as data from auth.users u`)
  const identities = await data(ref, `select coalesce(json_agg(i), '[]') as data from auth.identities i`)
  return { users, identities }
}

async function stepUsers() {
  if (state.usersDone) return console.log('users: already imported', state.usersSummary)
  const existing = await count(TARGET, 'auth.users')
  if (existing > 0) throw new Error(`target already has ${existing} auth users; refusing to merge into a non-empty project`)

  const sources = [['quiz', QUIZ], ['sim', SIM]].filter(([, ref]) => ref)
  const byEmail = new Map()
  const identitiesByApp = {}
  const skipped = { anonymous: 0, no_email: 0 }
  const skippedIds = { quiz: [], sim: [] }
  for (const [app, ref] of sources) {
    const { users, identities } = await loadUsers(ref)
    identitiesByApp[app] = identities
    for (const u of users) {
      // Anonymous sign-ins own nothing (every facilitator policy rejects them)
      // and an account without an email cannot sign in to any of the apps.
      if (u.is_anonymous) { skipped.anonymous++; skippedIds[app].push(u.id); continue }
      if (!u.email) { skipped.no_email++; skippedIds[app].push(u.id); continue }
      const key = u.email.toLowerCase()
      if (!byEmail.has(key)) byEmail.set(key, [])
      byEmail.get(key).push({ app, user: u })
    }
  }

  const idMap = { quiz: {}, sim: {} }
  const rows = []
  const identityRows = []
  let merged = 0
  const ts = (v) => (v ? Date.parse(v) : -Infinity)
  for (const candidates of byEmail.values()) {
    // The account last used to sign in keeps its id and password.
    candidates.sort((a, b) => ts(b.user.last_sign_in_at) - ts(a.user.last_sign_in_at) || ts(a.user.created_at) - ts(b.user.created_at))
    const primary = candidates[0]
    const row = { ...primary.user }
    if (candidates.length > 1) {
      merged++
      const others = candidates.slice(1).map((c) => c.user)
      row.raw_user_meta_data = Object.assign({}, ...others.map((o) => o.raw_user_meta_data ?? {}), primary.user.raw_user_meta_data ?? {})
      const confirmed = [row.email_confirmed_at, ...others.map((o) => o.email_confirmed_at)].filter(Boolean).sort()
      row.email_confirmed_at = row.email_confirmed_at ?? confirmed[0] ?? null
      row.created_at = [row.created_at, ...others.map((o) => o.created_at)].filter(Boolean).sort()[0]
    }
    rows.push(row)
    for (const c of candidates) idMap[c.app][c.user.id] = primary.user.id
    const own = identitiesByApp[primary.app].filter((i) => i.user_id === primary.user.id)
    if (own.some((i) => i.provider === 'email')) identityRows.push(...own)
    else {
      identityRows.push(...own, {
        provider: 'email',
        provider_id: row.id,
        user_id: row.id,
        identity_data: { sub: row.id, email: row.email, email_verified: Boolean(row.email_confirmed_at), phone_verified: false },
        last_sign_in_at: row.last_sign_in_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })
    }
  }

  const userCols = (await insertableColumns(TARGET, 'auth', 'users')).filter((c) => rows.some((r) => c in r))
  const identityCols = (await insertableColumns(TARGET, 'auth', 'identities')).filter((c) => identityRows.some((r) => c in r))
  for (let i = 0; i < rows.length; i += 200) await insertRows(TARGET, 'auth', 'users', userCols, rows.slice(i, i + 200))
  for (let i = 0; i < identityRows.length; i += 200) await insertRows(TARGET, 'auth', 'identities', identityCols, identityRows.slice(i, i + 200))

  const otherDomain = rows.filter((r) => !ORG_EMAIL.test(r.email)).length
  state.idMap = idMap
  state.skippedUserIds = skippedIds
  state.usersSummary = { imported: rows.length, merged_duplicates: merged, other_domain: otherDomain, skipped, identities: identityRows.length }
  state.usersDone = true
  save()
  console.log('users:', state.usersSummary, '| target now has', await count(TARGET, 'auth.users'))
}

function schemaFiles() {
  const ls = (dir) => fs.readdirSync(path.join(REPOS, dir)).filter((f) => f.endsWith('.sql')).sort().map((f) => path.join(dir, f))
  return [
    ...ls('NGGSim/supabase/migrations'),
    'NGGQuiz/supabase/schema.sql',
    ...ls('NGGBoard/supabase/migrations'),
    ...ls('Maccabi-AI-auction/supabase/migrations'),
    'Maccabi-AI-auction/supabase/seed.sql',
  ]
}

async function stepSchema() {
  state.schemaApplied ??= []
  for (const file of schemaFiles()) {
    if (state.schemaApplied.includes(file)) continue
    process.stdout.write(`schema: ${file} ... `)
    await sql(TARGET, fs.readFileSync(path.join(REPOS, file), 'utf8'))
    state.schemaApplied.push(file)
    save()
    console.log('ok')
  }
  console.log(`schema: ${state.schemaApplied.length} files applied`)
}

function rewriteQuizUrls(row) {
  if (!QUIZ) return row
  let s = JSON.stringify(row)
  const from = `https://${QUIZ}.supabase.co/storage/v1/object/public/`
  const to = `https://${TARGET}.supabase.co/storage/v1/object/public/`
  s = s.split(`${from}logos/`).join(`${to}quiz-logos/`).split(`${from}media/`).join(`${to}quiz-media/`)
  return JSON.parse(s)
}

async function copyApp(app, ref, schema, tables, transform) {
  state.data ??= {}
  state.data[app] ??= {}
  const idMap = state.idMap?.[app]
  if (!idMap) throw new Error('run the users step first')
  for (const spec of tables) {
    const { table, users } = spec
    if (state.data[app][table]?.done) continue
    const sourceCols = await insertableColumns(ref, 'public', table)
    const targetCols = await insertableColumns(TARGET, schema, table)
    const lost = sourceCols.filter((c) => !targetCols.includes(c))
    if (lost.length) throw new Error(`${app}.${table}: columns ${lost} exist only in the old project`)
    const cols = targetCols.filter((c) => sourceCols.includes(c))
    const total = await count(ref, `public.${table}`)
    const page = spec.page ?? 500
    const skippedIds = new Set(state.skippedUserIds?.[app] ?? [])
    let copied = 0
    let dropped = 0
    const unmapped = new Set()
    for (let off = 0; off < total; off += page) {
      const rows = await data(ref, `select coalesce(json_agg(t), '[]') as data from (select * from public.${qi(table)} order by id limit ${page} offset ${off}) t`)
      const out = []
      for (const r of rows) {
        const row = transform(r)
        // A profile of a skipped account (an anonymous sign-in) is left behind
        // with the account; any other row pointing at one is an error.
        if (table === 'profiles' && skippedIds.has(row.id)) { dropped++; continue }
        for (const c of users) {
          if (row[c] == null) continue
          if (!(row[c] in idMap)) unmapped.add(row[c])
          else row[c] = idMap[row[c]]
        }
        out.push(row)
      }
      if (unmapped.size) throw new Error(`${app}.${table}: ${unmapped.size} rows reference users that were not imported`)
      if (app === 'sim' && table === 'profiles') {
        // The schema install already gave every imported account a profile;
        // the old project's display name and timestamps win.
        await insertRows(TARGET, schema, table, cols, out,
          `on conflict (id) do update set display_name = case when excluded.display_name <> '' then excluded.display_name else ${qi(schema)}.profiles.display_name end,
             created_at = least(excluded.created_at, ${qi(schema)}.profiles.created_at), updated_at = excluded.updated_at`)
      } else {
        await insertRows(TARGET, schema, table, cols, out)
      }
      copied += rows.length
    }
    const after = await count(TARGET, `${qi(schema)}.${qi(table)}`)
    state.data[app][table] = { source: total, dropped, target: after, done: true }
    save()
    console.log(`data: ${schema}.${table}: source ${total}${dropped ? ` (${dropped} of skipped accounts left behind)` : ''}, target ${after}${after < total - dropped ? '  <-- SHORT' : ''}`)
  }
}

async function stepData() {
  if (QUIZ) {
    // Historical answers must keep their recorded score: the scoring trigger
    // rejects answers outside a live question and the points trigger would add
    // them to the player a second time.
    await sql(TARGET, `alter table quiz.answers disable trigger answers_score;
                       alter table quiz.answers disable trigger answers_apply_points`)
    try {
      await copyApp('quiz', QUIZ, 'quiz', QUIZ_TABLES, rewriteQuizUrls)
    } finally {
      await sql(TARGET, `alter table quiz.answers enable trigger answers_score;
                         alter table quiz.answers enable trigger answers_apply_points`)
    }
  }
  if (SIM) {
    await sql(TARGET, `alter table sim.profiles disable trigger profiles_set_updated_at`)
    try {
      await copyApp('sim', SIM, 'sim', SIM_TABLES, (r) => r)
    } finally {
      await sql(TARGET, `alter table sim.profiles enable trigger profiles_set_updated_at`)
    }
  }
  await sql(TARGET, `notify pgrst, 'reload schema'`)
}

async function serviceKey(ref) {
  const keys = await api('GET', `/v1/projects/${ref}/api-keys?reveal=true`)
  const legacy = keys.find((k) => k.name === 'service_role' && k.api_key)
  const secret = keys.find((k) => k.type === 'secret' && k.api_key)
  return (legacy ?? secret)?.api_key
}

async function stepStorage() {
  if (MODE === 'local') return console.log('storage: skipped in local mode')
  const objects = await data(QUIZ, `select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name,
      'type', metadata->>'mimetype') order by bucket_id, name), '[]') as data
    from storage.objects where bucket_id in ('logos', 'media')`)
  const key = await serviceKey(TARGET)
  if (!key) throw new Error('no service key found on the target project')
  const enc = (name) => name.split('/').map(encodeURIComponent).join('/')
  state.storage ??= {}
  let copied = 0
  for (const o of objects) {
    const id = `${o.bucket}/${o.name}`
    if (state.storage[id]) continue
    const src = await fetch(`https://${QUIZ}.supabase.co/storage/v1/object/public/${o.bucket}/${enc(o.name)}`)
    if (!src.ok) throw new Error(`download ${id} -> ${src.status}`)
    const body = Buffer.from(await src.arrayBuffer())
    const dest = await fetch(`https://${TARGET}.supabase.co/storage/v1/object/quiz-${o.bucket}/${enc(o.name)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`, apikey: key, 'x-upsert': 'true',
        'Content-Type': o.type || src.headers.get('content-type') || 'application/octet-stream',
      },
      body,
    })
    if (!dest.ok) throw new Error(`upload ${id} -> ${dest.status}: ${(await dest.text()).slice(0, 300)}`)
    state.storage[id] = true
    save()
    copied++
  }
  const after = await data(TARGET, `select coalesce(json_object_agg(bucket_id, n), '{}') as data
    from (select bucket_id, count(*)::int as n from storage.objects group by 1) s`)
  console.log(`storage: ${objects.length} objects in the old buckets, ${copied} copied now; target buckets:`, after)
}

async function stepPostgrest() {
  const cfg = await api('GET', `/v1/projects/${TARGET}/postgrest`)
  const schemas = cfg.db_schema.split(',').map((s) => s.trim()).filter(Boolean)
  for (const s of ['auction', 'board', 'quiz', 'sim']) if (!schemas.includes(s)) schemas.push(s)
  const out = await api('PATCH', `/v1/projects/${TARGET}/postgrest`, { db_schema: schemas.join(',') })
  console.log('postgrest db_schema:', cfg.db_schema, '->', out.db_schema)
}

async function authConfig(ref) {
  return api('GET', `/v1/projects/${ref}/config/auth`)
}

/**
 * One Auth configuration now serves every app. Plan it from the old projects:
 * every app's URLs in the redirect allow-list, the simulations' Site URL
 * (dashboard invitations and password resets land there), confirmation e-mails
 * on (self sign-up grants admin rights to any @nggconsult.com address, so the
 * address must be proven), anonymous sign-ins off, and the old projects'
 * customised e-mail texts. Prints the plan; --apply writes it.
 */
async function stepAuth() {
  const sources = [['sim', SIM], ['quiz', QUIZ], ['board', BOARD]].filter(([, r]) => r)
  const old = {}
  for (const [name, ref] of sources) {
    try {
      old[name] = await authConfig(ref)
    } catch (e) {
      console.log(`auth: ${name} (${ref}) config unavailable: ${e.message.slice(0, 120)}`)
    }
  }
  const target = await authConfig(TARGET)

  const urls = new Set((target.uri_allow_list ?? '').split(',').map((u) => u.trim()).filter(Boolean))
  for (const c of Object.values(old)) {
    const list = [c.site_url, ...(c.uri_allow_list ?? '').split(',')].map((u) => (u ?? '').trim()).filter(Boolean)
    for (const u of list) {
      urls.add(u)
      try {
        const origin = new URL(u.replace(/\*+$/, '')).origin
        if (!/localhost|127\.0\.0\.1/.test(origin)) urls.add(`${origin}/**`)
      } catch { /* not a URL: kept as written */ }
    }
  }
  const lengths = Object.values(old).map((c) => c.password_min_length ?? 6)
  const patch = {
    site_url: old.sim?.site_url || old.quiz?.site_url || target.site_url,
    uri_allow_list: [...urls].join(','),
    disable_signup: false,
    mailer_autoconfirm: false,
    external_anonymous_users_enabled: false,
    password_min_length: Math.max(6, ...lengths),
  }
  const copied = {}
  for (const key of Object.keys(target).filter((k) => /^mailer_(subjects|templates)_/.test(k))) {
    for (const [name, c] of Object.entries(old)) {
      if (c[key] && c[key] !== target[key]) {
        patch[key] = c[key]
        copied[key] = name
        break
      }
    }
  }
  console.log('auth plan:', JSON.stringify({ ...patch, ...Object.fromEntries(Object.keys(copied).map((k) => [k, `<from ${copied[k]}>`])) }, null, 2))
  for (const [name, c] of Object.entries(old)) {
    if (c.smtp_host) console.log(`auth: ${name} used custom SMTP (${c.smtp_host}, sender ${c.smtp_admin_email}); its password cannot be read back, so it is NOT copied`)
    if (c.mailer_autoconfirm) console.log(`auth: ${name} had e-mail confirmation OFF; the shared project turns it ON`)
    if (c.disable_signup) console.log(`auth: ${name} had sign-ups disabled; the shared project allows them (domain-limited by the quiz and board triggers)`)
  }
  if (!process.argv.includes('--apply')) return console.log('auth: plan only; run again with --apply to write it')
  await api('PATCH', `/v1/projects/${TARGET}/config/auth`, patch)
  console.log('auth: applied')
}

async function stepFunctions() {
  for (const slug of ['elevenlabs-signed-url', 'elevenlabs-postcall']) {
    const code = fs.readFileSync(path.join(REPOS, 'NGGSim/supabase/functions', slug, 'index.ts'))
    const form = new FormData()
    form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name: slug, verify_jwt: false }))
    form.append('file', new Blob([code], { type: 'application/typescript' }), 'index.ts')
    const out = await api('POST', `/v1/projects/${TARGET}/functions/deploy?slug=${slug}`, undefined, { form })
    console.log('function', slug, out.status, 'version', out.version)
  }
  const secrets = await api('GET', `/v1/projects/${TARGET}/secrets`)
  const names = secrets.map((s) => s.name)
  const missing = ['ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID', 'ELEVENLABS_VOICE_MALE', 'ELEVENLABS_VOICE_FEMALE', 'ELEVENLABS_WEBHOOK_SECRET']
    .filter((n) => !names.includes(n))
  console.log('edge function secrets still to set:', missing.join(', ') || 'none')
}

async function stepKeys() {
  const keys = await api('GET', `/v1/projects/${TARGET}/api-keys?reveal=true`)
  // Public keys only: they ship in every browser bundle by design. Secret and
  // service keys are never printed.
  for (const k of keys) {
    const pub = k.name === 'anon' || k.type === 'publishable'
    console.log(`${k.name} (${k.type})${pub ? ': ' + k.api_key : ' — copy from the dashboard'}`)
  }
  // The simulations' Edge Functions call the API with the injected legacy
  // SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY, as they did in their old project.
  const legacy = await api('GET', `/v1/projects/${TARGET}/api-keys/legacy`).catch(() => null)
  if (legacy) console.log('legacy JWT keys enabled:', legacy.enabled)
}

async function stepVerify() {
  const keys = await api('GET', `/v1/projects/${TARGET}/api-keys?reveal=true`)
  const anon = (keys.find((k) => k.name === 'anon') ?? keys.find((k) => k.type === 'publishable'))?.api_key
  const base = `https://${TARGET}.supabase.co/rest/v1`
  const h = (schema, extra = {}) => ({ apikey: anon, Authorization: `Bearer ${anon}`, 'Accept-Profile': schema, 'Content-Profile': schema, ...extra })
  const check = async (label, url, init, expect) => {
    const res = await fetch(url, init)
    const text = await res.text()
    const ok = expect(res.status, text)
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${res.status} ${text.slice(0, 160)}`)
  }
  await check('auction: anon reads traits', `${base}/traits?select=title&limit=1`, { headers: h('auction') }, (s) => s === 200)
  await check('auction: anon cannot read session tokens', `${base}/participant_sessions?select=*`, { headers: h('auction') }, (s) => s === 401 || s === 403)
  await check('board: anon reads the public view', `${base}/public_board_view?select=public_id&limit=1`, { headers: h('board') }, (s) => s === 200)
  await check('quiz: anon reads the quiz library', `${base}/quizzes?select=id&limit=1`, { headers: h('quiz') }, (s, t) => s === 200 && t !== '[]')
  await check('sim: anon cannot read simulations', `${base}/simulations?select=id`, { headers: h('sim') }, (s) => s === 401 || s === 403)
  const token = await data(TARGET, `select to_json(token) as data from sim.simulation_share_links s
    join sim.simulations m on m.id = s.simulation_id
    where s.status = 'active' and m.status = 'published' and m.deleted_at is null limit 1`)
  if (token) {
    await check('sim: a published share link resolves for anon', `${base}/rpc/get_participant_simulation`,
      { method: 'POST', headers: h('sim', { 'Content-Type': 'application/json' }), body: JSON.stringify({ public_token: token }) },
      (s, t) => s === 200 && t.includes('"title"'))
  }
  await check('public schema is empty', `${base}/quizzes?select=id&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }, (s) => s === 404)
}

const steps = {
  projects: stepProjects, preflight: stepPreflight, users: stepUsers, schema: stepSchema, data: stepData,
  storage: stepStorage, postgrest: stepPostgrest, auth: stepAuth, functions: stepFunctions,
  keys: stepKeys, verify: stepVerify,
}
const step = steps[process.argv[2]]
if (!step) {
  console.error(`usage: node migrate.mjs <${Object.keys(steps).join('|')}>`)
  process.exit(2)
}
step().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
