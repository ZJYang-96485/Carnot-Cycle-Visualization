import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the thermodynamic visualizer shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Thermodynamic Engine Visualizer<\/title>/i);
  assert.match(html, /Thermodynamic Engine Visualizer/);
  assert.match(html, /Reversible Carnot cycle/);
  assert.match(html, /Hot reservoir/);
  assert.match(html, /Curzon–Ahlborn finite-time cycle/);
  assert.doesNotMatch(html, /four-stroke|spark-ignition|crank angle/i);
  assert.match(html, /Pressure–volume cycle/);
  assert.match(html, /30\.8%/);
  assert.match(html, /882 J/);
  assert.match(html, /1\.74×/);
  assert.match(html, /aria-label="Heat-capacity ratio"[^>]*value="5\/3"/);
  assert.match(html, /<html lang="en"/);
  assert.match(html, /<form novalidate=""/i);
  assert.match(html, /aria-label="Cold reservoir"[^>]*step="any"/);
  assert.doesNotMatch(html, /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|Codex/);
});

test("removes the disposable starter preview and four-stroke model", async () => {
  const [page, layout, packageJson, css, thermalModel, visualizer] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/carnot.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ThermoVisualizer.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /ThermoVisualizer/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.match(layout, /Thermodynamic Engine Visualizer/);
  assert.doesNotMatch(layout, /Starter Project|next\/font\/google/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(css, /\.input-control-row input\s*\{[\s\S]*min-width:\s*0/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(thermalModel, /buildCurzonAhlbornCycle/);
  assert.match(thermalModel, /Math\.sqrt\(inputs\.T_hot \* inputs\.T_cold\)/);
  assert.doesNotMatch(visualizer, /four-stroke|spark-ignition|crank angle|EngineScene|EngineChart/i);
});
