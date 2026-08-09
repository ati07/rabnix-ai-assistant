# Web chat widget — test harness

Manual test assets for the embeddable web chat widget (the `web` channel). Kept
here (not deleted) so the feature can be re-tested in future.

## Files

- `test-widget.html` — a standalone "customer website" that embeds the widget
  via `widget.js`. Use it to verify the floating launcher + iframe chat on a
  page that is a different origin than the app.

## How to test

1. Start the app: `npm run dev` → http://localhost:3000
2. In `/dashboard/chatbot`: toggle **Enable web chat** on, set a greeting/colour,
   and copy the `data-chat-key` from the embed snippet.
3. Paste that key into `test-widget.html` (`data-chat-key="..."`).
4. Open `test-widget.html` (double-click = `file://`, which works because the
   default origin allow-list is empty). To test the allow-list, serve it over
   HTTP (`npx serve scripts/web-chat-test`) and add that origin in the dashboard.
5. Click the launcher → chat opens → send a message → the RABNIX-aware AI replies.
6. Reload the page → the thread is restored (history endpoint).
7. In `/dashboard/conversations` a new **web** conversation appears.

## Public API (same-origin from the iframe, all under `/api/chat/[key]`)

- `GET  /api/chat/<key>/config` — public render config (404 if disabled/unknown).
- `POST /api/chat/<key>/message` — `{ sessionId, text }` → `{ reply }`.
- `GET  /api/chat/<key>/history?sessionId=...` — prior messages for restore.

Quick curl smoke test (replace `<key>`):

```bash
curl -s http://localhost:3000/api/chat/<key>/config
curl -s -X POST http://localhost:3000/api/chat/<key>/message \
  -H 'content-type: application/json' \
  -d '{"sessionId":"web_test_1","text":"What services do you offer?"}'
curl -s "http://localhost:3000/api/chat/<key>/history?sessionId=web_test_1"
```

## Notes

- Anonymous identity: the widget stores a random `sessionId` in `localStorage`
  (`rabnix-chat-session:<key>`) and uses it as the conversation `customerId`.
- Rate limit: in-memory token bucket (~15 msgs/min per session), per process only.
- Rotating the key in the dashboard invalidates old snippets — update the key here.
