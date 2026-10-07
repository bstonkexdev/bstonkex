# Project conventions

This project is **already scaffolded** as **Vite 6 + React 19 + TypeScript 5.6**. Do NOT recreate it.

## Paths

- **Always use RELATIVE paths** in tool calls (e.g. `src/App.tsx`). NEVER absolute paths like `/var/folders/...`, `/private/...`, or `/tmp/...`. Your working directory is already the project root.

## What exists

- `index.html` — entry HTML (don't edit unless necessary)
- `src/main.tsx` — bootstraps React (don't edit unless necessary)
- `src/App.tsx` — root component — **edit this to build the user's feature**
- `src/index.css` — global styles
- `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` — build config (don't touch)
- `package.json` — edit to add deps
- `src/lib/gitlawb.ts` — the Gitlawb SDK (database + user sign-in). **Never edit or delete this file.**

## Saving data (Gitlawb Data)

When the user's app needs to STORE anything — records, submissions, scores, todos, posts — use the built-in SDK. **Never** build a fake backend, use localStorage for shared data, or add an external database (no Supabase/Firebase/etc.).

```ts
import { gitlawb } from "./lib/gitlawb"; // from src/App.tsx; adjust relative path elsewhere

// Pick the RIGHT visibility — it decides whether a NOT-signed-in visitor can use your
// published app. Preview always has you signed in, so a wrong choice works in preview
// and only breaks after publishing:
//   "inbox"         — anyone submits without signing in, only the builder reads.
//                     Contact forms, feedback, waitlists, signups, orders.
//   "public"        — anyone on the internet reads AND writes. Guestbooks, comments, polls.
//   "authenticated" — signed-in users read all records, write their own. Member feeds.
//   "owner" (default) — private per user. Todo lists, notes, saved items.
//
// PERSONAL DATA IS NEVER "public": anything describing a person — profiles, members,
// accounts, teams, contact details, messages, orders — must be "owner", "inbox", or
// (for data an app's signed-in members share) "authenticated". "public" is only for
// content meant for the open internet.
//
// APPROVAL: requesting "public" or "authenticated" does not apply immediately — the
// platform creates the collection private and asks the app's builder to allow the wider
// access in the Data tab. When you request one, tell the user to approve it there.
// "owner" and "inbox" apply instantly.
const messages = gitlawb.db.collection("contact_messages", { visibility: "inbox" });
const entries = gitlawb.db.collection("guestbook", { visibility: "public" });
const todos = gitlawb.db.collection<{ text: string; done: boolean }>("todos");

await todos.create({ text: "hi", done: false });
const { records } = await todos.list();               // newest first; {id, data, mine, createdAt}
await todos.update(id, { done: true });               // shallow merge
await todos.remove(id);
// sort compares values as TEXT (so 9 sorts above 100) — use it for strings and
// ISO dates. For numeric ranking, list() then sort in JS:
const scoreRows = (await scores.list({ limit: 100 })).records;
const top = scoreRows.sort((a, b) => b.data.score - a.data.score).slice(0, 10);
```

Sign-in: `gitlawb.auth.user()` returns `{id, name?}` or null; `gitlawb.auth.signIn()` redirects and comes back. For `owner`/`authenticated` collections you MUST gate the UI: if `user()` is null show a "Sign in with Gitlawb" button that calls `signIn()`, and catch errors with `code === "sign_in_required"`. **In preview you are always signed in as the builder, so a missing sign-in button looks fine here and then 403s every visitor once published** — if a first-time visitor should be able to submit without an account, use `inbox` or `public` instead.

Rules: records are JSON objects ≤32KB; don't store secrets or personal data beyond what the feature needs; visibility is set by your first `collection()` call with a `visibility` option — choose deliberately (`public` means strangers can read AND write, and never holds personal data). Wide modes (`public`/`authenticated`) take effect only after the builder approves them in the Data tab.

## Rules

- **Do not run** `npm install`, `bun install`, `npm run dev`, `vite`, or any dev-server command. The playground runtime installs deps and runs Vite; HMR reflects your changes automatically.
- **Do not run** `npm init`, `create-vite`, or any scaffolding command.
- **Read before editing.** Use `Read` to inspect a file, then `Edit` to change it. Only use `Write` for NEW files.
- Add dependencies by editing `package.json` — the runtime will reinstall.
- Env vars go in `.env.local`; Vite exposes `VITE_*` vars via `import.meta.env`.
- TypeScript + React 19 function components + hooks. No class components.
- When you finish, tell the user what you built and what to try next.
