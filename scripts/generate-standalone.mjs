import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "1ZmgPHO2blY5aPFv97Ra_8kO2MexeO_SScGGjbS134ZQ";
const TWITCH_URL = "https://www.twitch.tv/zedthecyclist";
const LIVE_URL = "https://zedthecyclist-map.naaaaaagz.chatgpt.site/api/live";
const COUNTRY_BORDERS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_boundary_lines_land.geojson";
const twitchMetadata = JSON.parse(readFileSync(new URL("../data/twitch-meta.json", import.meta.url), "utf8"));
const appCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")
  .replace(/^@import\s+"tailwindcss";\s*/u, "");

const cell = (row, index) => row.c?.[index]?.v ?? "";
const clipId = (url) => String(url).match(/\/clip\/([^/?#]+)/)?.[1] ?? "";
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[char]);

const endpoint = `https://docs.google.com/spreadsheets/d/${SOURCE}/gviz/tq?tqx=out:json&gid=0`;
const raw = await (await fetch(endpoint)).text();
const payload = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const places = payload.table.rows.map((row, index) => {
  const coordinates = String(cell(row, 5)).split(",").map((value) => Number(value.trim()));
  const url = String(cell(row, 1));
  const twitch = twitchMetadata[clipId(url)] ?? {};
  return {
    id: index,
    name: String(cell(row, 0)),
    clipUrl: url,
    category: String(cell(row, 2)),
    sourceKeywords: String(cell(row, 3)),
    keywords: String(cell(row, 4)),
    latitude: coordinates[0],
    longitude: coordinates[1],
    twitchTitle: String(cell(row, 6)),
    country: String(cell(row, 7)),
    clipDate: String(cell(row, 8)),
    top: String(cell(row, 9)).trim().toUpperCase() === "TOP",
    twitchCategory: twitch.category ?? "",
    twitchKeywords: twitch.language ?? "",
  };
}).filter((place) => place.name !== "Clip name" && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));

const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const countValues = (values) => values.reduce((counts, value) => {
  if (value) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}, {});
const categories = unique(places.map((place) => place.category));
const countries = unique(places.map((place) => place.country));
const categoryCounts = countValues(places.map((place) => place.category));
const countryCounts = countValues(places.map((place) => place.country));
const topCount = places.filter((place) => place.top).length;
const checkbox = (type, value, count) => `<label><input type="checkbox" data-filter="${type}" value="${escapeHtml(value)}" checked><span>${escapeHtml(value)} <small>(${count})</small></span></label>`;
const data = JSON.stringify(places).replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#071118">
  <title>ZedTheCyclist — Zarándoklatai</title>
  <link rel="preconnect" href="https://basemaps.cartocdn.com">
  <link rel="preconnect" href="https://server.arcgisonline.com">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css">
  <style>${appCss}</style>
  <style>
    .filters-panel,.filter-dismiss,.modal-backdrop{display:none}
    .filters-panel.open{display:block}.filter-dismiss.open{display:block}.modal-backdrop.open{display:grid}
    .live-button[hidden],.search-clear[hidden],.top-badge[hidden]{display:none}
  </style>
</head>
<body>
  <main class="site-shell">
    <header class="site-header">
      <div class="identity">
        <div class="wordmark" aria-label="ZedTheCyclist"><span>Zed</span><em>The</em><span>Cyclist</span></div>
        <small>Zarándoklatai</small>
      </div>
      <a class="twitch-button" href="${TWITCH_URL}" target="_blank" rel="noreferrer">Visit on Twitch</a>
      <a class="live-button" id="live-button" href="${TWITCH_URL}" target="_blank" rel="noreferrer" hidden><span class="live-led" aria-hidden="true"></span>LIVE</a>
    </header>

    <div class="filter-area">
      <div class="search-box">
        <span class="search-icon" aria-hidden="true"></span>
        <input id="search-input" type="search" placeholder="Balaton, jumpscare, macska, ..." aria-label="Search clips">
        <button class="search-clear" id="search-clear" aria-label="Clear search" hidden>×</button>
      </div>
      <button class="filter-button" id="filter-button" aria-expanded="false" aria-controls="filters-panel"><span class="filter-icon" aria-hidden="true"><i></i><i></i><i></i></span>Filters</button>
      <button class="filter-dismiss" id="filter-dismiss" aria-label="Close filters"></button>
      <section class="filters-panel" id="filters-panel" aria-label="Map filters">
        <div class="filter-section">
          <h2>Top clip-ek</h2>
          <div class="filter-options single-option"><label><input type="checkbox" id="top-only"><span>Csak TOP clip-ek <small>(${topCount})</small></span></label></div>
        </div>
        <div class="filter-section">
          <h2>Category</h2>
          <div class="filter-options"><label class="select-all-option"><input type="checkbox" data-select-all="category" checked><span>ÖSSZES</span></label>${categories.map((item) => checkbox("category", item, categoryCounts[item])).join("")}</div>
        </div>
        <div class="filter-section countries-section">
          <h2>Countries</h2>
          <div class="filter-options country-options"><label class="select-all-option"><input type="checkbox" data-select-all="country" checked><span>ÖSSZES</span></label>${countries.map((item) => checkbox("country", item, countryCounts[item])).join("")}</div>
        </div>
      </section>
    </div>

    <div id="map" class="map" aria-label="Interactive map of ZedTheCyclist clips"></div>
    <div class="map-loading visible" id="map-loading" role="status" aria-label="Loading map"><span class="map-loading-spinner" aria-hidden="true"></span></div>

    <div class="modal-backdrop" id="modal-backdrop" aria-hidden="true">
      <button class="modal-dismiss" id="modal-dismiss" aria-label="Close clip"></button>
      <section class="clip-modal" role="dialog" aria-modal="true" aria-labelledby="clip-modal-title">
        <div class="modal-heading">
          <h2 id="clip-modal-title"></h2>
          <div class="modal-actions"><span class="top-badge" id="top-badge" hidden>TOP</span><button class="close-button" id="close-button" aria-label="Close clip"><span></span><span></span></button></div>
        </div>
        <div class="player-frame" id="player-frame"></div>
      </section>
    </div>
  </main>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <script>
    const places=${data};
    const categories=${JSON.stringify(categories)},countries=${JSON.stringify(countries)};
    const selectedCategories=new Set(categories),selectedCountries=new Set(countries);
    let topOnly=false,searchQuery="";
    const normalizeSearch=value=>String(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("hu-HU").replace(/[^\\p{L}\\p{N}]+/gu," ").trim();
    const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
    const clipId=url=>(String(url).match(/\\/clip\\/([^/?#]+)/)||[])[1]||"";

    fetch("${LIVE_URL}").then(response=>response.ok?response.json():{online:false}).then(payload=>{if(payload.online)document.getElementById("live-button").hidden=false}).catch(()=>{});

    const mapLoading=document.getElementById("map-loading");let hideLoadingTimer=0,maxLoadingTimer=0,coverageTimer=0,coverageFrame=0,viewTransitioning=false,blockingLoadActive=true;
    function showMapLoading(){if(!blockingLoadActive)return;clearTimeout(hideLoadingTimer);mapLoading.classList.add("visible")}
    function startBlockingMapLoad(){blockingLoadActive=true;showMapLoading();clearTimeout(maxLoadingTimer);maxLoadingTimer=setTimeout(()=>{blockingLoadActive=false;mapLoading.classList.remove("visible")},4500)}
    function visibleBaseTilesReady(){const pixelBounds=map.getPixelBounds(),tileSize=256,zoom=map.getZoom(),worldTiles=2**zoom,minX=Math.floor(pixelBounds.min.x/tileSize),maxX=Math.floor((pixelBounds.max.x-1)/tileSize),minY=Math.max(0,Math.floor(pixelBounds.min.y/tileSize)),maxY=Math.min(worldTiles-1,Math.floor((pixelBounds.max.y-1)/tileSize)),loadedTiles=new Set(Array.from(document.querySelectorAll(".resilient-map-tile.leaflet-tile-loaded")).filter(tile=>Number(tile.dataset.tileZ)===zoom&&tile.querySelector("img")?.naturalWidth).map(tile=>tile.dataset.tileX+":"+tile.dataset.tileY));for(let x=minX;x<=maxX;x+=1){const wrappedX=((x%worldTiles)+worldTiles)%worldTiles;for(let y=minY;y<=maxY;y+=1)if(!loadedTiles.has(wrappedX+":"+y))return false}return loadedTiles.size>0}
    function verifyMapCoverage(){clearTimeout(coverageTimer);if(viewTransitioning||!visibleBaseTilesReady()){if(blockingLoadActive){showMapLoading();coverageTimer=setTimeout(verifyMapCoverage,80)}return}if(!blockingLoadActive)return;clearTimeout(hideLoadingTimer);hideLoadingTimer=setTimeout(()=>{if(viewTransitioning||!visibleBaseTilesReady())verifyMapCoverage();else{blockingLoadActive=false;clearTimeout(maxLoadingTimer);mapLoading.classList.remove("visible")}},80)}
    function requestCoverageCheck(){cancelAnimationFrame(coverageFrame);coverageFrame=requestAnimationFrame(verifyMapCoverage)}
    const map=L.map("map",{center:[47.8,13.9],zoom:4,minZoom:2,maxZoom:16,zoomControl:false,attributionControl:false,fadeAnimation:false,zoomAnimation:false,markerZoomAnimation:false});
    startBlockingMapLoad();const successfulTileUrls=new Map();
    L.control.zoom({position:"bottomright"}).addTo(map);L.control.attribution({position:"bottomleft",prefix:false}).addTo(map);
    function addBufferedTileLayer(url,attribution="",options={},resilient=false){
      const tileLayer=L.tileLayer(url,{maxZoom:16,keepBuffer:4,updateWhenIdle:false,updateWhenZooming:false,updateInterval:120,attribution,...options}),getVisiblePixelBounds=tileLayer._getTiledPixelBounds.bind(tileLayer);
      tileLayer._getTiledPixelBounds=center=>{const visibleBounds=getVisiblePixelBounds(center),edgeBuffer=map.getZoom()<=12?tileLayer.getTileSize():L.point(0,0);return L.bounds(visibleBounds.min.subtract(edgeBuffer),visibleBounds.max.add(edgeBuffer))};
      if(resilient)tileLayer.createTile=(coords,done)=>{const size=tileLayer.getTileSize(),tile=document.createElement("div"),subdomains=["a","b","c","d"],retina=L.Browser.retina?"@2x":"";let finished=false;tile.className="resilient-map-tile";tile.style.width=size.x+"px";tile.style.height=size.y+"px";tile.dataset.tileX=String(coords.x);tile.dataset.tileY=String(coords.y);tile.dataset.tileZ=String(coords.z);tile.dataset.provider=coords.z>12?"esri":"carto";
        const tileUrl=(x,y,z,attempt)=>{if(z>12)return "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/"+z+"/"+y+"/"+x;const subdomain=subdomains[Math.abs(x+y+attempt)%subdomains.length];return url.replace("{s}",subdomain).replace("{z}",String(z)).replace("{x}",String(x)).replace("{y}",String(y)).replace("{r}",retina)},tileKey=(x,y,z)=>(z>12?"esri":"carto")+":"+z+":"+x+":"+y;
        const complete=(image,fallbackLevel,x,y,z)=>{if(finished||tile.dataset.cancelled==="true")return;finished=true;successfulTileUrls.set(tileKey(x,y,z),image.src);const factor=2**fallbackLevel,offsetX=((coords.x%factor)+factor)%factor,offsetY=((coords.y%factor)+factor)%factor;image.style.width=size.x*factor+"px";image.style.height=size.y*factor+"px";image.style.left=-offsetX*size.x+"px";image.style.top=-offsetY*size.y+"px";done(null,tile)};
        const load=(fallbackLevel,attempt=0)=>{if(finished||tile.dataset.cancelled==="true")return;const factor=2**fallbackLevel,x=Math.floor(coords.x/factor),y=Math.floor(coords.y/factor),z=coords.z-fallbackLevel,image=document.createElement("img");image.alt="";image.decoding="async";image.onload=()=>complete(image,fallbackLevel,x,y,z);image.onerror=()=>{if(tile.dataset.cancelled==="true")return;if(attempt<2)load(fallbackLevel,attempt+1);else if(fallbackLevel<3&&z>0)load(fallbackLevel+1);else if(!finished){finished=true;done(new Error("Map tile unavailable"),tile)}};tile.replaceChildren(image);image.src=successfulTileUrls.get(tileKey(x,y,z))||tileUrl(x,y,z,attempt)};load(0);return tile};
      if(resilient){tileLayer.on("tileload tileerror",requestCoverageCheck);tileLayer.on("tileunload",event=>{const tile=event.tile;tile.dataset.cancelled="true";const image=tile.querySelector("img");if(image){image.onload=null;image.onerror=null;image.removeAttribute("src")}})}tileLayer.addTo(map)
    }
    addBufferedTileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> &copy; Esri',{subdomains:"abcd"},true);
    addBufferedTileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}","",{maxNativeZoom:16});
    map.on("move",requestCoverageCheck);map.on("moveend",requestCoverageCheck);map.on("zoomstart",()=>{viewTransitioning=true});map.on("zoomend",()=>{viewTransitioning=false;requestCoverageCheck()});
    map.createPane("countryBorders");map.getPane("countryBorders").style.zIndex="350";
    fetch("${COUNTRY_BORDERS_URL}").then(response=>response.ok?response.json():null).then(geoJson=>{if(geoJson)L.geoJSON(geoJson,{pane:"countryBorders",interactive:false,style:{color:"#86a8b3",weight:1.5,opacity:.68,fillOpacity:0}}).addTo(map)}).catch(()=>{});

    const clusters=L.markerClusterGroup({maxClusterRadius:zoom=>zoom>=15?18:zoom>=10?24:32,showCoverageOnHover:false,zoomToBoundsOnClick:true,spiderfyOnMaxZoom:true,removeOutsideVisibleBounds:true,iconCreateFunction:cluster=>{const count=cluster.getChildCount(),size=count>=100?42:count>=10?36:31;return L.divIcon({className:"clip-cluster-wrapper",html:'<span class="clip-cluster"><b>'+count+'</b></span>',iconSize:[size,size]})}}).addTo(map);
    const bounds=L.latLngBounds(places.map(place=>[place.latitude,place.longitude]));if(bounds.isValid())map.fitBounds(bounds.pad(.06),{maxZoom:7});

    const backdrop=document.getElementById("modal-backdrop"),player=document.getElementById("player-frame"),clipName=document.getElementById("clip-modal-title"),topBadge=document.getElementById("top-badge");
    function closeModal(){backdrop.classList.remove("open");backdrop.setAttribute("aria-hidden","true");player.replaceChildren();document.body.classList.remove("modal-open")}
    function openClip(place){const id=clipId(place.clipUrl);if(!id)return;clipName.textContent=place.name;topBadge.hidden=!place.top;const iframe=document.createElement("iframe");iframe.title=place.twitchTitle||place.name;iframe.allow="autoplay; fullscreen";iframe.allowFullscreen=true;iframe.src="https://clips.twitch.tv/embed?clip="+encodeURIComponent(id)+"&parent="+encodeURIComponent(location.hostname||"localhost")+"&autoplay=true&muted=false";backdrop.classList.add("open");backdrop.setAttribute("aria-hidden","false");document.body.classList.add("modal-open");requestAnimationFrame(()=>requestAnimationFrame(()=>player.append(iframe)))}
    let fitTimer=0;
    function fitVisible(visible,tokens){clearTimeout(fitTimer);if(!visible.length)return;fitTimer=setTimeout(()=>{startBlockingMapLoad();if(visible.length===1)map.setView([visible[0].latitude,visible[0].longitude],14,{animate:false});else{const bounds=L.latLngBounds(visible.map(place=>[place.latitude,place.longitude])),maxZoom=visible.length<=4?13:visible.length<=20?11:7;map.fitBounds(bounds,{padding:[54,54],maxZoom,animate:false})}setTimeout(verifyMapCoverage,1000)},tokens.length?260:0)}
    function renderMarkers(){clusters.clearLayers();const tokens=normalizeSearch(searchQuery).split(/\\s+/).filter(Boolean);const visible=places.filter(place=>{if(!selectedCategories.has(place.category)||!selectedCountries.has(place.country)||topOnly&&!place.top)return false;if(!tokens.length)return true;const haystack=normalizeSearch([place.keywords,place.sourceKeywords,place.category,place.name,place.twitchTitle,place.twitchCategory,place.twitchKeywords].join(" "));return tokens.every(token=>haystack.includes(token))});document.getElementById("map").dataset.visibleCount=String(visible.length);visible.forEach(place=>{const type=place.top?"top":place.clipUrl?"clip":"unlinked",size=place.top?17:place.clipUrl?12:10;const marker=L.marker([place.latitude,place.longitude],{icon:L.divIcon({className:"clip-marker-wrapper",html:'<span class="clip-marker '+type+'"></span>',iconSize:[size,size],iconAnchor:[size/2,size/2]}),keyboard:Boolean(place.clipUrl),bubblingMouseEvents:false});marker.bindTooltip(escapeHtml(place.name||"Untitled clip"),{direction:"top",offset:[0,place.top?-10:-8],opacity:1});if(place.clipUrl)marker.on("click",()=>openClip(place));clusters.addLayer(marker)});fitVisible(visible,tokens)}
    renderMarkers();requestAnimationFrame(()=>map.invalidateSize());

    const filterButton=document.getElementById("filter-button"),filtersPanel=document.getElementById("filters-panel"),filterDismiss=document.getElementById("filter-dismiss");
    function setFiltersOpen(open){filterButton.setAttribute("aria-expanded",String(open));filtersPanel.classList.toggle("open",open);filterDismiss.classList.toggle("open",open)}
    filterButton.addEventListener("click",()=>setFiltersOpen(filterButton.getAttribute("aria-expanded")!=="true"));filterDismiss.addEventListener("click",()=>setFiltersOpen(false));
    function updateSelectAll(type){const inputs=[...document.querySelectorAll('[data-filter="'+type+'"]')],all=document.querySelector('[data-select-all="'+type+'"]');all.checked=inputs.every(input=>input.checked);all.indeterminate=!all.checked&&inputs.some(input=>input.checked)}
    document.querySelectorAll("[data-filter]").forEach(input=>input.addEventListener("change",()=>{const target=input.dataset.filter==="category"?selectedCategories:selectedCountries;input.checked?target.add(input.value):target.delete(input.value);updateSelectAll(input.dataset.filter);renderMarkers()}));
    document.querySelectorAll("[data-select-all]").forEach(all=>all.addEventListener("change",()=>{const type=all.dataset.selectAll,target=type==="category"?selectedCategories:selectedCountries;target.clear();document.querySelectorAll('[data-filter="'+type+'"]').forEach(input=>{input.checked=all.checked;if(all.checked)target.add(input.value)});all.indeterminate=false;renderMarkers()}));
    document.getElementById("top-only").addEventListener("change",event=>{topOnly=event.target.checked;renderMarkers()});
    const searchInput=document.getElementById("search-input"),searchClear=document.getElementById("search-clear");
    function updateSearch(){searchQuery=searchInput.value;searchClear.hidden=!searchQuery;renderMarkers()}
    searchInput.addEventListener("input",updateSearch);searchClear.addEventListener("click",()=>{searchInput.value="";updateSearch();searchInput.focus()});
    document.getElementById("close-button").addEventListener("click",closeModal);document.getElementById("modal-dismiss").addEventListener("click",closeModal);
    document.addEventListener("keydown",event=>{if(event.key==="Escape"){closeModal();setFiltersOpen(false)}});
  </script>
</body>
</html>`;

writeFileSync(new URL("../index.html", import.meta.url), html, "utf8");
console.log(`Generated index.html with ${places.length} locations, ${topCount} TOP clips and ${countries.length} countries.`);
