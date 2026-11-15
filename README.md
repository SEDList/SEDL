# SEDL — Sped-Up Extreme Demon List

A static, responsive community ranking for the top 25 sped-up Geometry Dash Extreme Demons. No framework, build command, or backend is required. The included rankings and records are loaded from the repository’s data folder. The rules are a starter template that list staff must finalize.

## Deploy to Cloudflare Pages

1. Connect this repository in Cloudflare Pages (Workers & Pages → Create application → Pages → Connect to Git).
2. Select the branch you want to deploy. If you use production's default branch, merge the changes there first; otherwise select this branch for preview deployments.
3. Use **None** as the framework preset. Leave the build command blank and set the build output directory to `/` (the repository root). Deploy.
4. Set your desired Pages project name to obtain a `*.pages.dev` address. `sedl.pages.dev` is available only if that name is not already taken by another Cloudflare account.

Cloudflare serves the files directly. To preview locally, run `python3 -m http.server 8000` and visit `http://localhost:8000`. Opening `index.html` directly with `file://` will not load the JSON because browsers restrict local fetches.

## Manage the top 25

`data/_list.json` is an ordered JSON array of level names or filenames in `data/`. For example, `"trueffet"` loads `data/trueffet.json` (the `.json` suffix is optional). The first entry is rank #1, the second is #2, and so on. Add, remove, or reorder filenames to update the list. The site displays **only the first 25 entries**; only those entries contribute to the leaderboard. Every displayed entry must refer to a valid JSON file in that folder. Files in `data/levels/` are also supported as a fallback. An empty array (`[]`) produces an empty list.

Each level file follows this format (replace all example values with actual data):

```json
{
  "name": "Level name",
  "speed": "1.5x",
  "creator": "Creator name",
  "verifier": "Player name",
  "levelId": "12345678",
  "youtube": "YouTube video ID or URL",
  "records": [
    { "player": "Another player", "video": "https://www.youtube.com/watch?v=VIDEO_ID" }
  ]
}
```

`youtube` and record `video` can be empty until footage is available. Set `"demo": true` on example entries to display the sample-data notice; remove the flag for real entries. Keep the verifier out of `records`: they are automatically shown as a verified completion. Player names are matched case-insensitively and each player scores a level only once, even if duplicated in the data. IDs are treated as text. An unavailable or invalid level file displays an error rather than silently changing ranks.

## Points and rules

Each completed level awards `1000 × e^(−0.05 × (rank − 1))` points, rounded to two decimal places per level. The leaderboard sums those rounded awards, with alphabetical ordering for ties. The verifier automatically earns points. Edit `pointsForRank` in `js/app.js` to change the curve.

Before accepting submissions, edit the Rules tab in `index.html` to set the actual minimum speed, allowed increments, accepted MegaHack/timewarp settings, evidence requirements, and submission process. The included guidance intentionally does not invent official policy.

## Record submissions and private review

Cloudflare Pages automatically deploys the files in `functions/`; no site build command is needed. Configure these bindings for **each Pages environment** you use (production and/or preview):

- KV namespace binding `RECORDS_KV`.
- Secret environment variable `DISCORD_WEBHOOK_URL`, pointing to a webhook in a staff-only Discord channel.

The form posts to `/api/submit`. The function checks the selected rank and filename against the deployed list, saves the submission in KV, and sends a private review link to Discord. The submitter does not receive the token or review URL. A successful submission is **not automatically approved** or added to a level file: staff inspect the evidence, copy the JSON from the review page, and manually add it to the level's `records` array. Actual records remain in KV until staff delete them. If Discord fails, the function attempts to delete the saved submission and returns an error.

To test the deployed bindings, visit `/record/submit/test/` on the intended Pages domain and click the link sent to Discord. The dummy KV entry expires after one hour. KV is eventually consistent across locations, so if a newly sent link initially fails, wait briefly and reload. The test route requires deployed Pages Functions and live bindings: a plain `python3 -m http.server` preview serves only the static UI, not the API. For local Functions development, use Wrangler Pages dev with a local KV binding and a local secret in `.dev.vars`; never commit that file. Run `node --test tests/records.test.mjs` for mocked API tests.

**Security and operations:** The review link is a bearer credential, not staff login or role-based access: anyone who obtains it can read the submission. Keep the webhook channel private, avoid sharing links, and delete a KV record to revoke access. The required lookup API puts the token in a query string; ensure Cloudflare and any downstream request logging/redaction policies do not retain or expose query strings. The submission endpoint and the requested GET test endpoint are public and can be abused to generate KV writes and Discord messages. Configure Cloudflare WAF/rate limits for `/api/submit` and restrict `/record/submit/test/` to staff (or disable it after testing); this code does not itself provide rate limiting or authentication for that test endpoint. KV key checks are not atomic, so extremely unlikely concurrent random ID collisions cannot be completely ruled out.
