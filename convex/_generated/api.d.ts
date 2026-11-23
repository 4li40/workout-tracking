/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as exercises from "../exercises.js";
import type * as history from "../history.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_exercises from "../lib/exercises.js";
import type * as lib_globalExercises from "../lib/globalExercises.js";
import type * as lib_prEngine from "../lib/prEngine.js";
import type * as lib_records from "../lib/records.js";
import type * as lib_restTimerPush from "../lib/restTimerPush.js";
import type * as lib_settings from "../lib/settings.js";
import type * as lib_starterTemplates from "../lib/starterTemplates.js";
import type * as lib_templates from "../lib/templates.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_webPush from "../lib/webPush.js";
import type * as lib_workouts from "../lib/workouts.js";
import type * as progression from "../progression.js";
import type * as push from "../push.js";
import type * as seed from "../seed.js";
import type * as templates from "../templates.js";
import type * as userSettings from "../userSettings.js";
import type * as users from "../users.js";
import type * as workouts from "../workouts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  exercises: typeof exercises;
  history: typeof history;
  "lib/auth": typeof lib_auth;
  "lib/exercises": typeof lib_exercises;
  "lib/globalExercises": typeof lib_globalExercises;
  "lib/prEngine": typeof lib_prEngine;
  "lib/records": typeof lib_records;
  "lib/restTimerPush": typeof lib_restTimerPush;
  "lib/settings": typeof lib_settings;
  "lib/starterTemplates": typeof lib_starterTemplates;
  "lib/templates": typeof lib_templates;
  "lib/validators": typeof lib_validators;
  "lib/webPush": typeof lib_webPush;
  "lib/workouts": typeof lib_workouts;
  progression: typeof progression;
  push: typeof push;
  seed: typeof seed;
  templates: typeof templates;
  userSettings: typeof userSettings;
  users: typeof users;
  workouts: typeof workouts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authUsername: import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">;
};
