// ── State ──────────────────────────────────────────────────────
let currentView = 'public';
let currentUser = null;
let map = null;
let polygonLayers = [];
let markerLayers = [];
let activeStationId = null;
let allStations = [];

// ── Supabase helpers ───────────────────────────────────────────
async function supabaseFetch(path, method, body) {
  const url = SUPABASE_URL + '/rest/v1/' + path;

  const fetchOptions = {
    method: method || 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Login / Logout ─────────────────────────────────────────────
function handleLogin() {
  const email    = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const errBox   = document.getElementById('login-error');

  const account = ADMIN_ACCOUNTS.find(function(a) {
    return a.email === email && a.password === password;
  });

  if (!account) {
    errBox.classList.remove('hidden');
    return;
  }

  errBox.classList.add('hidden');
  currentUser = account;
  currentView = 'admin';
  enterDashboard();
}

function enterPublicView() {
  currentUser = null;
  currentView = 'public';
  enterDashboard();
}

function handleLogout() {
  currentUser = null;
  currentView = 'public';
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  if (map) { map.remove(); map = null; }
}

function enterDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  updateViewBadge();
  // Small delay lets the browser fully render the map div
  // before Leaflet tries to calculate its size
  setTimeout(function() {
    initMap();
    loadStations();
  }, 100);
}

function updateViewBadge() {
  const badge = document.getElementById('view-badge');
  const icon  = document.getElementById('view-badge-icon');
  const label = document.getElementById('view-badge-label');
  if (currentView === 'admin') {
    badge.className = 'badge-admin';
    icon.textContent  = '🔒';
    label.textContent = 'Admin View';
    document.getElementById('logout-btn').style.display = '';
  } else {
    badge.className = 'badge-public';
    icon.textContent  = '🌐';
    label.textContent = 'Public View';
    document.getElementById('logout-btn').style.display = 'none';
  }
}

// ── Map ────────────────────────────────────────────────────────
function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl: true }).setView([14.5600, 121.0748], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);
}

// ── Load stations from Supabase ────────────────────────────────
async function loadStations() {
  document.getElementById('last-updated').textContent = 'Loading…';
  try {
    const stations  = await supabaseFetch('stations?select=*&order=id');
    const reports   = await supabaseFetch('status_reports?select=*&order=created_at.desc');
    const operators = await supabaseFetch('operators?select=*');

    allStations = stations.map(function(s) {
      const latestReport = reports.find(function(r) { return r.station_id === s.id; }) || {};
      const operator     = operators.find(function(o) { return o.station_id === s.id; }) || {};
      return Object.assign({}, s, { latestReport: latestReport, operator: operator });
    });

    renderStations(allStations);
    updateSummary(allStations);
    document.getElementById('last-updated').textContent =
      new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

  } catch (err) {
    console.error('Load error:', err);
    document.getElementById('last-updated').textContent = 'Error loading';
    alert('Could not load data: ' + err.message);
  }
}

// ── Render stations on map ─────────────────────────────────────
function renderStations(stations) {
  if (!map) { console.warn("Map not ready"); return; }
  polygonLayers.forEach(function(l) { if (l) map.removeLayer(l); });
  markerLayers.forEach(function(l) { if (l) map.removeLayer(l); });
  polygonLayers = [];
  markerLayers = [];

  var statusColor = {
    'operational': '#1D9E75',
    'maintenance': '#EF9F27',
    'non-operational': '#E24B4A'
  };

  stations.forEach(function(s) {
    var color = statusColor[s.status] || '#378ADD';

    if (s.coverage_geojson) {
      try {
        var gj = JSON.parse(s.coverage_geojson);
        var coords = gj.features[0].geometry.coordinates[0];
        var latlngs = coords.map(function(c) { return [c[1], c[0]]; });
        var poly = L.polygon(latlngs, {
          color: '#378ADD', fillColor: '#378ADD',
          fillOpacity: 0.15, weight: 1.5, dashArray: '4,4'
        }).addTo(map);
        poly.on('mouseover', function() { showPanel(s); });
        poly.on('click', function() { showPanel(s); });
        polygonLayers.push(poly);
      } catch(e) { polygonLayers.push(null); }
    } else {
      polygonLayers.push(null);
    }

    var iconHtml = '<div style="width:28px;height:28px;border-radius:50%;background:' + color + ';border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:600;cursor:pointer;">' + s.id.toString().padStart(2,'0') + '</div>';

    var icon = L.divIcon({ className: '', html: iconHtml, iconSize: [28,28], iconAnchor: [14,14] });
    var marker = L.marker([s.lat, s.lng], { icon: icon }).addTo(map);
    marker.on('mouseover', function() { showPanel(s); });
    marker.on('click', function() { showPanel(s); });
    markerLayers.push(marker);
  });
}

// ── Update summary counts ──────────────────────────────────────
function updateSummary(stations) {
  document.getElementById('stat-total').textContent       = 32;
  document.getElementById('stat-operational').textContent = stations.filter(function(s) { return s.status === 'operational'; }).length;
  document.getElementById('stat-maintenance').textContent = stations.filter(function(s) { return s.status === 'maintenance'; }).length;
  document.getElementById('stat-nonop').textContent       = stations.filter(function(s) { return s.status === 'non-operational'; }).length;
}

// ── Side panel ─────────────────────────────────────────────────
function showPanel(s) {
  activeStationId = s.id;

  polygonLayers.forEach(function(l) {
    if (l) l.setStyle({ fillOpacity:0.15, weight:1.5, color:'#378ADD' });
  });
  var idx = allStations.findIndex(function(st) { return st.id === s.id; });
  if (polygonLayers[idx]) {
    polygonLayers[idx].setStyle({ fillOpacity:0.35, weight:2.5, color:'#185FA5' });
  }

  var r = s.latestReport || {};
  var o = s.operator     || {};

  var statusLabel = {
    'operational': 'Operational',
    'maintenance': 'Under Maintenance',
    'non-operational': 'Non-Operational'
  };
  var statusColor = {
    'operational': '#1D9E75',
    'maintenance': '#EF9F27',
    'non-operational': '#E24B4A'
  };

  var color = statusColor[s.status] || '#378ADD';
  var label = statusLabel[s.status] || s.status;

  var html = '';

  if (currentView === 'admin' && (s.photo_url || r.photo_url)) {
    var photo = r.photo_url || s.photo_url;
    html += '<img src="' + photo + '" class="panel-photo" alt="Station photo" onerror="this.style.display=\'none\'" />';
  }

  html += '<div class="panel-station-header">';
  html += '<div class="station-circle" style="background:' + color + '">' + s.id.toString().padStart(2,'0') + '</div>';
  html += '<div><div class="station-name">' + s.name + '</div><div class="station-loc">' + s.location + '</div></div>';
  html += '</div>';
  html += '<div><span class="status-badge ' + s.status + '">● ' + label + '</span></div>';

  if (currentView === 'admin') {
    html += '<div style="border-top:1px solid #e2e8f0;padding-top:12px;">';
    html += '<div class="info-row" style="margin-bottom:8px;"><div class="info-row-label">Pump Operator</div><div class="info-row-value" style="font-weight:600;">' + (o.name || '—') + '</div></div>';
    html += '<div class="info-row" style="margin-bottom:12px;"><div class="info-row-label">Contact</div><div class="info-row-value">📞 ' + (o.contact || '—') + '</div></div>';
    html += '<div class="info-grid">';
    html += '<div class="info-tile"><div class="info-tile-label">Pumps</div><div class="info-tile-value">' + (s.pumps || '—') + '</div></div>';
    html += '<div class="info-tile"><div class="info-tile-label">Capacity</div><div class="info-tile-value" style="font-size:13px;">' + (s.capacity || '—') + '</div></div>';
    html += '<div class="info-tile"><div class="info-tile-label">💧 Water Level</div><div class="info-tile-value">' + (r.water_level || '—') + '</div></div>';
    html += '<div class="info-tile"><div class="info-tile-label">⏱ Runtime</div><div class="info-tile-value" style="font-size:12px;">' + (r.runtime_hours || '—') + '</div></div>';
    html += '</div>';
    html += '<div class="info-row" style="margin-top:10px;"><div class="info-row-label">🔧 Last Maintenance</div><div class="info-row-value">' + (r.last_maintenance || '—') + '</div></div>';
    html += '</div>';

    if (r.notes) {
      html += '<div><div class="info-row-label" style="margin-bottom:5px;">📋 Operational Notes</div><div class="notes-box">' + r.notes + '</div></div>';
    }

    html += '<button class="btn-edit" onclick="openModal(' + s.id + ')">✏️ Update Station Status</button>';

  } else {
    html += '<div style="border-top:1px solid #e2e8f0;padding-top:12px;">';
    html += '<div class="info-grid">';
    html += '<div class="info-tile"><div class="info-tile-label">Pumps</div><div class="info-tile-value">' + (s.pumps || '—') + '</div></div>';
    html += '<div class="info-tile"><div class="info-tile-label">Capacity</div><div class="info-tile-value" style="font-size:12px;">' + (s.capacity || '—') + '</div></div>';
    html += '</div>';
    html += '<div style="margin-top:10px;"><div class="info-row-label" style="margin-bottom:5px;">📋 Latest Status Report</div><div class="report-box">' + (r.notes || 'No report available yet.') + '</div></div>';
    html += '<div style="margin-top:10px;"><div class="info-row-label" style="margin-bottom:4px;">🗺 Coverage Area</div><div class="info-row-value" style="font-size:12px;color:#64748b;">Highlighted in blue on the map.</div></div>';
    html += '</div>';
  }

  document.getElementById('panel-content').className = 'panel-body';
  document.getElementById('panel-content').innerHTML = html;
}

// ── Status Update Modal ────────────────────────────────────────
function openModal(stationId) {
  activeStationId = stationId;
  var s = allStations.find(function(st) { return st.id === stationId; });
  var r = (s && s.latestReport) ? s.latestReport : {};

  document.getElementById('modal-title').textContent     = 'Update: ' + (s ? s.name : 'Station');
  document.getElementById('modal-status').value          = s ? s.status : 'operational';
  document.getElementById('modal-water').value           = r.water_level || '';
  document.getElementById('modal-runtime').value         = r.runtime_hours || '';
  document.getElementById('modal-maintenance').value     = r.last_maintenance || '';
  document.getElementById('modal-notes').value           = r.notes || '';
  document.getElementById('modal-photo').value           = r.photo_url || '';
  document.getElementById('update-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('update-modal').classList.add('hidden');
}

async function submitUpdate() {
  var btn = document.querySelector('.btn-save');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    var status      = document.getElementById('modal-status').value;
    var water_level = document.getElementById('modal-water').value;
    var runtime     = document.getElementById('modal-runtime').value;
    var maintenance = document.getElementById('modal-maintenance').value;
    var notes       = document.getElementById('modal-notes').value;
    var photo_url   = document.getElementById('modal-photo').value;

    // Step 1: Update station status
    await supabaseFetch(
      'stations?id=eq.' + activeStationId,
      'PATCH',
      { status: status }
    );

    // Step 2: Insert new status report
    await supabaseFetch(
      'status_reports',
      'POST',
      {
        station_id:       activeStationId,
        water_level:      water_level,
        runtime_hours:    runtime,
        last_maintenance: maintenance,
        notes:            notes,
        photo_url:        photo_url,
        reported_by:      currentUser ? currentUser.name : 'Admin',
        source:           'manual'
      }
    );

    closeModal();
    await loadStations();

    var updated = allStations.find(function(s) { return s.id === activeStationId; });
    if (updated) showPanel(updated);

    var banner = document.createElement('div');
    banner.textContent = '✅ Station updated successfully!';
    banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#1D9E75;color:white;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
    document.body.appendChild(banner);
    setTimeout(function() { banner.remove(); }, 3000);

  } catch (err) {
    console.error('Save error:', err);
    alert('Error saving update:\n' + err.message);
  } finally {
    btn.textContent = 'Save Update';
    btn.disabled = false;
  }
}

// ── Enter key on login ─────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !document.getElementById('login-screen').classList.contains('hidden')) {
    handleLogin();
  }
});

// ── Auto-refresh every 5 minutes ──────────────────────────────
setInterval(function() {
  if (!document.getElementById('dashboard').classList.contains('hidden')) {
    loadStations();
  }
}, 5 * 60 * 1000);
