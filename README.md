# SEDL — Sped-Up Extreme Demon List

A responsive, static community ranking for sped-up Geometry Dash Extreme Demons. No framework, build command, or backend is required. The included entries are **fictional sample data**, not official rankings, and the rules are a starter template that list staff must finalize.

## Deploy to Cloudflare Pages

1. Push this repository to GitHub and connect it in Cloudflare Pages (Workers & Pages → Create application → Pages → Connect to Git).
2. Select the branch you want to deploy. If you use production's default branch, merge your changes there first; otherwise select this branch for preview deployments.
3. Use **None** as the framework preset. Leave the build command blank and set the build output directory to `/` (the repository root). Deploy.
4. Set your desired Pages project name to obtain a `*.pages.dev` address. `sedl.pages.dev` is available only if that name is not already taken by another Cloudflare account.

Cloudflare serves the files directly. To preview locally, run `python3 -m http.server 8000` and visit `http://localhost:8000`. Opening `index.html` directly with `file://` will not load the JSON because browsers restrict local fetches. Google Fonts are optional; system fonts are used if they cannot load.

## Manage the list

`data/_list.json` is an ordered JSON array of filenames in `data/levels/`. The first filename is rank #1, the second is #2, and so on. Add, remove, or reorder filenames to update the list. Every filename must refer to a valid JSON file in that folder. An empty array (`[]`) produces an empty list.

Each level file follows this format:

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
