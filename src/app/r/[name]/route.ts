import { getEntry, lab } from "@/lab/registry";
import { registryIndex, registryItem } from "@/lib/registry-item";

// The shadcn registry: /r/<slug>.json for each experiment, /r/registry.json
// for the list. All of it is written at build from the component files, so
// what installs is always what the page runs.
export const dynamicParams = false;

export function generateStaticParams() {
  return [
    { name: "registry.json" },
    ...lab.map(({ slug }) => ({ name: `${slug}.json` })),
  ];
}

export async function GET(_: Request, { params }: RouteContext<"/r/[name]">) {
  const { name } = await params;
  if (name === "registry.json") return Response.json(registryIndex());
  const entry = getEntry(name.replace(/\.json$/, ""));
  if (!entry) return new Response("Not found", { status: 404 });
  return Response.json(await registryItem(entry));
}
