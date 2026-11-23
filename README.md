# Welcome to your Convex + Next.js + Convex Auth app

This is a [Convex](https://convex.dev/) project created with [`npm create convex`](https://www.npmjs.com/package/create-convex).

After the initial setup (<2 minutes) you'll have a working full-stack app using:

- Convex as your backend (database, server logic)
- [React](https://react.dev/) as your frontend (web page interactivity)
- [Next.js](https://nextjs.org/) for optimized web hosting and page routing
- [Tailwind](https://tailwindcss.com/) for building great looking accessible UI
- [Convex Auth](https://docs.convex.dev/auth/convex-auth) for authentication (username + password sign-in)

## Get started

If you just cloned this codebase and didn't use `npm create convex`, run:

```
npm install
npm run dev
```

This project needs npm 11 or newer (Node 24 ships it). npm 10 cannot install `package-lock.json`.

## Seeding the exercise library

The shared global exercise library is seeded by the idempotent internal mutation `seed:seedGlobalExercises`. `npm run dev` runs it on every start against your dev deployment. Running it again inserts nothing new and only corrects drifted rows.

For a production deployment, run it once after the first deploy and again whenever `convex/lib/globalExercises.ts` changes:

```
npx convex run seed:seedGlobalExercises --prod
```

## Background rest timer alerts (Web Push / VAPID)

Optional server-scheduled Web Push notifications can alert lifters when a rest timer finishes while the phone is locked or the PWA is backgrounded. To enable them on your Convex deployment, generate a VAPID key pair and set the three Convex environment variables:

```bash
npx web-push generate-vapid-keys
npx convex env set VAPID_PUBLIC_KEY "<public-key>"
npx convex env set VAPID_PRIVATE_KEY "<private-key>"
npx convex env set VAPID_SUBJECT "mailto:alerts@example.com"
```

Mobile PWA notes:

- **iOS / iPadOS (16.4+):** Web Push only works after installing the app via **Share -> Add to Home Screen** and enabling **Background rest alerts** in Settings. Live-ticking lock-screen widgets (Live Activities) are native-only on iOS and not available to web PWAs.
- **Android / Desktop:** Web Push delivers completion alerts when backgrounded or locked. The **Keep screen awake** toggle in Settings uses the Screen Wake Lock API while an active workout is open.

If you're reading this README on GitHub and want to use this template, run:

```
npm create convex@latest -- -t nextjs-convexauth
```

## Learn more

To learn more about developing your project with Convex, check out:

- The [Tour of Convex](https://docs.convex.dev/get-started) for a thorough introduction to Convex principles.
- The rest of [Convex docs](https://docs.convex.dev/) to learn about all Convex features.
- [Stack](https://stack.convex.dev/) for in-depth articles on advanced topics.
- [Convex Auth docs](https://docs.convex.dev/auth/convex-auth) for documentation on the Convex Auth library.

## Configuring other authentication methods

This template signs users in with a username and a password. To add other login methods, such as GitHub, Google, Apple, passkeys or email + password, see the login provider guides in the [Convex Auth docs](https://docs.convex.dev/auth/convex-auth). For the Next.js-specific wiring (the `app/auth/` route handlers, `proxy.ts` and `lib/`), see [Setting up Next.js](https://docs.convex.dev/auth/convex-auth/ssr-nextjs/setup).

## Join the community

Join thousands of developers building full-stack apps with Convex:

- Join the [Convex Discord community](https://convex.dev/community) to get help in real-time.
- Follow [Convex on GitHub](https://github.com/convex/), star and contribute to the open-source implementation of Convex.
