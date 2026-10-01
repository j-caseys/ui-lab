import { readFile } from "node:fs/promises";
import path from "node:path";
import { lab, type LabEntry } from "@/lab/registry";
import { absoluteUrl, labPath, site } from "@/lib/site";

// Turns an experiment's source into a shadcn registry item, so it installs
// with one `shadcn add` and lands in someone else's project working. The file
// is the same one the page runs; only its imports and colour names change on
// the way out.

const root = process.cwd();

// The site's own tokens, renamed to the shadcn ones that mean the same thing,
// so a component picks up whatever theme it lands in. Ours "muted" is grey
// text, theirs is a grey fill; their text is "muted-foreground".
const TOKENS: Record<string, string> = {
  muted: "muted-foreground",
  surface: "muted",
  danger: "destructive",
};
const COLOR_UTILITY =
  /\b(text|bg|fill|stroke|border|ring|outline|from|via|to|divide|decoration|caret|accent|placeholder)-(muted|surface|danger)(?![\w-])/g;
const CSS_VAR = /(?<![\w-])--(color-)?(muted|surface|danger)(?![\w-])/g;

function retheme(source: string) {
  return source
    .replace(COLOR_UTILITY, (_, utility, token) => `${utility}-${TOKENS[token]}`)
    .replace(CSS_VAR, (_, prefix = "", token) => `--${prefix}${TOKENS[token]}`);
}

// Tokens the site has and a shadcn theme doesn't, shipped with the items that
// use them. Values are the site's, split out of its light-dark() pairs.
const EXTRA_VARS = {
  marker: {
    light: "#d93d31",
    dark: "#ff6b5f",
    theme: { "color-marker": "var(--marker)" },
  },
  "focus-ring": {
    light: "oklch(0.2 0 0 / 0.38)",
    dark: "oklch(0.95 0 0 / 0.45)",
  },
  "shadow-raised": {
    light:
      "0 0 0 1px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.06), 0 6px 16px -6px oklch(0 0 0 / 0.12)",
    dark: "0 0 0 1px oklch(1 0 0 / 0.08), 0 1px 2px oklch(0 0 0 / 0.4), 0 6px 16px -6px oklch(0 0 0 / 0.6)",
    theme: { "shadow-raised": "var(--shadow-raised)" },
  },
  "shadow-wheel": {
    light: "inset 0 1px 2px oklch(0 0 0 / 0.08), inset 0 0 0 1px oklch(0 0 0 / 0.04)",
    dark: "inset 0 1px 2px oklch(0 0 0 / 0.5), inset 0 0 0 1px oklch(1 0 0 / 0.04)",
    theme: { "shadow-wheel": "var(--shadow-wheel)" },
  },
} satisfies Record<
  string,
  { light: string; dark: string; theme?: Record<string, string> }
>;

function usesVar(source: string, name: string) {
  // --marker as a variable, or bg-marker / shadow-raised as a utility.
  return new RegExp(`(?<![\\w-])(?:--|[a-z]+-)?${name}(?![\\w-])`).test(source);
}

// The site's helpers, rehomed to where a shadcn project keeps such things.
// Each one travels inside every item that imports it, so an install never
// depends on a second request.
const LOCAL: Record<
  string,
  { to: string; file?: string; type?: string; target?: string }
> = {
  "@/lib/cn": { to: "@/lib/utils" },
  "@/lib/use-reduced-motion": {
    to: "@/hooks/use-reduced-motion",
    file: "lib/use-reduced-motion.ts",
    type: "registry:hook",
    target: "hooks/use-reduced-motion.ts",
  },
  "@/lab/preview-play": {
    to: "@/lib/preview-play",
    file: "lab/preview-play.ts",
    type: "registry:lib",
    target: "lib/preview-play.ts",
  },
  "@/lib/signature": {
    to: "@/lib/signature",
    file: "lib/signature.ts",
    type: "registry:lib",
    target: "lib/signature.ts",
  },
  "@/lab/data/contributions.json": {
    to: "@/lib/contributions.json",
    file: "lab/data/contributions.json",
    type: "registry:lib",
    target: "lib/contributions.json",
  },
};

// Provided by React and Next.js themselves, never installed.
const BUILT_IN = /^(react|react-dom|next)(\/|$)/;

function importsOf(source: string) {
  return [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
}

export async function registryItem(entry: LabEntry) {
  const raw = await readFile(
    path.join(root, "src/lab/components", `${entry.slug}.tsx`),
    "utf8",
  );
  const imports = importsOf(raw);
  let content = raw;
  const files = [];
  const dependencies = new Set<string>();
  const registryDependencies = new Set<string>();

  for (const spec of imports) {
    const local = LOCAL[spec];
    if (local) {
      content = content.replaceAll(`"${spec}"`, `"${local.to}"`);
      if (spec === "@/lib/cn") registryDependencies.add("utils");
      if (local.file) {
        files.push({
          path: local.target!,
          type: local.type!,
          target: local.target!,
          content: await readFile(path.join(root, "src", local.file), "utf8"),
        });
      }
    } else if (spec.startsWith("@/")) {
      throw new Error(`${entry.slug}: no registry home for ${spec}`);
    } else if (!BUILT_IN.test(spec)) {
      // "motion/react" installs as "motion", "@scope/pkg/x" as "@scope/pkg".
      const parts = spec.split("/");
      dependencies.add(
        spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0],
      );
    }
  }
  content = retheme(content);

  const cssVars: Record<"light" | "dark" | "theme", Record<string, string>> = {
    light: {},
    dark: {},
    theme: {},
  };
  for (const [name, value] of Object.entries(EXTRA_VARS)) {
    if (!usesVar(content, name)) continue;
    cssVars.light[name] = value.light;
    cssVars.dark[name] = value.dark;
    Object.assign(cssVars.theme, "theme" in value ? value.theme : {});
  }
  const hasVars = Object.keys(cssVars.light).length > 0;

  return {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: entry.slug,
    type: "registry:component",
    title: entry.name,
    description: entry.description,
    author: `${site.author.name} <${site.author.url}>`,
    dependencies: [...dependencies],
    registryDependencies: [...registryDependencies],
    files: [
      {
        path: `components/${entry.slug}.tsx`,
        type: "registry:component",
        content,
      },
      ...files,
    ],
    ...(hasVars && { cssVars }),
    categories: [entry.category],
    docs: `From ${site.name}: ${absoluteUrl(labPath(entry.slug))}`,
  };
}

export function registryIndex() {
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "ui-lab",
    homepage: absoluteUrl("/"),
    items: lab.map((entry) => ({
      name: entry.slug,
      type: "registry:component",
      title: entry.name,
      description: entry.description,
      categories: [entry.category],
      files: [
        {
          path: `components/${entry.slug}.tsx`,
          type: "registry:component",
        },
      ],
    })),
  };
}
