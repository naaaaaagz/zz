import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scriptStart = html.indexOf('<script type="module">') + '<script type="module">'.length;
const scriptEnd = html.indexOf("</script>", scriptStart);
if (scriptStart < '<script type="module">'.length || scriptEnd < 0) throw new Error("Standalone module script not found");

const code = html.slice(scriptStart, scriptEnd).replace(/^\s*import[^;]+;\s*/, "");
new Function(code);

const expectedDescription = "ZedTheCyclist bringás streamjeiről a clip-ek, térképen.";
const requiredText = [
  `content="${expectedDescription}"`,
  "clip-source-keywords",
  "setMissingStyleImageResolver",
  "active-cluster",
  "clip-hit-area",
  "title-label-background",
  "list-play-button",
  "vibecoded with love by nagz",
  "title-toggle",
  "country-borders-europe.geojson",
  "list-tab-wiggle",
  "maplibre-gl-shared.mjs",
];
for (const value of requiredText) {
  if (!html.includes(value)) throw new Error(`Missing standalone output: ${value}`);
}

console.log("Static HTML syntax and feature checks passed.");
