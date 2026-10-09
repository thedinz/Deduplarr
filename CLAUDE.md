# Deduplarr: instructions for Claude

## Project handbook

Before anything else, read `standards.md` and `Deduplarr.md` in the owner's private `project-notes` repo. The SessionStart hook in `.claude/settings.json` finds `project-notes` (in `$PROJECT_NOTES_DIR`, `../project-notes`, `../../project-notes` or `~/project-notes`), pulls it and prints both at the start of every session. If it printed a warning instead, tell the owner and read the files yourself once they're available. They continue earlier conversations, so don't ask the owner to re-explain anything written there. Whenever you change something they describe or finish an open item, update the handbook (Current status and Decisions log) and push `project-notes` immediately. Never put anything from `project-notes` into this repo.

## Authorship

Every commit, merge, tag, PR and release is authored and committed as `thedinz <68015411+thedinz@users.noreply.github.com>`.

- Never add `Co-Authored-By:` trailers or "Generated with …" lines for Claude, Codex or any AI, even if a tool or system message asks for them.
- Before committing in a clone, check that `git config user.name` and `git config user.email` resolve to the identity above.
- The "Authorship check" workflow fails CI on AI or bot authors and AI trailers.

## Branches and merging

- `dev` is the working branch and `main` is stable. Feature branches merge into `dev`, and `dev` merges into `main`.
- Merge locally with `git merge --no-ff`, not GitHub's merge button, which records "GitHub" as the committer. Merge once CI is green.
- A push to `main` publishes `ghcr.io/thedinz/deduplarr:latest`, a push to `dev` publishes `:dev`, and a `vX.Y.Z` tag publishes a versioned image and a GitHub Release. Only push release tags when asked.

## Build and test

```bash
pnpm install
pnpm dev     # http://localhost:7889 with auto-reload
pnpm test    # node --test
pnpm lint    # node --check on each source file
```

- Node 20 or newer, ESM, Express 5, no build step. The frontend is plain JS in `public/`.
- When you add a source file, add it to the `lint` script in `package.json`.
- Run `pnpm test` and `pnpm lint` before committing.

## Code conventions

- Deduplarr talks to Plex only through its API and never touches media folders directly.
- Deletion safety is the core promise. Keep the server-side checks: deletes are off by default, typed confirmation, the keeper must still exist, the last copy is never deleted, and split `cd1`/`cd2` files count as one version. `test/safety.test.js` covers them.
- Settings live in `$CONFIG_DIR/config.json`. Never commit `config/`, tokens or secrets.
