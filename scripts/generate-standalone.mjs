import { readFileSync, writeFileSync } from "node:fs";

const raw = readFileSync(new URL("../.standalone-sheet.txt", import.meta.url), "utf8");
const payload = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const value = (row, index) => row.c?.[index]?.v ?? "";

const places = payload.table.rows
  .map((row, index) => {
    const [latitude, longitude] = String(value(row, 3))
      .split(",")
      .map((part) => Number(part.trim()));
    return {
      id: index + 1,
      name: String(value(row, 0)),
      clipUrl: String(value(row, 1)),
      category: String(value(row, 2)),
      latitude,
      longitude,
      twitchTitle: String(value(row, 4)),
    };
  })
  .filter((place) => place.name && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));

const data = JSON.stringify(places).replaceAll("<", "\\u003c");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ZedTheCyclist Pilgrimage Map</title>
  <meta name="description" content="A map of ZedTheCyclist's journeys and Twitch clips.">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
  <style>
    :root{--ink:#071118;--panel:rgba(8,20,28,.88);--line:rgba(164,224,222,.16);--muted:#8ca4ae;--text:#e8f5f5;--accent:#51e3d8}
    *{box-sizing:border-box}html,body,#map{width:100%;height:100%;margin:0}body{background:var(--ink);color:var(--text);font-family:Arial,Helvetica,sans-serif;overflow:hidden}.shell{position:relative;width:100vw;height:100dvh;overflow:hidden}.header{position:fixed;z-index:1000;top:22px;left:22px;right:22px;display:flex;justify-content:space-between;align-items:center;pointer-events:none}.brand,.count,.hint{background:var(--panel);border:1px solid var(--line);box-shadow:0 18px 50px rgba(0,6,12,.28);backdrop-filter:blur(16px) saturate(125%)}.brand{pointer-events:auto;display:flex;align-items:center;gap:12px;padding:9px 15px 9px 9px;border-radius:14px;color:var(--text);text-decoration:none}.mark{width:39px;height:39px;border-radius:11px;display:grid;place-items:center;position:relative;background:linear-gradient(145deg,#56eadf,#208aa0);color:#06141b;font-size:22px;font-weight:900;font-style:italic}.mark:after{content:"";position:absolute;width:28px;height:28px;border:2px solid rgba(7,17,24,.3);border-radius:50%}.mark span{position:relative;z-index:1}.copy{display:grid;gap:1px}.copy strong{font-size:15px}.copy small{color:var(--muted);text-transform:uppercase;font-size:9px;letter-spacing:.18em}.count{padding:11px 15px;border-radius:999px;font-size:12px;color:#afc2c9;display:flex;align-items:center;gap:9px}.dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px rgba(81,227,216,.1),0 0 12px rgba(81,227,216,.6)}.hint{position:fixed;z-index:900;left:22px;bottom:36px;display:flex;align-items:center;gap:12px;border-radius:13px;padding:11px 14px;color:var(--muted);font-size:11px;line-height:1.45;pointer-events:none}.hint>span:last-child{display:grid}.hint strong{color:var(--text);font-size:12px}.mouse{width:18px;height:25px;border:1px solid #8fb2b8;border-radius:9px;position:relative}.mouse:after{content:"";position:absolute;top:5px;left:50%;width:2px;height:5px;background:var(--accent);transform:translateX(-50%)}.leaflet-container{background:#071118}.leaflet-bottom.leaflet-right{right:14px;bottom:26px}.leaflet-control-zoom{overflow:hidden;border:1px solid var(--line)!important;border-radius:8px!important;box-shadow:none!important}.leaflet-control-zoom a{background:rgba(8,20,28,.9)!important;color:#cde2e4!important;border-color:var(--line)!important}.leaflet-control-attribution{background:rgba(6,14,20,.72)!important;color:#728b94!important}.leaflet-control-attribution a{color:#9db5bd!important}.leaflet-tooltip{background:#0b1b24!important;color:#efffff!important;border:1px solid rgba(81,227,216,.24)!important;border-radius:9px!important;padding:8px 11px!important;box-shadow:0 10px 28px rgba(0,0,0,.4)!important;font-size:12px}.leaflet-tooltip-top:before{border-top-color:#0b1b24!important}.backdrop{position:fixed;inset:0;z-index:2000;display:none;place-items:center;padding:24px;background:rgba(2,8,13,.78);backdrop-filter:blur(9px)}.backdrop.open{display:grid}.modal{position:relative;width:min(920px,100%);padding:18px;border-radius:20px;background:#09161e;border:1px solid rgba(132,215,213,.22);box-shadow:0 34px 100px rgba(0,0,0,.52)}.heading{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:2px 2px 14px}.heading p{margin:0 0 4px;color:var(--accent);text-transform:uppercase;letter-spacing:.18em;font-size:9px;font-weight:700}.heading h2{margin:0;font-size:clamp(18px,2.2vw,25px)}.close{width:38px;height:38px;flex:0 0 38px;border-radius:50%;border:1px solid var(--line);background:rgba(255,255,255,.035);color:#d6e7e9;font-size:25px;cursor:pointer}.player{position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#020507}.player iframe{width:100%;height:100%;border:0;display:block}.twitch-title{margin:13px 2px 2px;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(max-width:640px){.header{top:12px;left:12px;right:12px}.copy small{display:none}.count{font-size:0;padding:12px}.hint{left:12px;bottom:24px}.hint>span:last-child{display:none}.backdrop{padding:10px}.modal{padding:12px;border-radius:15px}}
  </style>
</head>
<body>
  <main class="shell">
    <div id="map" aria-label="Interactive map of ZedTheCyclist clips"></div>
    <header class="header">
      <a class="brand" href="https://www.twitch.tv/zedthecyclist" target="_blank" rel="noreferrer"><span class="mark"><span>Z</span></span><span class="copy"><strong>ZedTheCyclist</strong><small>pilgrimage archive</small></span></a>
      <div class="count"><span class="dot"></span><span>${places.length} moments mapped</span></div>
    </header>
    <aside class="hint"><span class="mouse"></span><span><strong>Explore the ride</strong>Hover for a name · click to watch</span></aside>
    <div class="backdrop" id="backdrop" aria-hidden="true">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="clip-name">
        <div class="heading"><div><p>From the road</p><h2 id="clip-name"></h2></div><button class="close" id="close" aria-label="Close clip">×</button></div>
        <div class="player" id="player"></div><p class="twitch-title" id="clip-title"></p>
      </section>
    </div>
  </main>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <script>
    const places=${data};
    const map=L.map("map",{center:[47.8,13.9],zoom:4,minZoom:2,maxZoom:18,zoomControl:false,attributionControl:false,preferCanvas:true});
    L.control.zoom({position:"bottomright"}).addTo(map);L.control.attribution({position:"bottomleft",prefix:false}).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{subdomains:"abcd",maxZoom:20,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'}).addTo(map);
    const renderer=L.canvas({padding:.5}),bounds=L.latLngBounds([]),escapeHtml=text=>String(text).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
    const backdrop=document.getElementById("backdrop"),player=document.getElementById("player"),clipName=document.getElementById("clip-name"),clipTitle=document.getElementById("clip-title");
    function closeModal(){backdrop.classList.remove("open");backdrop.setAttribute("aria-hidden","true");player.replaceChildren()}
    function openClip(place){const id=(place.clipUrl.match(/\\/clip\\/([^/?#]+)/)||[])[1];if(!id)return;clipName.textContent=place.name;clipTitle.textContent=place.twitchTitle&&place.twitchTitle!==place.name?place.twitchTitle:"";const iframe=document.createElement("iframe");iframe.title=place.twitchTitle||place.name;iframe.allow="autoplay; fullscreen";iframe.allowFullscreen=true;iframe.src="https://clips.twitch.tv/embed?clip="+encodeURIComponent(id)+"&parent="+encodeURIComponent(location.hostname||"localhost")+"&autoplay=true&muted=true";player.append(iframe);backdrop.classList.add("open");backdrop.setAttribute("aria-hidden","false")}
    places.forEach(place=>{const point=[place.latitude,place.longitude];bounds.extend(point);const marker=L.circleMarker(point,{renderer,radius:place.clipUrl?5.5:4.5,color:"#07141c",weight:2,fillColor:place.clipUrl?"#51e3d8":"#7c9299",fillOpacity:1,bubblingMouseEvents:false}).bindTooltip(escapeHtml(place.name),{direction:"top",offset:[0,-8],opacity:1});if(place.clipUrl)marker.on("click",()=>openClip(place));marker.addTo(map)});if(bounds.isValid())map.fitBounds(bounds.pad(.06),{maxZoom:7});
    document.getElementById("close").addEventListener("click",closeModal);backdrop.addEventListener("click",event=>{if(event.target===backdrop)closeModal()});document.addEventListener("keydown",event=>{if(event.key==="Escape")closeModal()});
  </script>
</body>
</html>`;

writeFileSync(new URL("../index.html", import.meta.url), html, "utf8");
console.log(`Generated index.html with ${places.length} locations.`);
