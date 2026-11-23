# Claude Code — Project Context

## Project Overview

**@agiledata/shared** — server and browser utilities shared by AgileData SvelteKit apps: a SvelteKit
`handle` hook, a lazy Firestore client, a products-cache reader/writer, IAP JWT parsing, two internal
route handlers, and browser-side IAP session renewal. The public surface is the `exports` map in [package.json](package.json); every
entry there is an interface consuming apps depend on.

**This repository is public.** Anything merged — code, tests, docs, commit messages — is visible to anyone.

## Tech Stack

- **Language:** JavaScript (ES modules), no build step — consumers import the source files directly
- **Peer dependencies:** `@google-cloud/firestore`, `@sveltejs/kit` (consumers supply their own versions)
- **Tests:** Vitest + jsdom (`npm test`), Node 22+
- **Distribution:** consumers install from a git tag (`github:agiledata-cloud/agiledata-shared#vX.Y.Z`);
  nothing is published to npm, and this repo's lockfile is not used by consumers

## Branch Strategy

One branch, `main`, protected: changes arrive by PR from a feature branch only (required checks + 1
approval, enforced for admins). A new push dismisses earlier approvals, so every commit that merges has
been reviewed. Only repository admins can push branches. Dependabot PRs and PRs from forks get no
Claude review (neither can read the API key) and need a human approval. There is no `development` branch.

**Merging is not a release.** A release is a version bump in `package.json` on `main`, then a tag on that
commit. Consuming apps move to it by updating their pinned tag.

## Code Review Standards

### Must Block (Request Changes)

- Hardcoded secrets, API keys, tokens, webhook URLs, or credentials
- **Internal identifiers in any file, test fixture or comment:** GCP project IDs, internal hostnames or
  service URLs, customer or tenant names, internal email addresses, or anything copied from a production
  log or payload. Use placeholders such as `example.com` and `example-project`
- Any change that weakens session or identity handling: `iapAuth.js` trusting a header it should not,
  `handle.js` dropping or loosening the security headers it sets, `sessionCheck.js` accepting a
  cross-origin `message` event, or the cache-profile route writing data for a user other than the
  authenticated one
- Removing or renaming an entry in the `exports` map, or changing an exported function's signature or
  return shape, without a clear version-bump intent in the PR
- A workflow change to `pull_request_target`, or one that exposes secrets to code from forks
- Firestore writes whose document ID or collection comes from request input, or user data keyed by
  anything other than the authenticated user's identity. That identity is the IAP email
  (`locals.userEmail`, or `emailFromIapJwt` on the IAP assertion header), as the cache-profile route uses
  today. The one shared write is `writeProductsCache`,
  to the fixed `products_cache/products` document; any change to that path or its inputs is Must Block
  too
- Accidental inclusion of `node_modules/`, `.env` files, keyfiles, or local `.claude/` settings

### Should Flag (note in the review, do not block)

When there are no Must Block issues, approve and list these points in the approval body.

- `console.log` debug output beyond the existing warning and error logging
- Dead code or commented-out blocks not belonging to this PR
- New code paths in `src/browser/` without a test in `sessionCheck.test.js`
- `package.json` peer ranges or `exports` changed without a matching README update
- New runtime `dependencies` — this package currently has none, and consumers inherit anything added

### Approve When

- Code is clean and consistent with existing patterns in `src/`
- No security or exposure concerns
- `npm test` passes in CI
- The change achieves what the PR title/description states
- Dependencies (if changed) are intentional and from trustworthy sources

## CI Checks Already Running

On every PR into `main` ([ci-gate.yml](.github/workflows/ci-gate.yml)):

- **Unit Tests** — `npm test`
- **Dependency Vulnerability Audit** — `npm audit --audit-level=high`
- **Secret Scan** — detect-secrets against `.secrets.baseline`
- **Export Integrity Check** — every `exports` entry resolves to a file

GitHub secret scanning with push protection is also enabled on the repository.

## Review Configuration Changes

PRs that change `CLAUDE.md`, `.secrets.baseline` or anything under `.github/` are reviewed like any other
PR, judged against the base branch's rules, with a summary of the configuration change at the top of the
review. A PR that edits the review workflow itself gets no Claude review at all (the action only runs a
workflow that matches the default branch's copy), so it needs another maintainer's approval.

Claude's approval is the gate before merge into `main`. Trust but verify the automated checks passed.
