# ZedTheCyclist Pilgrimage Map

An interactive map of memorable clips from ZedTheCyclist's journeys. Places are loaded from the public pilgrimage spreadsheet and shown on a dark, zoomable map with Twitch clip playback.

## Open the standalone map

Double-click `open-map.cmd`. It opens the standalone map through a small local web address, which Twitch requires for embedded clip playback. Keep the command window open while using it.

Opening `index.html` directly still displays the map and pins, but Twitch rejects clip embeds on `file://` pages.

## Local development

```bash
pnpm install
pnpm dev
```
