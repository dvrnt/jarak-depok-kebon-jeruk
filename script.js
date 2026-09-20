const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('mapSvg');
const routeLine = document.getElementById('routeLine');
const routeShadow = document.getElementById('routeShadow');
const routeMarkers = document.getElementById('routeMarkers');
const endpoints = document.getElementById('endpoints');
const distanceTicks = document.getElementById('distanceTicks');
const routeList = document.getElementById('routeList');
const overview = document.getElementById('overview');
const basemap = document.querySelector('.basemap');
const panel = document.getElementById('panel');
const root = document.documentElement;

const route = window.routeData;
const mapBounds = { tileX: 3262, tileY: 2118 };
const editorial = { oneWay: 35.8, daily: 71.6, monthly: 1575 };
const segments = [
  { name: 'Sukatani–Pekapuran', note: 'Akses hunian bertemu arus utama', fraction: .08 },
  { name: 'Jalan Raya Bogor', note: 'Koridor panjang menuju Jakarta', fraction: .22 },
  { name: 'Cibubur–Pasar Rebo', note: 'Perubahan arus dan simpang besar', fraction: .38 },
  { name: 'Pasar Minggu–Mampang', note: 'Kepadatan koridor perkantoran', fraction: .57 },
  { name: 'Kebayoran Lama', note: 'Bottleneck dan aktivitas kawasan', fraction: .76 },
  { name: 'Pos Pengumben–Kebon Jeruk', note: 'Arus masuk menuju tujuan akhir', fraction: .93 }
];

function project([lon, lat]) {
  const world = 2 ** 20;
  const x = (lon + 180) / 360 * world;
  const y = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * world;
  return [x - mapBounds.tileX * 256, y - mapBounds.tileY * 256];
}

function make(tag, attrs = {}, text = '') {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}

function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const lat1 = a[1] * rad;
  const lat2 = b[1] * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const distances = [0];
for (let i = 1; i < route.coordinates.length; i += 1) {
  distances.push(distances[i - 1] + haversine(route.coordinates[i - 1], route.coordinates[i]));
}
const totalDistance = distances.at(-1);

function pointAtFraction(fraction) {
  const target = totalDistance * fraction;
  let i = 1;
  while (i < distances.length && distances[i] < target) i += 1;
  const a = route.coordinates[Math.max(0, i - 1)];
  const b = route.coordinates[Math.min(route.coordinates.length - 1, i)];
  const span = distances[i] - distances[i - 1] || 1;
  const t = (target - distances[i - 1]) / span;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function pathD(coords) {
  return coords.map((coord, index) => {
    const [x, y] = project(coord);
    return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function formatKm(value) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value);
}

const routePath = pathD(route.coordinates);
routeLine.setAttribute('d', routePath);
routeLine.setAttribute('pathLength', '100');
routeShadow.setAttribute('d', routePath);

function renderContext() {
  const context = document.getElementById('mapContext');
  const labels = [
    ['DEPOK', project([106.875, -6.33])],
    ['JAKARTA SELATAN', project([106.82, -6.275])],
    ['JAKARTA BARAT', project([106.78, -6.2])]
  ];
  labels.forEach(([label, [x, y]]) => context.appendChild(make('text', { class: 'context-label', x, y }, label)));

}

function renderDistanceTicks() {
  for (let km = 5; km < editorial.oneWay; km += 5) {
    const fraction = km / editorial.oneWay;
    const [lon, lat] = pointAtFraction(fraction);
    const [x, y] = project([lon, lat]);
    const [lon2, lat2] = pointAtFraction(Math.min(1, fraction + .004));
    const [x2, y2] = project([lon2, lat2]);
    const dx = x2 - x;
    const dy = y2 - y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const group = make('g', { class: 'distance-tick' });
    group.appendChild(make('line', { x1: x - nx * 5, y1: y - ny * 5, x2: x + nx * 5, y2: y + ny * 5 }));
    group.appendChild(make('text', { x: x + nx * 9, y: y + ny * 9 }, `${km} km`));
    distanceTicks.appendChild(group);
  }
}

function renderEndpoints() {
  const points = [
    { data: route.origin, label: 'RUMAH', className: 'origin', dy: 18 },
    { data: route.destination, label: 'KANTOR', className: 'work', dy: -16 }
  ];
  points.forEach(({ data, label, className, dy }) => {
    const [x, y] = project([data.lon, data.lat]);
    const group = make('g', { class: `endpoint ${className}` });
    group.appendChild(make('circle', { class: 'outer', cx: x, cy: y, r: 9 }));
    group.appendChild(make('circle', { class: 'inner', cx: x, cy: y, r: 4 }));
    const labelOnLeft = className === 'origin';
    group.appendChild(make('text', { x: x + (labelOnLeft ? -13 : 13), y: y + dy, 'text-anchor': labelOnLeft ? 'end' : 'start' }, label));
    endpoints.appendChild(group);
  });
}

function selectSegment(index) {
  document.querySelectorAll('.route-row').forEach((row, i) => row.classList.toggle('active', i === index));
  document.querySelectorAll('.overview-bar').forEach((bar, i) => {
    bar.classList.toggle('active', i === index);
    bar.setAttribute('aria-selected', String(i === index));
  });
  document.querySelectorAll('.route-marker').forEach((marker, i) => marker.classList.toggle('active', i === index));
  routeLine.style.strokeDasharray = 'none';
  routeLine.style.strokeDashoffset = '0';
  routeLine.classList.remove('route-muted');
}

function renderSegments() {
  const values = segments.map((segment, index) => {
    const start = index === 0 ? 0 : segments[index - 1].fraction;
    return Math.max(.5, (segment.fraction - start) * editorial.oneWay);
  });
  segments.forEach((segment, index) => {
    const point = project(pointAtFraction(segment.fraction));
    const marker = make('g', { class: 'route-marker', tabindex: '0', role: 'button', 'aria-label': `${index + 1}. ${segment.name}` });
    marker.appendChild(make('circle', { cx: point[0], cy: point[1], r: 9 }));
    marker.appendChild(make('text', { x: point[0], y: point[1] }, String(index + 1).padStart(2, '0')));
    marker.addEventListener('click', () => selectSegment(index));
    marker.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectSegment(index); }
    });
    routeMarkers.appendChild(marker);

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'route-row';
    row.innerHTML = `<span class="num">${String(index + 1).padStart(2, '0')}</span><span><strong>${segment.name}</strong><em>${segment.note}</em></span><span class="km">${formatKm(values[index])} km</span>`;
    row.addEventListener('click', () => selectSegment(index));
    routeList.appendChild(row);

    const bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'overview-bar';
    bar.setAttribute('role', 'listitem');
    bar.setAttribute('aria-label', `${segment.name}, ${formatKm(values[index])} kilometer`);
    bar.innerHTML = `<i style="height:${Math.max(16, values[index] / Math.max(...values) * 100)}%"></i><b>${index + 1}</b>`;
    bar.addEventListener('click', () => selectSegment(index));
    overview.appendChild(bar);
  });
}

function setSheet(open) {
  const sheet = document.getElementById('more');
  const detail = document.getElementById('detail');
  const scrim = document.getElementById('scrim');
  if (open) {
    sheet.classList.add('open');
    panel.classList.add('sheet');
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('open'));
    detail.setAttribute('aria-expanded', 'true');
    document.getElementById('sheetClose').focus();
  } else {
    sheet.classList.remove('open');
    panel.classList.remove('sheet');
    scrim.classList.remove('open');
    scrim.hidden = true;
    detail.setAttribute('aria-expanded', 'false');
    detail.focus();
  }
}

function syncHudHeight() {
  const compact = panel.getBoundingClientRect().width >= document.documentElement.clientWidth - 1;
  if (!compact) {
    root.style.removeProperty('--hud-h');
    return;
  }
  root.style.setProperty('--hud-h', `${Math.round(panel.getBoundingClientRect().height)}px`);
}

function syncMapAspect() {
  const compact = window.matchMedia('(max-width:900px), (max-aspect-ratio:1/1)').matches;
  const aspect = compact ? 'none' : 'xMidYMid meet';
  svg.setAttribute('preserveAspectRatio', aspect);
  basemap.setAttribute('preserveAspectRatio', aspect);
}

renderContext();
renderDistanceTicks();
renderEndpoints();
renderSegments();
selectSegment(0);
syncHudHeight();
syncMapAspect();
window.addEventListener('resize', () => { syncHudHeight(); syncMapAspect(); });
if (window.ResizeObserver) new ResizeObserver(syncHudHeight).observe(panel);
if (document.fonts?.ready) document.fonts.ready.then(syncHudHeight);

document.getElementById('detail').addEventListener('click', () => setSheet(true));
document.getElementById('sheetClose').addEventListener('click', () => setSheet(false));
document.getElementById('scrim').addEventListener('click', () => setSheet(false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('more').classList.contains('open')) setSheet(false);
});
