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
| `label.ts` | The level of a label: the mean of the worse half of its gauges. |
| `groups.ts` | The grouped home view: one group for each label, the worst first, and the gauges with no label. The search and the match of label names. |
| `sort.ts` | The order of the home list, and the split of active and archived gauges. |
| `search.ts` | The search by name, without case and accents. |
| `avatars.ts` | The order of the member avatars, the most recent execution first. |
| `executions.ts` | Add, change, and remove one execution. The pair `at` + `by` identifies it. |
| `reminders.ts` | The reminder plan for the next days, in the local time zone. |

The test `reminders.dst.test.ts` runs in the time zone `Europe/Paris`. It uses
the Jest environment in `__testSupport__/parisEnvironment.js`.
