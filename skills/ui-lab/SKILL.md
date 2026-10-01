---
name: ui-lab
description: Find and install interaction components from ui lab (lab.xevrion.dev), Yash Bavadiya's lab of small, polished React experiments built with Tailwind CSS v4 and Motion, such as a hold-to-delete button, an odometer counter, a flip card, a signature pad or a slide-to-confirm. Use when the user wants a crafted micro-interaction or animated component, mentions ui lab, lab.xevrion.dev or xevrion, or asks to add one of its components to a React or Next.js project.
---

# ui lab

[ui lab](https://lab.xevrion.dev) is a personal lab of small React interaction experiments, not a component library. Each one is a single TypeScript file with a live demo on its own page. Every experiment installs with one shadcn CLI command, which copies the file into the project so it can be read and changed like any other code.

## Find a component

- **Index:** `https://lab.xevrion.dev/r/registry.json` lists every experiment, with `name` (the slug), `title`, `description` and `categories`. Fetch it rather than guessing slugs; new ones are added often.
- **Plain-text overview:** `https://lab.xevrion.dev/llms.txt`.
- **Live demo:** `https://lab.xevrion.dev/lab/<slug>`. Point the user here to see it move before installing.

Match on what the user describes (the feel, the gesture, the job), not only on names. Descriptions say what each one does.

## Install

The project needs Tailwind CSS v4 and shadcn set up. If there is no `components.json`, run `npx shadcn@latest init` first. Then:

```bash
npx shadcn@latest add https://lab.xevrion.dev/r/<slug>.json
```

Use the project's package manager: `pnpm dlx shadcn@latest add …`, `yarn dlx shadcn@latest add …` or `bunx --bun shadcn@latest add …`. Several URLs can go in one command.

What lands in the project:

- `components/<slug>.tsx`, the component.
- `hooks/use-reduced-motion.ts`, a hydration-safe reduced-motion hook most of them share.
- Sometimes a small helper in `lib/`, such as `lib/preview-play.ts`.
- `motion`, plus any other npm package the file imports.
- A few CSS variables in `globals.css` for components that use them: `--marker`, `--shadow-raised`, `--shadow-wheel`, `--focus-ring`.

If the CLI says a shared file already exists, it is the same file from an earlier install, and skipping it is fine.

## Use it

- **Exports:** the named export is the component. The default export is the lab's demo, which renders it with sample content. Import the named export, and read the demo at the bottom of the file to see the props and a working example.
- **`usePreviewPlay()`:** returns `null` everywhere outside the lab's index cards. Leave it in; it changes nothing in an app.
- **Client components:** every file starts with `"use client"`. In the Next.js App Router, render them from a server component as usual.
- **Theme:** components use the shadcn theme tokens (`background`, `foreground`, `muted`, `muted-foreground`, `border`, `destructive`), so they follow the project's theme and dark mode.

## Changing them

Timing, easing, springs and reduced-motion handling are tuned on purpose, and the comments in each file explain why. Change content, sizes and colours freely. Keep the motion and the `useReducedMotion` branches unless the user asks otherwise.
