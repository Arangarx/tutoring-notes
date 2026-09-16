# Google Calendar verification — scope justification and demo script

**Branch:** `feat/calendar-wave`  
**Audience:** Google OAuth verification resubmit packet + Andrew demo filming  
**Canonical plan:** [`CALENDAR-WAVE-PLAN.md`](CALENDAR-WAVE-PLAN.md)

---

## Why `calendar.events.owned` (not `calendar.app.created`)

Tutoring Notes writes scheduled sessions to the tutor's **primary** Google Calendar — the calendar they already check on phone and desktop.

| Scope | Why we did not choose it for phase 1 |
|-------|--------------------------------------|
| `calendar.events` | Too broad (includes calendars shared with the tutor, not only owned). Rejected by Google in the prior round and by us. |
| `calendar.app.created` | Events live on app-created secondary calendars that often do not appear in the Google Calendar mobile app without manual per-calendar sync toggles — unacceptable extra steps for time-sensitive tutoring sessions. |
| **`calendar.events.owned`** | Narrowest scope that can create, update, and delete events on calendars the tutor **owns**, including the primary calendar. |

We also request **`userinfo.email`** only (identify the connected account). We do **not** request `calendar.readonly`, `calendar.events`, push/watch channels, or CalDAV.

**Product behavior:** When Google Calendar is connected, session create/edit/delete in the app triggers `events.insert` / `events.patch` / `events.delete` on calendar ID `primary`. If Google write fails, Postgres scheduling still succeeds (fail-soft). Disconnect removes our stored refresh token and performs **zero** Google API calls; events already written remain in Google until the tutor deletes them there.

---

## Why ICS subscription is not a substitute for API write

We ship **both**:

1. **ICS/webcal subscription feed** — zero OAuth scopes; works for Apple Calendar, Google Calendar "From URL," Outlook, and other clients.
2. **Google Calendar API write** — timely updates for Google-primary tutors.

An ICS feed is **polled by the subscriber's calendar service**, not pushed by Tutoring Notes. That architectural limit is why API write is still required for same-day accuracy on Google Calendar.

### Google's own documentation (external URL subscribe)

Google documents adding a public calendar **From URL** under Other calendars:

- [Subscribe to someone else's calendar — Use a link to add a public calendar](https://support.google.com/calendar/answer/37100) (`support.google.com/calendar/answer/37100`)

That flow is **read-only subscription**: the tutor pastes our HTTPS ICS URL; Google's infrastructure fetches the feed on **Google's schedule**. The help article does **not** offer a user-controlled refresh interval or a reliable manual "refresh now" control for URL subscriptions.

Community threads on Google's own support site (not normative, but consistent with observed behavior) describe **multi-hour to ~24-hour** delays before URL-linked calendars reflect changes — for example [Google Calendar does not sync URL-linked calendars within 12 hours as stated](https://support.google.com/calendar/thread/12658899/google-calendar-does-not-sync-url-linked-calendars-within-12-hours-as-stated) and [24-hour delay syncing a therapy-notes-style ICS feed](https://support.google.com/calendar/thread/101604273/i-have-a-24-hour-delay-in-syncing-my-therapy-notes-calendar-with-google-calendar).

**Engineering research (wave plan):** typical Google Calendar URL-subscribe refresh is on the order of **8–24 hours**, not user-configurable; `REFRESH-INTERVAL` / `X-PUBLISHED-TTL` hints in the feed are not honored for forcing faster Google fetches. Apple Calendar and Outlook use their own poll intervals (often faster on Apple, still not instant).

**Conclusion for reviewers:** ICS gives platform breadth and serves Apple-first tutors without scopes. It **cannot** replace `calendar.events.owned` for tutors who rely on Google Calendar and need session moves to appear the same day.

---

## Demo video script (Andrew films later)

Cross-ref [`CALENDAR-WAVE-PLAN.md` § Demo video requirements](CALENDAR-WAVE-PLAN.md#demo-video-requirements-get-it-right-the-first-time).

**Environment:** Staging/preview on the production app (In Production publishing status per Google guidance); crawlable URL; test tutor account with Google Calendar connected.

### Part A — Source Account Impact (`calendar.events.owned`)

1. **Create:** In Tutoring Notes, create a scheduled session (student, date, time). Open Google Calendar (web or mobile) on the **primary** calendar — show the new event matching the session.
2. **Edit:** Reschedule or change the session in the app. Return to Google Calendar — show the event updated **immediately** (same session, new time/title).
3. **Delete:** Cancel/delete the session in the app. Show the event removed from Google Calendar.

Narration: state that only `calendar.events.owned` + `userinfo.email` are requested; events are written only to calendars the tutor owns (primary); no watch/push/two-way sync.

### Part B — Immediacy vs ICS (pre-empt narrower-alternative review)

1. With the same session change from Part A (or a fresh reschedule), show Google Calendar already correct via API write.
2. Contrast: if the tutor also subscribes to the **ICS feed URL** in Google Calendar (Other calendars → From URL), explain that the subscribed copy will still show the **old** time until Google's next poll (many hours). Optionally show the stale subscribed calendar side-by-side, or state plainly on camera that Google documents URL subscription without instant refresh ([answer/37100](https://support.google.com/calendar/answer/37100)).
3. Mention ICS remains valuable for **Apple Calendar** and other clients without OAuth, but does not deliver Google-primary same-day accuracy.

### Part C — Do not center the demo on

- Old stub flows (`calendarList.list`, calendar count, "sync not live" messaging).
- Scopes we no longer request (`calendar.readonly`, broad `calendar.events`).

### Submission mechanics

- Reply on the **existing rejection email thread** with the video link, this justification summary, and updated privacy/terms URLs on the product (umbrella mortensenapps.com URLs unchanged on the consent screen).
- Written packet should include the refresh-latency argument above and the primary-calendar / `events.owned` rationale.
