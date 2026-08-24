import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const SOURCE = "1ZmgPHO2blY5aPFv97Ra_8kO2MexeO_SScGGjbS134ZQ";
const TWITCH_URL = "https://www.twitch.tv/zedthecyclist";
const LIVE_URL = "https://zedthecyclist-map.naaaaaagz.chatgpt.site/api/live";
const BASE_TILE_URL = "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png";
const LABEL_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
const COUNTRY_NAMES_HU = {
  Austria: "Ausztria", Belgium: "Belgium", Croatia: "Horvátország", Germany: "Németország",
  Hungary: "Magyarország", Italy: "Olaszország", Netherlands: "Hollandia", Slovakia: "Szlovákia",
  Slovenia: "Szlovénia", Sweden: "Svédország",
};
const MAP_STYLE = {
  version: 8,
  sources: {
    "dark-base": {
      type: "raster", tileSize: 256, maxzoom: 20,
      tiles: [BASE_TILE_URL],
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
    "english-labels": {
      type: "raster", tileSize: 256, maxzoom: 16,
      tiles: [LABEL_TILE_URL],
      attribution: "&copy; Esri",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#071118" } },
    { id: "dark-base", type: "raster", source: "dark-base", paint: { "raster-fade-duration": 120 } },
    { id: "english-labels", type: "raster", source: "english-labels", paint: { "raster-fade-duration": 120, "raster-opacity": 0.94 } },
  ],
};
const COUNTRY_BORDERS_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_boundary_lines_land.geojson";
const twitchMetadata = JSON.parse(readFileSync(new URL("../data/twitch-meta.json", import.meta.url), "utf8"));
const appCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")
  .replace(/^@import\s+"tailwindcss";\s*/u, "");

const cell = (row, index) => row.c?.[index]?.v ?? "";
const clipId = (url) => String(url).match(/\/clip\/([^/?#]+)/)?.[1] ?? "";
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
const categories = unique(places.map((place) => place.category));
const countries = unique(places.map((place) => place.country));
const topCount = places.filter((place) => place.top).length;
const data = JSON.stringify(places).replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#071118">
  <meta name="msapplication-TileColor" content="#071118">
  <meta name="msapplication-config" content="./browserconfig.xml">
  <title>ZedTheCyclist clips</title>
  <link rel="icon" href="./favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="16x16" href="./favicon-16x16.png">
  <link rel="icon" type="image/png" sizes="32x32" href="./favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="48x48" href="./favicon-48x48.png">
  <link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png">
  <link rel="manifest" href="./site.webmanifest">
  <link rel="preconnect" href="https://a.basemaps.cartocdn.com" crossorigin>
  <link rel="preconnect" href="https://server.arcgisonline.com" crossorigin>
  <link rel="stylesheet" href="./maplibre-gl.css">
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
      <a class="twitch-button" href="${TWITCH_URL}" target="_blank" rel="noreferrer">Twitch profil</a>
      <a class="live-button" id="live-button" href="${TWITCH_URL}" target="_blank" rel="noreferrer" hidden><span class="live-led" aria-hidden="true"></span>LIVE</a>
    </header>

    <div class="filter-area">
      <div class="search-box">
        <span class="search-icon" aria-hidden="true"></span>
        <input id="search-input" type="search" placeholder="Balaton, ijesztés, macska, ..." aria-label="Keresés a klipek között">
        <button class="search-clear" id="search-clear" aria-label="Keresés törlése" hidden>×</button>
      </div>
      <button class="filter-button" id="filter-button" aria-expanded="false" aria-controls="filters-panel"><span class="filter-icon" aria-hidden="true"><i></i><i></i><i></i></span>Szűrők</button>
      <button class="filter-dismiss" id="filter-dismiss" aria-label="Szűrők bezárása"></button>
      <section class="filters-panel" id="filters-panel" aria-label="Térképszűrők">
        <div class="filter-section">
          <h2>Kiemelt klipek</h2>
          <div class="filter-options single-option"><label><input type="checkbox" id="top-only"><span>Csak TOP klipek <small id="top-count"></small></span></label></div>
        </div>
        <div class="filter-section">
          <h2>Kategória</h2>
          <div class="filter-options" id="category-options"><label class="select-all-option"><input type="checkbox" data-select-all="category" checked><span>ÖSSZES</span></label></div>
        </div>
        <div class="filter-section countries-section">
          <h2>Országok</h2>
          <div class="filter-options country-options" id="country-options"><label class="select-all-option"><input type="checkbox" data-select-all="country" checked><span>ÖSSZES</span></label></div>
        </div>
      </section>
    </div>

    <div id="map" class="map" aria-label="ZedTheCyclist klipjeinek interaktív térképe"></div>
    <div class="map-loading" id="map-loading" role="status" aria-label="Térkép betöltése"><span class="map-loading-spinner" aria-hidden="true"></span></div>

    <div class="modal-backdrop" id="modal-backdrop" aria-hidden="true">
      <button class="modal-dismiss" id="modal-dismiss" aria-label="Klip bezárása"></button>
      <section class="clip-modal" role="dialog" aria-modal="true" aria-labelledby="clip-modal-title">
        <div class="modal-heading">
          <h2 id="clip-modal-title"></h2>
          <div class="modal-actions"><span class="top-badge" id="top-badge" hidden>TOP</span><button class="close-button" id="close-button" aria-label="Klip bezárása"><span></span><span></span></button></div>
        </div>
        <div class="player-frame" id="player-frame"></div>
      </section>
    </div>
  </main>

  <script type="module">
    import * as maplibregl from "./maplibre-gl.mjs";
    const places=${data};
    const normalizeSearch=value=>String(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("hu-HU").replace(/[^\\p{L}\\p{N}]+/gu," ").trim();
    const clipId=url=>(String(url).match(/\\/clip\\/([^/?#]+)/)||[])[1]||"";
    const unique=values=>[...new Set(values.filter(Boolean))];
    const countValues=values=>values.reduce((counts,value)=>{if(value)counts[value]=(counts[value]||0)+1;return counts},{});
    const countryNames=${JSON.stringify(COUNTRY_NAMES_HU)},countryName=country=>countryNames[country]||country;
    const categories=unique(places.map(place=>place.category)).sort((a,b)=>a.localeCompare(b));
    const countries=unique(places.map(place=>place.country)).sort((a,b)=>countryName(a).localeCompare(countryName(b),"hu"));
    const categoryCounts=countValues(places.map(place=>place.category)),countryCounts=countValues(places.map(place=>place.country));
    const selectedCategories=new Set(categories),selectedCountries=new Set(countries);
    let topOnly=false,searchQuery="";
    function addFilterOptions(type,values,counts){const container=document.getElementById(type+"-options");values.forEach(value=>{const label=document.createElement("label"),input=document.createElement("input"),span=document.createElement("span"),small=document.createElement("small");input.type="checkbox";input.dataset.filter=type;input.value=value;input.checked=true;span.append(document.createTextNode((type==="country"?countryName(value):value)+" "));small.textContent="("+counts[value]+")";span.append(small);label.append(input,span);container.append(label)})}
    addFilterOptions("category",categories,categoryCounts);addFilterOptions("country",countries,countryCounts);document.getElementById("top-count").textContent="("+places.filter(place=>place.top).length+")";

    fetch("${LIVE_URL}").then(response=>response.ok?response.json():{online:false}).then(payload=>{if(payload.online)document.getElementById("live-button").hidden=false}).catch(()=>{});

    const map=new maplibregl.Map({container:"map",style:${JSON.stringify(MAP_STYLE)},center:[13.9,47.8],zoom:4,minZoom:2,maxZoom:17,attributionControl:false,fadeDuration:0,maxTileCacheZoomLevels:8,cancelPendingTileRequestsWhileZooming:false});
    map.addControl(new maplibregl.NavigationControl({showCompass:false}),"bottom-right");
    map.addControl(new maplibregl.AttributionControl({compact:true}),"bottom-left");

    const prefetchedTileUrls=new Set(),tilePrefetchQueue=[];let activeTilePrefetches=0,prefetchTimer=0;
    function drainTilePrefetchQueue(){while(activeTilePrefetches<4&&tilePrefetchQueue.length){const url=tilePrefetchQueue.shift();activeTilePrefetches+=1;fetch(url,{cache:"force-cache",mode:"cors"}).catch(()=>prefetchedTileUrls.delete(url)).finally(()=>{activeTilePrefetches-=1;drainTilePrefetchQueue()})}}
    function queueTilePrefetch(url){if(prefetchedTileUrls.has(url))return;if(prefetchedTileUrls.size>1600)prefetchedTileUrls.clear();prefetchedTileUrls.add(url);tilePrefetchQueue.push(url);drainTilePrefetchQueue()}
    function prefetchTileRing(){const bounds=map.getBounds();function addRing(zoom,template){const tileCount=2**zoom,longitudeToX=longitude=>Math.floor((longitude+180)/360*tileCount),latitudeToY=latitude=>{const clamped=Math.max(-85.05112878,Math.min(85.05112878,latitude)),radians=clamped*Math.PI/180;return Math.floor((1-Math.asinh(Math.tan(radians))/Math.PI)/2*tileCount)};let west=bounds.getWest(),east=bounds.getEast();while(east<west)east+=360;const minX=longitudeToX(west),maxX=longitudeToX(east),minY=latitudeToY(bounds.getNorth()),maxY=latitudeToY(bounds.getSouth());for(let y=minY-1;y<=maxY+1;y+=1){if(y<0||y>=tileCount)continue;for(let x=minX-1;x<=maxX+1;x+=1){if(x>=minX&&x<=maxX&&y>=minY&&y<=maxY)continue;const wrappedX=((x%tileCount)+tileCount)%tileCount;queueTilePrefetch(template.replace("{z}",String(zoom)).replace("{x}",String(wrappedX)).replace("{y}",String(y)))}}}const zoom=Math.max(2,Math.min(20,Math.floor(map.getZoom())));addRing(zoom,${JSON.stringify(BASE_TILE_URL)});addRing(Math.min(16,zoom),${JSON.stringify(LABEL_TILE_URL)})}
    function scheduleTilePrefetch(){clearTimeout(prefetchTimer);prefetchTimer=setTimeout(prefetchTileRing,140)}
    function wakeMap(){requestAnimationFrame(()=>requestAnimationFrame(()=>{map.resize();map.triggerRepaint();scheduleTilePrefetch()}))}
    new ResizeObserver(wakeMap).observe(document.getElementById("map"));window.addEventListener("load",wakeMap);window.addEventListener("pageshow",wakeMap);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")wakeMap()});map.on("moveend",scheduleTilePrefetch);map.on("idle",scheduleTilePrefetch);

    function placesToGeoJson(items){return{type:"FeatureCollection",features:items.map(place=>({type:"Feature",id:place.id,geometry:{type:"Point",coordinates:[place.longitude,place.latitude]},properties:{id:place.id,name:place.name||"Névtelen klip",linked:Boolean(place.clipUrl),top:place.top}}))}}
    function addTopStar(){const size=40,canvas=document.createElement("canvas");canvas.width=size;canvas.height=size;const context=canvas.getContext("2d");if(!context)return;const outer=17,inner=7.4,center=size/2;context.beginPath();for(let index=0;index<10;index+=1){const radius=index%2===0?outer:inner,angle=-Math.PI/2+index*Math.PI/5,x=center+Math.cos(angle)*radius,y=center+Math.sin(angle)*radius;index===0?context.moveTo(x,y):context.lineTo(x,y)}context.closePath();const gradient=context.createLinearGradient(8,6,31,34);gradient.addColorStop(0,"#f1a4ff");gradient.addColorStop(.58,"#a64cff");gradient.addColorStop(1,"#7047e8");context.fillStyle=gradient;context.fill();context.lineWidth=2.5;context.strokeStyle="#07141c";context.stroke();map.addImage("top-star",context.getImageData(0,0,size,size),{pixelRatio:2})}
    function addClusterIcons(){for(let count=2;count<=places.length;count+=1){const displaySize=count>=100?42:count>=10?36:31,scale=2,size=displaySize*scale,center=size/2,canvas=document.createElement("canvas");canvas.width=size;canvas.height=size;const context=canvas.getContext("2d");if(!context)continue;const gradient=context.createRadialGradient(center*.7,center*.63,1,center,center,center);gradient.addColorStop(0,"#7952b5");gradient.addColorStop(1,"#241c3c");context.beginPath();context.arc(center,center,center-2,0,Math.PI*2);context.fillStyle=gradient;context.fill();context.lineWidth=4;context.strokeStyle="#dc97ff";context.stroke();context.fillStyle="#fff";context.font="850 22px Arial, Helvetica, sans-serif";context.textAlign="center";context.textBaseline="middle";context.fillText(String(count),center,center+.5);map.addImage("cluster-"+count,context.getImageData(0,0,size,size),{pixelRatio:2})}}

    let mapReady=false;
    map.on("load",()=>{
      addClusterIcons();addTopStar();
      map.addSource("clips",{type:"geojson",data:placesToGeoJson(places),cluster:true,clusterMaxZoom:16,clusterRadius:32});
      map.addLayer({id:"clip-clusters",type:"symbol",source:"clips",filter:["has","point_count"],layout:{"icon-image":["concat","cluster-",["to-string",["get","point_count"]]],"icon-allow-overlap":true}});
      map.addLayer({id:"clip-points",type:"circle",source:"clips",filter:["all",["!",["has","point_count"]],["==",["get","top"],false]],paint:{"circle-radius":["case",["get","linked"],5,4],"circle-color":["case",["get","linked"],"#bd5cff","#7c9299"],"circle-stroke-color":"#07141c","circle-stroke-width":1.5}});
      map.addLayer({id:"top-points",type:"symbol",source:"clips",filter:["all",["!",["has","point_count"]],["==",["get","top"],true]],layout:{"icon-image":"top-star","icon-size":1,"icon-allow-overlap":true}});
      const popup=new maplibregl.Popup({closeButton:false,closeOnClick:false,offset:12,className:"clip-map-tooltip"});
      function bindPointLayer(layerId){map.on("mouseenter",layerId,event=>{map.getCanvas().style.cursor="pointer";const feature=event.features&&event.features[0];if(!feature||feature.geometry.type!=="Point")return;popup.setLngLat(feature.geometry.coordinates).setText(feature.properties.name||"Névtelen klip").addTo(map)});map.on("mouseleave",layerId,()=>{map.getCanvas().style.cursor="";popup.remove()});map.on("click",layerId,event=>{const id=Number(event.features&&event.features[0]&&event.features[0].properties.id),place=places.find(item=>item.id===id);if(place&&place.clipUrl)openClip(place)})}
      bindPointLayer("clip-points");bindPointLayer("top-points");
      map.on("mouseenter","clip-clusters",()=>{map.getCanvas().style.cursor="pointer"});map.on("mouseleave","clip-clusters",()=>{map.getCanvas().style.cursor=""});
      map.on("click","clip-clusters",event=>{const feature=event.features&&event.features[0];if(!feature||feature.geometry.type!=="Point")return;const pointCount=Number(feature.properties.point_count||2);map.getSource("clips").getClusterExpansionZoom(Number(feature.properties.cluster_id)).then(expansionZoom=>{const detailZoom=pointCount>100?11.5:pointCount>20?12.5:pointCount>5?13.5:15,targetZoom=Math.min(16,Math.max(expansionZoom+2,map.getZoom()+3.5,detailZoom)),duration=Math.min(900,480+Math.abs(targetZoom-map.getZoom())*55);map.easeTo({center:feature.geometry.coordinates,zoom:targetZoom,duration})}).catch(()=>{})});
      fetch("${COUNTRY_BORDERS_URL}").then(response=>response.ok?response.json():null).then(geoJson=>{if(!geoJson||map.getSource("country-borders"))return;map.addSource("country-borders",{type:"geojson",data:geoJson});map.addLayer({id:"country-borders",type:"line",source:"country-borders",paint:{"line-color":"#86a8b3","line-width":["interpolate",["linear"],["zoom"],2,1.1,8,1.6,14,2],"line-opacity":.68}},"clip-clusters")}).catch(()=>{});
      mapReady=true;renderMarkers(true);wakeMap();
    });

    const backdrop=document.getElementById("modal-backdrop"),player=document.getElementById("player-frame"),clipName=document.getElementById("clip-modal-title"),topBadge=document.getElementById("top-badge");
    function closeModal(){backdrop.classList.remove("open");backdrop.setAttribute("aria-hidden","true");player.replaceChildren();document.body.classList.remove("modal-open")}
    function openClip(place){const id=clipId(place.clipUrl);if(!id)return;clipName.textContent=place.name;topBadge.hidden=!place.top;const iframe=document.createElement("iframe");iframe.title=place.twitchTitle||place.name;iframe.allow="autoplay; fullscreen";iframe.allowFullscreen=true;iframe.src="https://clips.twitch.tv/embed?clip="+encodeURIComponent(id)+"&parent="+encodeURIComponent(location.hostname||"localhost")+"&autoplay=true&muted=false";backdrop.classList.add("open");backdrop.setAttribute("aria-hidden","false");document.body.classList.add("modal-open");requestAnimationFrame(()=>requestAnimationFrame(()=>player.append(iframe)))}
    let fitTimer=0;
    function fitVisible(visible,tokens,initial=false){clearTimeout(fitTimer);if(!visible.length)return;fitTimer=setTimeout(()=>{if(visible.length===1)map.easeTo({center:[visible[0].longitude,visible[0].latitude],zoom:14,duration:initial?0:650});else{const west=Math.min(...visible.map(place=>place.longitude)),east=Math.max(...visible.map(place=>place.longitude)),south=Math.min(...visible.map(place=>place.latitude)),north=Math.max(...visible.map(place=>place.latitude)),maxZoom=visible.length<=4?13:visible.length<=20?11:7;map.fitBounds([[west,south],[east,north]],{padding:54,maxZoom,duration:initial?0:650})}},initial?0:tokens.length?260:0)}
    function renderMarkers(initial=false){const tokens=normalizeSearch(searchQuery).split(/\\s+/).filter(Boolean);const visible=places.filter(place=>{if(!selectedCategories.has(place.category)||!selectedCountries.has(place.country)||topOnly&&!place.top)return false;if(!tokens.length)return true;const haystack=normalizeSearch([place.keywords,place.sourceKeywords,place.category,place.name,place.twitchTitle,place.twitchCategory,place.twitchKeywords].join(" "));return tokens.every(token=>haystack.includes(token))});document.getElementById("map").dataset.visibleCount=String(visible.length);if(mapReady&&!initial)map.getSource("clips").setData(placesToGeoJson(visible));fitVisible(visible,tokens,initial)}

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
copyFileSync(new URL("../node_modules/maplibre-gl/dist/maplibre-gl.mjs", import.meta.url), new URL("../maplibre-gl.mjs", import.meta.url));
copyFileSync(new URL("../node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs", import.meta.url), new URL("../maplibre-gl-shared.mjs", import.meta.url));
copyFileSync(new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url), new URL("../maplibre-gl-worker.mjs", import.meta.url));
copyFileSync(new URL("../node_modules/maplibre-gl/dist/maplibre-gl.css", import.meta.url), new URL("../maplibre-gl.css", import.meta.url));
for (const asset of [
  "favicon.ico", "favicon-16x16.png", "favicon-32x32.png", "favicon-48x48.png",
  "apple-touch-icon.png", "android-chrome-192x192.png", "android-chrome-512x512.png",
  "mstile-150x150.png", "site.webmanifest", "browserconfig.xml",
]) copyFileSync(new URL(`../public/${asset}`, import.meta.url), new URL(`../${asset}`, import.meta.url));
console.log(`Generated index.html with ${places.length} locations, ${topCount} TOP clips and ${countries.length} countries.`);
