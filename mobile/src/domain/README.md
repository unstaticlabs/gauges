# Domain

This folder holds the pure TypeScript model of a gauge and its rules.

- Do not import React, React Native, Expo, or Firebase here.
- Do not read the clock. Each function that needs the time gets `now` as a
  parameter.
- Import from `@/domain`. `index.ts` exports the public API.
- Write a unit test for each rule. Tests go in `__tests__/`. Test helpers go
  in `__testSupport__/`.

| File | Rule |
|---|---|
| `tone.ts` | The color of a level: green above 50, orange above 25, red for the rest. |
| `level.ts` | The level of a gauge from 0 to 100, and the three curves. |
| `pause.ts` | The pause of a gauge: when a gauge is paused, the time that empties it, and the fields of a pause and a resume. |
| `label.ts` | The level of a label from the levels of its gauges, in the mode of the label: the worst gauge, the mean of the lower half (the default), the median, or the mean of all. Archived and paused gauges do not count. |
| `groups.ts` | The grouped home view: one group for each label, the worst first, and the gauges with no label. The search and the match of label names. |
| `sort.ts` | The order of the home list (the paused gauges last), the split of active and archived gauges, and the number of low gauges for the greeting. |
| `search.ts` | The search by name, without case and accents. |
| `avatars.ts` | The order of the member avatars, the most recent execution first. |
| `executions.ts` | Add, change, and remove one execution. The pair `at` + `by` identifies it. |
| `reminders.ts` | The reminder plan for the next days, in the local time zone. |

The test `reminders.dst.test.ts` runs in the time zone `Europe/Paris`. It uses
the Jest environment in `__testSupport__/parisEnvironment.js`.

## The pause of a gauge

A paused gauge is a chore that does not apply for now, for example out of
season. It stays on the lists, after the active gauges. Its level keeps
the value of the start of the pause. After a resume, the gauge empties
again from that level: the paused time does not count.

The gauge has three optional fields:

| Field | What it holds |
|---|---|
| `pausedAt` | The start of the current pause, or `null`. |
| `pausedMs` | The paused time of the earlier pauses since the last execution, in milliseconds. |
| `pausedMsSince` | The time of the last execution when the app wrote `pausedMs`. |

The time that empties the gauge is:

```
elapsed = max(0, (pausedAt ?? now) - lastExecution - pausedMs)
```

A resume adds `now - pausedAt` to `pausedMs`, and sets `pausedAt` to
`null`. Two rules keep the fields safe when an earlier version of the app,
which does not know them, writes to the gauge:

- An execution after `pausedAt` ends the pause. The gauge is then active
  from that execution.
- `pausedMs` counts only while `pausedMsSince` is the time of the last
  execution. A new execution, or a change or a removal of the last
  execution, drops it.

Paused gauges get no reminder, do not count in the greeting or in the
level of a label, and an archive hides them the same as an active gauge.
