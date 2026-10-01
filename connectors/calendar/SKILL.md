---
name: calendar
description: The person's meetings and events, with attendees linked to the people Alpha knows.
---

# Calendar

- `calendar_events(start, end)` takes ISO times; use NOW in the pre-pack for "today" and
  "this week". All-day events have `all_day: true`.
- Every attendee with an email address is a person entity; use `entity_read` for what Alpha
  knows about them across sources.
- If access isn't granted, say that macOS asks once and the person can allow it in System
  Settings › Privacy & Security › Calendars.
- Adding or changing events is an outbound write and isn't available in this version.
