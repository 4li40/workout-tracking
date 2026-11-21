# Product Requirements Document (PRD): Progressive Overload Workout Tracker

**Version:** 1.1  
**Status:** Draft (Pending Open Questions)  
**Target Stack:** Next.js (App Router) + Convex + Convex Auth  

---

## 1. Product Overview

### Problem Statement
Tracking strength training in a generic Notes app breaks down as soon as progressive overload becomes the goal. Finding last week's working weights requires scrolling through unstructured text, calculating total volume or spotting rep PRs is manual, and there is no built-in rest timing or visual trendline to confirm whether strength is actually progressing across weeks.

### Product Vision
A fast, mobile-first web application purpose-built for progressive strength training. Every screen is optimized to minimize friction between sets, surface previous performance directly inline while logging, and make week-over-week progression unmistakable.

### Core Objectives
* **Eliminate logging friction:** Log a completed set (weight, reps, and rest timer trigger) in under 5 seconds with one hand.
* **Surface progressive overload at the point of action:** Show the previous session's exact numbers inline for every set so the target to beat is always visible.
* **Turn raw logs into progression insights:** Automatically compute volume, estimated 1-rep max (e1RM), and personal records (PRs) per exercise.

---

## 2. Target User & Core Use Cases

* **Primary User:** A strength-focused lifter training consistently who needs a reliable, distraction-free gym log on a phone browser (or installed PWA) and deeper analytics on desktop.
* **Primary Context:** Mid-workout on a gym floor with sweaty hands, short rest windows (60–180 seconds), and occasionally spotty Wi-Fi.

### Key User Journeys
1. **Pre-Workout Setup:** Create reusable workout templates (e.g., Push, Pull, Legs) with ordered exercises, target set counts, and rep ranges, or start an empty freestyle session.
2. **In-Gym Execution:** Launch today's session, view last session's weight/reps as ghost placeholders on each row, log each set as it finishes, trigger an automatic rest timer, and get immediate visual confirmation when beating a previous mark.
3. **Post-Workout Review:** Review session summary (duration, total volume lifted, PRs hit) and inspect multi-week progression charts for specific lifts to adjust upcoming targets.

---

## 3. Functional Requirements

### Phase 1: MVP (Core Loop)

#### 3.1 Authentication & Session Management
* **Sign-In Methods:** Support one or more native Convex Auth methods—OAuth (Google, Apple, GitHub), Passkeys, Username + Password, or Email + Password.
  * *Scope note:* Choosing **OAuth** or **Passkeys** avoids needing a transactional email service for MVP, whereas **Email + Password** requires pairing with an email provider (e.g., Resend) for verification and password reset links.
* **Persistent Gym Sessions:** Keep users signed in across browser restarts and PWA launches via `httpOnly` refresh cookies so lifters are never kicked to a login screen mid-workout.
* **Route Protection:** Guard all workout logging, template, and progression routes behind authentication, while keeping sign-in, sign-up, and OAuth/verification callback routes publicly accessible.

#### 3.2 Exercise Library & Workout Templates
* **Exercise Management:** Pre-seeded core compound and isolation lifts plus custom exercise creation (name, primary muscle group, equipment type, optional notes).
* **Workout Templates:** Create, edit, reorder, and duplicate routines containing a list of exercises, default number of sets, target rep range (e.g., 8–10 reps), and default rest duration per exercise.
* **Session Launch:** Start a live workout directly from a template (pre-populating all exercises and set rows) or start a blank workout and add exercises on the fly.

#### 3.3 Active Workout Logger
* **Inline Previous Performance:** Every set row displays the corresponding set from the most recent completed session of that exercise (e.g., `Prev: 80 kg x 8`) right beside the active inputs.
* **Fast Set Entry:** Numeric inputs for weight and reps, one-tap copy-from-previous or quick-increment steppers (+1 rep, +2.5 kg / +5 lb), and a prominent completion toggle per set.
* **Set Tagging:** Distinguish between **Warm-up**, **Working**, **Drop**, and **Failure** sets (warm-up sets are excluded from PR and working-volume calculations by default).
* **Live Rest Timer:** Automatically starts when a working set is checked off, anchored in a persistent bottom/top bar with `-15s`, `+15s`, `Skip`, and audible/vibration completion cues.
* **Exercise Notes:** Sticky per-exercise notes (e.g., seat pin height, cue reminders) that persist across sessions, separate from single-session notes.
* **Real-Time Auto-Save:** Every logged set persists immediately so accidental tab refreshes or locked screens never drop workout data.
* **Mid-Workout Flexibility:** Reorder exercises, add/remove sets, or swap an exercise mid-session without altering the underlying template (with an optional prompt at finish: *"Update template with today's changes?"*).

#### 3.4 Progressive Overload Tracking & History
* **Automatic Progression Indicators:** Visual indicator on a completed set when it beats the prior session's weight, reps at the same weight, or set volume.
* **PR Detection Engine:** Automatically flag:
  * **Weight PR:** Heaviest load lifted for the exercise.
  * **Estimated 1RM PR:** Calculated via the Epley formula: $\text{e1RM} = w \times \left(1 + \frac{r}{30}\right)$, where $w$ is weight and $r$ is reps.
  * **Session Volume PR:** Highest total working volume ($\sum w \times r$) achieved for that exercise in a single workout.
* **Workout History:** Reverse-chronological log of completed workouts showing date, title, duration, total working sets, total volume, and PR count, with full edit/delete capability for fixing typos later.
* **Exercise Progression Dashboard:** Per-exercise view with interactive time-series charts for:
  * Estimated 1RM trend
  * Top-set weight trend
  * Total working volume per session

---

### Phase 2: Post-MVP Enhancements
* **Double Progression Targets:** Auto-suggest next session's target (e.g., *"Hit 10 reps on all 3 sets last time — increase weight by 2.5 kg today"*).
* **Superset & Circuit Grouping:** Visually link paired exercises and adjust rest timer behavior between alternating sets.
* **RPE / RIR Tracking:** Optional Rate of Perceived Exertion (1–10) or Reps in Reserve (0–5) column.
* **Plate Calculator:** Quick modal showing exact barbell plate loading per side for a target weight.
* **Data Export & Import:** One-click JSON/CSV export so workout history is never locked in.

---

## 4. Conceptual Data Model

Designed for Convex's document-relational model with indexed queries for fast previous-session lookups and native Convex Auth integration:

| Table | Purpose | Key Fields & Relationships |
|---|---|---|
| **users** *(Convex Auth-managed)* | Core identity & auth accounts | Managed natively by Convex Auth alongside its session tables—no external identity provider ID sync required. |
| **userSettings** *(1:1 with `users`)* | App-specific training preferences | User ID (`users` reference), preferred unit (`kg` or `lb`), default rest timer duration, progression preferences. Kept separate from `users` to avoid coupling auth schema updates with app settings. |
| **exercises** | Global + user-defined movements | User ID (nullable for defaults), name, muscle group, equipment, sticky setup notes |
| **workoutTemplates** | Reusable routine definitions | User ID, title, sort order, last performed timestamp |
| **templateExercises** | Ordered lifts inside a template | Template ID, exercise ID, order index, target set count, target rep range, rest seconds |
| **workouts** | Individual workout sessions | User ID, template ID (optional), title, status (`in_progress` / `completed`), started/finished timestamps, session notes |
| **workoutExercises** | Exercises performed in a session | Workout ID, exercise ID, order index, rest seconds override |
| **sets** | Individual logged sets | Workout exercise ID, exercise ID (denormalized for fast history indexing), set number, set type, weight, reps, RPE (optional), completed boolean, PR flags |

---

## 5. UX, Ergonomics & Design System

* **Mobile-First Gym Ergonomics:** All primary actions (checking off a set, adjusting weight/reps, modifying rest timer) sit within thumb reach with generous tap targets (minimum 44x44 px) and trigger numeric keypads automatically.
* **Visual Identity — Athletic Slate & Ember:** Dark-first interface tailored for bright overhead gym lighting and low eye strain. Deep slate surfaces establish visual hierarchy, crisp off-white typography ensures readability at arm's length, and high-energy ember accents highlight active rest timers, completed sets, and PR badges.
* **Zero-Clutter Hierarchy:** Keep the active workout view focused strictly on the current exercise, previous numbers, inputs, and timer—defer secondary controls (delete set, swap exercise, view history) into clean drawers or popovers.

---

## 6. Recommended Tech Stack

**Next.js (App Router)** paired with **Convex** provides real-time reactive queries, automatic TypeScript end-to-end types, and instant optimistic updates so logging a set feels immediate without manual REST endpoints or cache invalidation logic.

| Layer | Recommendation | Why It Fits This App |
|---|---|---|
| **Framework** | **Next.js (App Router) + React** | Handles routing, SSR/preloading of initial workout views, and client interactivity cleanly alongside Convex React hooks. |
| **Backend & Database** | **Convex** | Real-time state sync across devices, built-in optimistic updates for snappy set logging, and reactive queries for live PR/volume totals. |
| **Authentication** | **Convex Auth (`@convex-dev/auth`)** | Runs natively inside your Convex backend so user accounts and sessions live directly alongside your workout tables with zero third-party sync overhead. Integrates with Next.js App Router via auth route handlers (`/auth/signin`, `/auth/refresh`, `/auth/signout`) that keep refresh tokens secure in `httpOnly` cookies. |
| **Language & Validation** | **TypeScript + Convex Validators (`v`) + Zod** | Strict end-to-end type safety, Convex runtime validation on mutations, and Zod + React Hook Form for complex client forms (templates, custom exercises). |
| **Styling & Components** | **Tailwind CSS v4 + shadcn/ui + Lucide Icons** | Full ownership of accessible UI primitives (drawers, dialogs, tabs, toggles) styled cleanly with custom Athletic Slate & Ember CSS tokens. |
| **Charts & Analytics** | **shadcn/ui Charts (Recharts)** | Composable, responsive line and bar charts styled natively with Tailwind tokens for e1RM and volume progression graphs. |
| **Mobile Experience** | **PWA (Web App Manifest + Service Worker)** | Lets users install the site to their phone's home screen with full-screen standalone display and an app-like feel without building a separate native app. |
| **Hosting & Deployment** | **Vercel + Convex Cloud** | Zero-friction CI/CD preview deployments and fast edge delivery for Next.js paired with managed Convex infrastructure. |

---

## 7. Non-Functional Requirements & Success Criteria

* **Perceived Speed:** Checking off a set updates UI state instantaneously via optimistic updates (under 50ms perceived latency) and syncs reliably once network connectivity is available.
* **Session Resilience:** An in-progress workout survives browser reloads, app switching (e.g., changing music mid-workout), and screen locks without resetting the rest timer (timer calculates elapsed time against a saved start timestamp rather than an in-memory tick counter).
* **Success Metrics:**
  * Complete transition off the Notes app for 100% of weekly workouts.
  * Average time to log a set stays under 5 seconds.
  * Zero lost workout sessions due to accidental refreshes or brief connectivity drops.

---

## 8. Open Questions to Finalize This PRD

1. **Auth Sign-In Method:** Which Convex Auth sign-in method(s) should be included for MVP (e.g., Google OAuth only for fastest setup, Passkeys, or Email + Password)?
2. **Progression Style:** Do you follow a specific progressive overload method (e.g., *Double Progression* where you work up from 8 to 12 reps before adding weight, linear weight increases every session, or RPE/RIR-based training)?
3. **Weight Units:** Do you train strictly in `kg` or `lb`, or do you need per-exercise unit overrides (for example, `kg` on barbells and `lb` on cable machines)?
4. **Gym Connectivity:** Does your gym have total dead zones where full offline logging and background sync is a must-have for MVP, or do you generally have signal/Wi-Fi where optimistic updates + local draft recovery is enough?
5. **Workout Structure:** Do you follow a fixed rotating split (e.g., Push/Pull/Legs or Upper/Lower) where launching from templates is 90% of your sessions, or do you frequently log freestyle workouts?
6. **Single-User vs. Multi-User:** Are you building this strictly as a personal tool for yourself first, or do you want multi-user onboarding (sign-up flows, pre-populated starter templates for new users) built into the MVP from day one?