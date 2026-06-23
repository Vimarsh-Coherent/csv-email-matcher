# CSV Email Matcher

A zero-backend web app that matches **verified emails** to the **right people** and exports a clean CSV.

- **Input 1 — verified emails CSV:** `email, domain, status, score, reason`
- **Input 2 — people export CSV:** Apollo-style export (`first_name, last_name, org_website, …`, with placeholder emails)
- **Output:** every column of the people CSV, with `email` filled in from the matched verified email. People with no confident match are removed.

## How matching works

1. Join on **domain** — the person's `org_website` host vs. the verified email's domain.
2. Within a domain, score each verified email's local-part against the person's name
   (`first.last` = 100, `flast` = 88, `first` = 70, `last` = 60, role/`info@` = 22).
3. Assign the best name-match per person (tie-broken by verified status, then score),
   each email used only once so two people never get the same address.
4. Drop anyone left without a match.

All processing happens **in your browser** — the CSVs are never uploaded anywhere.

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Deploy to Vercel

```bash
npm i -g vercel   # if needed
vercel            # from this folder, follow the prompts
vercel --prod     # promote to production
```

Or push this folder to a GitHub repo and "Import Project" on vercel.com — it's a
static site, no build step required.

## Files

| File | Purpose |
|------|---------|
| `index.html` | UI (upload, options, preview, download) |
| `matcher.js` | Matching logic — shared by the browser and the Node test |
| `test.js` | Local sanity check against real CSVs (`node test.js`) |
| `vercel.json` | Static deploy config |
