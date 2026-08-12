import { writeFileSync } from "node:fs";

const SOURCE_PARTS = [
  "MVptZ1BI", "TzJibFk1", "YVBGdjk3", "UmFfOGtP",
  "Mk1leGVP", "X1NTY0dH", "amJTMTM0", "WlE=",
];
const source = Buffer.from(SOURCE_PARTS.join(""), "base64").toString("utf8");
const response = await fetch(`https://docs.google.com/spreadsheets/d/${source}/gviz/tq?tqx=out:json&gid=0`);
if (!response.ok) throw new Error(`Sheet returned ${response.status}`);
const raw = await response.text();
const payload = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const value = (row, index) => row.c?.[index]?.v ?? "";

const places = payload.table.rows
  .map((row, index) => {
    const [latitude, longitude] = String(value(row, 4)).split(",").map((part) => Number(part.trim()));
    return {
      id: index + 1,
      name: String(value(row, 0)),
      clipUrl: String(value(row, 1)),
      category: String(value(row, 2)),
      keywords: String(value(row, 3)),
      latitude,
      longitude,
      twitchTitle: String(value(row, 5)),
      country: String(value(row, 6)),
      clipDate: String(value(row, 7)),
    };
  })
  .filter((place) => place.name && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));

const categories = [...new Set(places.map((place) => place.category).filter(Boolean))].sort();
const countries = [...new Set(places.map((place) => place.country).filter(Boolean))].sort();
const countValues = (values) => values.reduce((counts, value) => {
  if (value) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}, {});
const categoryCounts = countValues(places.map((place) => place.category));
const countryCounts = countValues(places.map((place) => place.country));
const data = JSON.stringify(places).replaceAll("<", "\\u003c");
const escapeAttribute = (text) => String(text).replace(/[&"<>]/g, (char) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[char]);
const checkbox = (type, item, count) => `<label><input type="checkbox" data-filter="${type}" value="${escapeAttribute(item)}" checked><span>${escapeAttribute(item)} <small>(${count})</small></span></label>`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ZedTheCyclist — Zarándoklatai</title>
  <meta name="description" content="A map of ZedTheCyclist's journeys and Twitch clips.">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
  <style>
    :root{--ink:#071118;--panel:rgba(8,20,28,.88);--line:rgba(164,224,222,.16);--muted:#8ca4ae;--text:#e8f5f5;--accent:#51e3d8;--purple:#c05cff;--purple-hot:#8d5bff}
    *{box-sizing:border-box}html,body,#map{width:100%;height:100%;margin:0}body{background:var(--ink);color:var(--text);font-family:Arial,Helvetica,sans-serif;overflow:hidden}.shell{position:relative;width:100vw;height:100dvh;overflow:hidden}.header{position:fixed;z-index:1000;top:22px;left:22px;display:flex;align-items:center;gap:16px;pointer-events:none}.identity{display:grid;gap:1px;filter:drop-shadow(0 5px 18px rgba(0,0,0,.66))}.wordmark{font-family:"Arial Black",Arial,Helvetica,sans-serif;font-size:23px;font-weight:900;font-style:italic;letter-spacing:-.075em;line-height:.95;transform:skewX(-4deg)}.wordmark span{color:var(--purple);background:linear-gradient(115deg,#ee8cff 5%,var(--purple) 48%,var(--purple-hot));background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-shadow:0 0 20px rgba(181,76,255,.22)}.wordmark em{color:#d9e1e8;font-size:.72em;font-style:inherit;margin:0 .08em;letter-spacing:-.04em}.identity small{color:#aeb8c5;font-size:10px;font-weight:650;letter-spacing:.19em;text-transform:uppercase;padding-left:2px}.twitch-button{pointer-events:auto;display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border:1px solid rgba(199,107,255,.32);border-radius:10px;background:rgba(32,17,49,.82);color:#eadcfa;text-decoration:none;font-size:12px;font-weight:700;box-shadow:0 12px 34px rgba(0,0,0,.28);backdrop-filter:blur(14px)}.filter-area{position:fixed;z-index:1010;top:22px;right:22px}.filter-button{position:relative;z-index:14;display:inline-flex;align-items:center;gap:9px;min-height:39px;padding:0 14px;border:1px solid var(--line);border-radius:11px;background:var(--panel);color:var(--text);box-shadow:0 14px 40px rgba(0,6,12,.28);backdrop-filter:blur(16px);cursor:pointer;font-size:12px;font-weight:700}.filter-icon{width:17px;display:grid;gap:3px}.filter-icon i{display:block;height:1px;background:#d9c4e9;position:relative}.filter-icon i:after{content:"";position:absolute;top:-2px;width:5px;height:5px;border-radius:50%;background:var(--purple);box-shadow:0 0 8px rgba(192,92,255,.7)}.filter-icon i:nth-child(1):after{left:3px}.filter-icon i:nth-child(2):after{right:2px}.filter-icon i:nth-child(3):after{left:7px}.filter-dismiss{display:none;position:fixed;z-index:12;inset:0;width:100%;height:100%;border:0;background:transparent}.filter-dismiss.open{display:block}.filters-panel{display:none;position:absolute;z-index:13;top:49px;right:0;width:min(330px,calc(100vw - 28px));max-height:calc(100dvh - 90px);overflow:auto;padding:17px;border:1px solid rgba(195,114,238,.23);border-radius:15px;background:rgba(8,15,25,.96);box-shadow:0 26px 80px rgba(0,0,0,.48);backdrop-filter:blur(22px)}.filters-panel.open{display:block}.filter-section+.filter-section{margin-top:18px;padding-top:17px;border-top:1px solid var(--line)}.filter-section h2{margin:0 0 10px;color:#aab7c2;font-size:10px;letter-spacing:.16em;text-transform:uppercase}.filter-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.filter-options label{display:flex;align-items:center;gap:8px;min-width:0;padding:7px 8px;border-radius:8px;color:#d7e0e5;font-size:12px;cursor:pointer}.filter-options label:hover{background:rgba(189,92,255,.08)}.filter-options input{width:14px;height:14px;margin:0;accent-color:var(--purple)}.filter-options span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hint{background:var(--panel);border:1px solid var(--line);box-shadow:0 18px 50px rgba(0,6,12,.28);backdrop-filter:blur(16px);position:fixed;z-index:900;left:22px;bottom:36px;display:flex;align-items:center;gap:12px;border-radius:13px;padding:11px 14px;color:var(--muted);font-size:11px;line-height:1.45;pointer-events:none}.hint>span:last-child{display:grid}.hint strong{color:var(--text);font-size:12px}.mouse{width:18px;height:25px;border:1px solid #8fb2b8;border-radius:9px;position:relative}.mouse:after{content:"";position:absolute;top:5px;left:50%;width:2px;height:5px;background:var(--accent);transform:translateX(-50%)}.leaflet-container{background:#071118}.leaflet-bottom.leaflet-right{right:14px;bottom:26px}.leaflet-control-zoom{overflow:hidden;border:1px solid var(--line)!important;border-radius:8px!important;box-shadow:none!important}.leaflet-control-zoom a{background:rgba(8,20,28,.9)!important;color:#cde2e4!important;border-color:var(--line)!important}.leaflet-control-attribution{background:rgba(6,14,20,.72)!important;color:#728b94!important}.leaflet-control-attribution a{color:#9db5bd!important}.leaflet-tooltip{background:#0b1b24!important;color:#efffff!important;border:1px solid rgba(192,92,255,.3)!important;border-radius:9px!important;padding:8px 11px!important;box-shadow:0 10px 28px rgba(0,0,0,.4)!important;font-size:12px}.leaflet-tooltip-top:before{border-top-color:#0b1b24!important}.backdrop{position:fixed;inset:0;z-index:2000;display:none;place-items:center;padding:24px;background:rgba(2,8,13,.78);backdrop-filter:blur(9px)}.backdrop.open{display:grid}.modal{position:relative;width:min(920px,100%);padding:18px;border-radius:20px;background:#09161e;border:1px solid rgba(132,215,213,.22);box-shadow:0 34px 100px rgba(0,0,0,.52)}.heading{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:2px 2px 14px}.heading p{margin:0 0 4px;color:var(--accent);text-transform:uppercase;letter-spacing:.18em;font-size:9px;font-weight:700}.heading h2{margin:0;font-size:clamp(18px,2.2vw,25px)}.close{width:38px;height:38px;flex:0 0 38px;border-radius:50%;border:1px solid var(--line);background:rgba(255,255,255,.035);color:#d6e7e9;font-size:25px;cursor:pointer}.player{position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#020507}.player iframe{width:100%;height:100%;border:0;display:block}.twitch-title{margin:13px 2px 2px;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(max-width:720px){.header{top:14px;left:14px;gap:10px}.wordmark{font-size:19px}.identity small{font-size:8px}.twitch-button{min-height:32px;padding:0 10px;font-size:10px}.filter-area{top:14px;right:14px}.filter-button{min-height:35px;padding:0 11px;font-size:0}.filter-icon{width:18px}.filters-panel{top:44px}.hint{left:12px;bottom:24px}.hint>span:last-child{display:none}.backdrop{padding:10px}.modal{padding:12px;border-radius:15px}}
  </style>
  <style>
    .shell{isolation:isolate}#map{position:absolute;inset:0;z-index:0;isolation:isolate}.header,.filter-area,.hint{transform:translate3d(0,0,0);backface-visibility:hidden}.wordmark{letter-spacing:-.045em;line-height:1;transform:skewX(-2deg);padding:2px 5px 2px 1px}.wordmark span{display:inline-block;padding:0 .16em 0 .02em;margin:0 -.05em 0 -.02em}.wordmark em{margin:0 .11em;letter-spacing:-.025em}.filters-panel{width:max-content;min-width:330px;max-width:calc(100vw - 28px)}.filter-options,.country-options{grid-template-columns:repeat(2,max-content);gap:7px 14px}.filter-options label{width:max-content}.filter-options span{overflow:visible;text-overflow:clip}.filter-options small{color:var(--muted);font-size:inherit}.filter-options .select-all-option{grid-column:1/-1;width:100%;margin-bottom:2px;border-bottom:1px solid var(--line);border-radius:8px 8px 3px 3px;color:#eadcfa;font-weight:750}@media(max-width:520px){.filter-options,.country-options{grid-template-columns:max-content}}
  </style>
</head>
<body>
  <main class="shell">
    <div id="map" aria-label="Interactive map of ZedTheCyclist clips"></div>
    <header class="header">
      <div class="identity"><div class="wordmark" aria-label="ZedTheCyclist"><span>Zed</span><em>The</em><span>Cyclist</span></div><small>Zarándoklatai</small></div>
      <a class="twitch-button" href="https://www.twitch.tv/zedthecyclist" target="_blank" rel="noreferrer">Visit on Twitch</a>
    </header>
    <div class="filter-area">
      <button class="filter-button" id="filter-button" aria-expanded="false" aria-controls="filters-panel"><span class="filter-icon"><i></i><i></i><i></i></span>Filters</button>
      <button class="filter-dismiss" id="filter-dismiss" aria-label="Close filters"></button>
      <section class="filters-panel" id="filters-panel" aria-label="Map filters">
        <div class="filter-section"><h2>Category</h2><div class="filter-options"><label class="select-all-option"><input type="checkbox" data-select-all="category" checked><span>ÖSSZES</span></label>${categories.map((item) => checkbox("category", item, categoryCounts[item])).join("")}</div></div>
        <div class="filter-section"><h2>Countries</h2><div class="filter-options"><label class="select-all-option"><input type="checkbox" data-select-all="country" checked><span>ÖSSZES</span></label>${countries.map((item) => checkbox("country", item, countryCounts[item])).join("")}</div></div>
      </section>
    </div>
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
    const places=${data},categories=${JSON.stringify(categories)},countries=${JSON.stringify(countries)};
    const selectedCategories=new Set(categories),selectedCountries=new Set(countries);
    const map=L.map("map",{center:[47.8,13.9],zoom:4,minZoom:2,maxZoom:18,zoomControl:false,attributionControl:false,preferCanvas:true});
    L.control.zoom({position:"bottomright"}).addTo(map);L.control.attribution({position:"bottomleft",prefix:false}).addTo(map);
    function addBufferedTileLayer(url,attribution="",options={}){const tileLayer=L.tileLayer(url,{maxZoom:20,keepBuffer:4,updateWhenIdle:false,attribution,...options});const getVisiblePixelBounds=tileLayer._getTiledPixelBounds.bind(tileLayer);tileLayer._getTiledPixelBounds=center=>{const visibleBounds=getVisiblePixelBounds(center),edgeBuffer=tileLayer.getTileSize();return L.bounds(visibleBounds.min.subtract(edgeBuffer),visibleBounds.max.add(edgeBuffer))};tileLayer.addTo(map)}
    addBufferedTileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',{subdomains:"abcd"});
    addBufferedTileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}","",{maxNativeZoom:16});
    const renderer=L.canvas({padding:.5}),bounds=L.latLngBounds([]),markers=L.layerGroup().addTo(map),escapeHtml=text=>String(text).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
    const backdrop=document.getElementById("backdrop"),player=document.getElementById("player"),clipName=document.getElementById("clip-name"),clipTitle=document.getElementById("clip-title");
    function closeModal(){backdrop.classList.remove("open");backdrop.setAttribute("aria-hidden","true");player.replaceChildren()}
    function openClip(place){const id=(place.clipUrl.match(/\\/clip\\/([^/?#]+)/)||[])[1];if(!id)return;clipName.textContent=place.name;clipTitle.textContent=place.twitchTitle&&place.twitchTitle!==place.name?place.twitchTitle:"";const iframe=document.createElement("iframe");iframe.title=place.twitchTitle||place.name;iframe.allow="autoplay; fullscreen";iframe.allowFullscreen=true;iframe.src="https://clips.twitch.tv/embed?clip="+encodeURIComponent(id)+"&parent="+encodeURIComponent(location.hostname||"localhost")+"&autoplay=true&muted=false";backdrop.classList.add("open");backdrop.setAttribute("aria-hidden","false");requestAnimationFrame(()=>player.append(iframe))}
    function renderMarkers(){markers.clearLayers();const visible=places.filter(place=>selectedCategories.has(place.category)&&selectedCountries.has(place.country));document.getElementById("map").dataset.visibleCount=String(visible.length);visible.forEach(place=>{const point=[place.latitude,place.longitude];const marker=L.circleMarker(point,{renderer,radius:place.clipUrl?5.5:4.5,color:"#07141c",weight:2,fillColor:place.clipUrl?"#bd5cff":"#7c9299",fillOpacity:1,bubblingMouseEvents:false}).bindTooltip(escapeHtml(place.name),{direction:"top",offset:[0,-8],opacity:1});if(place.clipUrl)marker.on("click",()=>openClip(place));marker.addTo(markers)})}
    places.forEach(place=>bounds.extend([place.latitude,place.longitude]));if(bounds.isValid())map.fitBounds(bounds.pad(.06),{maxZoom:7});renderMarkers();
    const filterButton=document.getElementById("filter-button"),filtersPanel=document.getElementById("filters-panel"),filterDismiss=document.getElementById("filter-dismiss");
    function setFiltersOpen(open){filterButton.setAttribute("aria-expanded",String(open));filtersPanel.classList.toggle("open",open);filterDismiss.classList.toggle("open",open)}
    filterButton.addEventListener("click",()=>setFiltersOpen(filterButton.getAttribute("aria-expanded")!=="true"));filterDismiss.addEventListener("click",()=>setFiltersOpen(false));
    function updateSelectAll(type){const inputs=[...document.querySelectorAll('[data-filter="'+type+'"]')],all=document.querySelector('[data-select-all="'+type+'"]');all.checked=inputs.every(input=>input.checked);all.indeterminate=!all.checked&&inputs.some(input=>input.checked)}
    document.querySelectorAll("[data-filter]").forEach(input=>input.addEventListener("change",()=>{const target=input.dataset.filter==="category"?selectedCategories:selectedCountries;input.checked?target.add(input.value):target.delete(input.value);updateSelectAll(input.dataset.filter);renderMarkers()}));
    document.querySelectorAll("[data-select-all]").forEach(all=>all.addEventListener("change",()=>{const type=all.dataset.selectAll,target=type==="category"?selectedCategories:selectedCountries;target.clear();document.querySelectorAll('[data-filter="'+type+'"]').forEach(input=>{input.checked=all.checked;if(all.checked)target.add(input.value)});all.indeterminate=false;renderMarkers()}));
    document.getElementById("close").addEventListener("click",closeModal);backdrop.addEventListener("click",event=>{if(event.target===backdrop)closeModal()});document.addEventListener("keydown",event=>{if(event.key==="Escape"){closeModal();setFiltersOpen(false)}});
  </script>
</body>
</html>`;

writeFileSync(new URL("../index.html", import.meta.url), html, "utf8");
console.log(`Generated index.html with ${places.length} locations across ${countries.length} countries.`);
