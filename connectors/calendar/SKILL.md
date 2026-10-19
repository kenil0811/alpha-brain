---
name: calendar
description: The person's meetings and events, with attendees linked to the people Alpha knows.
---

# Calendar

- `connect(what="events", start, end)` takes ISO times (or `world_query` over the `events`
  view); use NOW, given with each sentence, for "today" and "this week". All-day events have
  `all_day: true`. `connect(what="calendar")` connects the calendars or reads their changes.
- Every attendee with an email address is a person entity; `world_search` with their email
  gives what Alpha knows about them across sources.
- If access isn't granted, say that macOS asks once and the person can allow it in System
  Settings › Privacy & Security › Calendars.
- Adding or changing events is an outbound write and isn't available in this version.
