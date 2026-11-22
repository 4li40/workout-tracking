# Product requirements document: Progressive overload workout tracker

Version 1.2
Status: Finalized
Target stack: Next.js App Router, Convex, and Convex Auth with username and password

## 1. Product overview

### Problem statement

Tracking strength training in a notes app breaks down when progressive overload is the goal. Finding last week's weights requires scrolling through unstructured text. Calculating session volume or spotting personal records is manual. A notes app has no built-in rest timer and no progression chart to confirm week-over-week gains.

### Product vision

This project is a mobile-first web app built for progressive strength training. Every screen minimizes taps between sets, shows prior performance inline while you log, and tracks linear weight progression over time.

### Core objectives

- Log a completed set with weight, reps, and rest timer start in under 5 seconds with one hand.
- Show the previous session's numbers inline on every set row so the target to beat is visible at the point of entry.
- Compute working volume, estimated 1-rep max (e1RM), bodyweight rep records, and personal records (PRs) automatically for every exercise.

## 2. Target user and core use cases

The primary user is a lifter who trains regularly and logs workouts on a phone browser or installed PWA, then reviews history and charts on mobile or desktop. Most logging happens on a gym floor with short rest windows of 60 to 180 seconds and normal phone signal or Wi-Fi.

### Key user journeys

1. Sign up with a username and password, choose `kg` or `lb`, and receive seeded exercises plus starter workout templates.
2. Start a session from a saved template or launch a blank freestyle workout with equal ease.
3. Log sets against inline previous-session numbers, run the automatic rest timer, and see progression indicators and PR badges immediately.
4. Finish the workout, optionally update the source template with structural changes, and review workout history and per-exercise progression charts.

## 3. Functional requirements

### Phase 1: MVP

#### 3.1 Authentication, multi-user onboarding, and session management

- **Username and password sign-in.** Keep the existing `@convex-dev/auth` username and password setup in `convex/auth.ts`, `lib/serverAuth.ts`, and `app/signin/page.tsx`. No OAuth provider or transactional email service is needed for MVP.
- **Multi-user onboarding.** Every new account gets its own `userSettings` row and a set of starter templates, such as Push, Pull, and Legs, referencing the shared global exercise library. First-time users pick their preferred weight unit (`kg` or `lb`) during onboarding and can change it later in Settings.
- **Persistent sessions.** Keep users signed in across browser restarts and PWA launches with `httpOnly` refresh cookies so lifters are not signed out mid-workout.
- **Fail-closed route protection.** Update `proxy.ts` to protect every route except `/signin` and `/auth/*` so new pages under `app/(app)` are never exposed publicly by mistake.

#### 3.2 Exercise library and workout templates

- **Global and custom exercises.** Seed a core library of compound, isolation, and bodyweight lifts. Let each user create custom exercises with `name`, `muscleGroup`, `equipment`, and an `isBodyweight` flag.
- **Bodyweight exercise support.** Exercises marked `isBodyweight: true`, such as pull-ups and dips, allow `weight = 0` for bodyweight-only sets or a positive value for added external load.
- **Workout templates.** Let users create, edit, reorder, duplicate, and delete templates containing ordered exercises, default set counts, target rep counts or ranges, and default rest durations.
- **Equal-priority session launch.** Give **Start from template** and **Start freestyle workout** equal prominence on the workouts home screen. Users run both flows regularly.

#### 3.3 Active workout logger

- **Single active workout invariant.** Enforce at most one `in_progress` workout per user in Convex. Show a persistent resume bar across app pages whenever a session is active.
- **Inline previous performance.** Display the matching set from the user's most recent completed session of that exercise beside the active inputs, such as `Prev: 80 kg x 8`. Match by `setType` and ordinal within that type, such as working set 1 against prior working set 1, so changing warm-up count does not shift working targets.
- **Unit-aware fast entry.** Render weights in the user's preferred Settings unit (`kg` or `lb`) with numeric keypads, one-tap copy-from-previous, quick steppers (`+1 rep`, `+2.5 kg` or `+5 lb`), and a prominent completion toggle.
- **Set tagging.** Support four set types: `warmup`, `working`, `drop`, and `failure`. Exclude `warmup` sets from PRs and working-volume calculations.
- **Live rest timer.** Start the timer automatically when a working set is checked off. Anchor controls (`-15s`, `+15s`, `Skip`) in a persistent bar, trigger audio or vibration cues on completion, and compute remaining time from a persisted `restTimerEndsAt` timestamp so screen locks and reloads stay accurate.
- **Private sticky exercise notes.** Store per-user cues, such as seat pin height, separately from global exercise rows and separately from single-session workout notes.
- **Auto-save and local draft recovery.** Persist every set change through Convex optimistic updates and keep a lightweight local draft of the active workout in `localStorage` for brief signal drops. Full offline mutation queuing across closed browser tabs is out of scope for MVP.
- **Mid-workout edits.** Allow reordering exercises, adding or removing sets, and swapping exercises without modifying the underlying template. On finish, offer **Update template with today's changes** to sync structural edits (exercise list, order, target set count, and rest duration) back to the template.

#### 3.4 Progressive overload tracking and history

- **Linear progression indicators.** Highlight completed sets that beat the previous session's weight, beat reps at the same weight, or beat set volume. Surface linear next-session weight targets based on prior working sets and the user's unit increment (`+2.5 kg` or `+5 lb`).
- **PR detection engine.** Track four PR types for non-warmup sets:
  - **Weight PR.** Heaviest load lifted for an exercise (or heaviest added load for bodyweight exercises).
  - **Estimated 1RM PR.** Computed with the Epley formula `e1RM = w * (1 + r / 30)` for sets with `w > 0`.
  - **Bodyweight Rep PR.** Highest reps in a single set at `weight = 0` for `isBodyweight` exercises.
  - **Session Volume PR.** Highest total working volume `sum(w * r)` in one session for weighted lifts, or highest total working reps in one session for zero-weight bodyweight sets.
- **Accurate PR recalculation.** Recompute affected exercise PR records whenever a workout finishes, is edited, or is deleted so history fixes never leave stale PR flags.
- **Workout history.** Show completed workouts in reverse chronological order with date, title, duration, working set count, total volume, and PR count. Support full edit and delete on past workouts.
- **Exercise progression dashboard.** Provide per-exercise interactive time-series charts for e1RM, top-set weight, working volume per session, and max reps per set for bodyweight exercises.

### Phase 2: Post-MVP enhancements

- Double progression targets and automated rep-range progression rules.
- Superset and circuit grouping with alternating rest timer behavior.
- Optional RPE (1 to 10) or RIR (0 to 5) column per set.
- Barbell plate loading calculator modal.
- One-click JSON and CSV data export and import.

## 4. Data model

All application tables live in `convex/schema.ts` alongside the tables managed by `@convex-dev/auth`. Store weights canonically in kilograms (`weightKg`) along with `enteredUnit` so switching between `kg` and `lb` in Settings converts historical values cleanly without corrupting stored numbers.

| Table | Purpose | Key fields and indexes |
|---|---|---|
| `users` | Auth identity managed by Convex Auth | Managed by `@convex-dev/auth` |
| `userSettings` | Per-user preferences and onboarding state | `userId`, `unit` (`"kg" \| "lb"`), `defaultRestSeconds`, `onboardingCompleted`. Index: `by_user` |
| `exercises` | Global seeded lifts and user custom lifts | `userId` (optional; absent for global lifts), `name`, `muscleGroup`, `equipment`, `isBodyweight`. Indexes: `by_user`, `by_muscleGroup` |
| `userExerciseNotes` | Private per-user sticky cues on any exercise | `userId`, `exerciseId`, `notes`. Index: `by_user_exercise` |
| `workoutTemplates` | Reusable workout routines per user | `userId`, `title`, `sortOrder`, `lastPerformedAt`. Index: `by_user_order` |
| `templateExercises` | Ordered exercises inside a template | `userId`, `templateId`, `exerciseId`, `orderIndex`, `targetSets`, `targetReps`, `restSeconds`. Index: `by_template_order` |
| `workouts` | Individual live and completed sessions | `userId`, `templateId` (optional), `title`, `status` (`"in_progress" \| "completed"`), `startedAt`, `finishedAt`, `notes`, `restTimerEndsAt`. Indexes: `by_user_status`, `by_user_finishedAt` |
| `workoutExercises` | Exercises performed in a workout | `userId`, `workoutId`, `exerciseId`, `orderIndex`, `restSeconds`, `workoutStatus`, `completedAt`. Indexes: `by_workout_order`, `by_user_exercise_completedAt` |
| `sets` | Logged sets for each workout exercise | `userId`, `workoutId`, `workoutExerciseId`, `exerciseId`, `setNumber`, `setType`, `weightKg`, `enteredUnit`, `reps`, `completed`, `completedAt`. Indexes: `by_workoutExercise_number`, `by_user_exercise_completedAt` |
| `exerciseRecords` | Materialized PR state per user and exercise | `userId`, `exerciseId`, `bestWeightKg`, `bestE1rmKg`, `bestSessionVolumeKg`, `bestBodyweightReps`, `updatedAt`. Index: `by_user_exercise` |

## 5. UX, ergonomics, and design system

- **Mobile-first ergonomics.** Place primary actions (checking off a set, stepping weight and reps, adjusting the rest timer) within thumb reach with tap targets of at least 44 by 44 px and numeric mobile keyboards.
- **Visual identity.** Use a light-first white and blue design modeled after `hevy.com`, built with the Figtree typeface and clean high-contrast surfaces:
  - Page canvas `#F7F9FB`, card and navigation surface `#FFFFFF`, subtle input and secondary surface `#F2F4F7`, hairline borders `#E5E7EB`.
  - Primary text `#191A1B` and secondary text `#667085`.
  - Primary accent blue `#008CFF` (hover `#0077DB`, soft active tint `#EBF5FF`) for primary buttons, active navigation items, links, and active rest timer progress.
  - Status accents: completed set green `#16A34A` with soft wash `#ECFDF3`, PR badge amber `#D97706` with soft tint `#FEF3C7`, and destructive red `#EF4444`.
- **Responsive navigation.** Use a fixed white bottom navigation bar on mobile (`< md`) and a fixed white left sidebar on desktop (`>= md`) with five primary destinations: **Workouts** (templates plus freestyle launch), **History**, **Progress**, **Exercises**, and **Settings**. Active items highlight in `#008CFF`.
- **Focused active workout layout.** Keep the logger centered on the current exercise, inline `Prev` numbers, weight and rep inputs, and a persistent rest timer bar. Move secondary actions (delete set, swap exercise, exercise history) into drawers or menus.

## 6. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js App Router and React 19 | Routing, layouts, and client interactivity with Convex React hooks |
| Backend and database | Convex | Reactive queries, optimistic updates, indexed lookups, and end-to-end TypeScript types |
| Authentication | `@convex-dev/auth` with username and password | Already configured in the repository with `httpOnly` cookie refresh handlers and zero external credentials |
| Validation | TypeScript and Convex `v` validators | Strict runtime and compile-time checks at every backend boundary without adding Zod or React Hook Form for MVP |
| Styling and components | Tailwind CSS v4, shadcn/ui, and Lucide icons | Owned accessible UI components styled with white and `#008CFF` blue tokens and Figtree typography |
| Charts | Recharts with shadcn/ui chart wrappers | Responsive time-series line and bar charts for progression dashboards |
| Mobile installability | Web App Manifest and PWA icons | Full-screen home-screen install experience on mobile browsers |

## 7. Non-functional requirements and success criteria

- **Perceived speed.** Checking off a set updates the UI in under 50 ms through optimistic updates and syncs to Convex automatically.
- **Session resilience.** An active workout survives page reloads, app switching, and screen locks without dropping sets or resetting the rest timer.
- **Success metrics.**
  - Replace the notes app for 100 percent of weekly workouts.
  - Keep average time to log a set under 5 seconds.
  - Lose zero workouts to accidental refreshes or brief connectivity drops.

## 8. Finalized product decisions

All initial product questions are resolved for MVP:

1. **Auth method.** Username and password via the existing `@convex-dev/auth` implementation.
2. **Weight units.** Support both `kg` and `lb`, selected globally in Settings and stored safely via canonical `weightKg` plus `enteredUnit`.
3. **Connectivity.** Convex optimistic updates plus a lightweight local active-workout draft; no full offline mutation queue in MVP.
4. **Progression style.** Linear weight progression across sessions, with double progression deferred to Phase 2.
5. **Bodyweight movements.** Supported via `isBodyweight` exercises allowing `0` weight or added load, including bodyweight rep PR tracking.
6. **User scope.** Multi-user from day one, including per-user onboarding, private exercise notes, and starter templates for new accounts.
7. **Workout flow.** Templates and freestyle workouts have equal priority on the main workout screen.
8. **Visual style and navigation.** Light-first white and `#008CFF` blue palette modeled after `hevy.com`, using a bottom navigation bar on mobile and a left sidebar on desktop.
