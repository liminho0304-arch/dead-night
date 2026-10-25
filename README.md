# Dead Night

**An agent that fills an independent café's quietest night.** It reads what the café's crowd and its neighbourhood actually love from [Qloo](https://www.qloo.com)'s taste graph, plans events that fit the owner's menu, budget, staff and hours, explains why each idea fits, rules out the impractical ones, and learns from how past events went. The owner approves anything that costs money or gets announced.

Built for the Qloo Agentic Hackathon ("Agents, but with taste").

## Why it needs Qloo

Without taste data, an LLM suggests the same five café events to everyone: trivia, open mic, live music. Dead Night grounds every idea in Qloo results for *this* café's crowd:

| Qloo capability | How Dead Night uses it |
| --- | --- |
| Search (places, localities) | Finds the café in the taste graph, or its neighbourhood if Qloo doesn't know it yet |
| Insights, `signal.interests.entities` | Cross-domain affinities of the café crowd (or nearby cafés' crowds): music genres, artists, TV shows, podcasts, films, culture tags. This is the core signal for event themes. |
| Insights, `signal.location` | What the neighbourhood over-indexes on: music genres, venue types, cultural interests, favourite artists |
| Insights, `filter.location` + place hours | What else is open late on the quiet night nearby: the competition, or the gap |
| Tags search + demographics | Whether a theme's audience skews the same age as the café crowd |

Every idea card lists the Qloo signals behind it, and the agent trace shows each call.

## How the agent works

`/api/plan` runs an LLM agent (Vercel AI SDK tool calling; Claude, or Gemini on its free tier) over 11 tools in `lib/tools.ts`:

- **Qloo:** `locate_cafe`, `crowd_also_likes`, `local_taste_tags`, `local_favorites`, `nearby_venues`, `find_tags`, `audience_profile`
- **The owner's world:** `get_cafe_profile`, `review_past_events`, `check_feasibility` (hard checks on budget, staff, seats, hours, liquor license, equipment)
- **Hand-off:** `submit_plan`, which re-checks feasibility and sends the plan back to the agent if any idea fails

After an event, the owner logs attendance, cost, revenue, a rating and guest comments. `review_past_events` turns that into a **repeat / tweak / drop** verdict against a normal quiet night, and the agent must respect it the next time it plans.

The model is Claude when `ANTHROPIC_API_KEY` is set, otherwise Gemini when `GOOGLE_GENERATIVE_AI_API_KEY` is set. With neither, a deterministic offline planner (`lib/offline.ts`) calls the same Qloo tools in a fixed order and matches the results against a catalogue of café formats, so the app still works end to end.

Café data stays in the owner's browser (localStorage). No account needed.

## Run it

```bash
npm install
cp .env.example .env.local   # add QLOO_API_KEY, plus a Gemini or Claude key for the agent
npm run dev                  # http://localhost:3000
npm run smoke                # offline planner against live Qloo, printed to the terminal
```

| Variable | Required | Notes |
| --- | --- | --- |
| `QLOO_API_KEY` | yes | Sent as `X-Api-Key` |
| `QLOO_API_URL` | no | Defaults to `https://hackathon.api.qloo.com` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | no | Runs the agent on Gemini; free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | no | Defaults to `gemini-2.5-flash` |
| `ANTHROPIC_API_KEY` | no | Runs the agent on Claude (takes priority over Gemini) |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5-5` |

With no model key, the offline planner runs.

Deploy: import the repo in Vercel and set the same environment variables.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Vercel AI SDK 5 with `@ai-sdk/anthropic` and `@ai-sdk/google` · Qloo Insights API

## License

[MIT](LICENSE)
