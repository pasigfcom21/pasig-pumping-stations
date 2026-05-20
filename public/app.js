// ── State ──────────────────────────────────────────────────────
let currentView = 'public';   // 'admin' | 'public'
let currentUser = null;
let map = null;
let polygonLayers = [];
let markerLayers = [];
let activeStationId = null;
let allStations = [];

// ── Supabase helpers ───────────────────────────────────────────
async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    },
    ...options
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Login / Logout ─────────────────────────────────────────────
function handleLogin() {
  const email    = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const errBox   = document.getElementById('login-error');

  const account = ADMIN_ACCOUNTS.find(a => a.email === email && a.password === password);
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
  initMap();
  loadStations();
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
    // Load stations
    const stations = await supabaseFetch('stations?select=*&order=id');

    // Load ALL reports ordered by newest first
    const reports = await supabaseFetch('status_reports?select=*&order=created_at.desc');

    // Load operators
    const operators = await supabaseFetch('operators?select=*');

    // Merge — pick only the FIRST (newest) report for each station
    allStations = stations.map(s => {
      // Find the most recent report for this station
      const latestReport = reports.find(r => r.station_id === s.id) || {};
      const operator     = operators.find(o => o.station_id === s.id) || {};
      return { ...s, latestReport, operator };
    });

    renderStations(allStations);
    updateSummary(allStations);
    document.getElementById('last-updated').textContent =
      new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

  } catch (err) {
    console.error('Load error:', err);
    document.getElementById('last-updated').textContent = 'Error — check console';
    alert('Could not load station data: ' + err.message);
  }
}

// ── Render stations on map ─────────────────────────────────────
function renderStations(stations) {
  // Clear old layers
  polygonLayers.forEach(l => map.removeLayer(l));
  markerLayers.forEach(l => map.removeLayer(l));
  polygonLayers = [];
  markerLayers = [];

  const statusColor = {
    operational:      '#1D9E75',
    maintenance:      '#EF9F27',
    'non-operational':'#E24B4A'
  };

  stations.forEach(s => {
    const color = statusColor[s.status] || '#378ADD';

    // Coverage polygon
    if (s.coverage_geojson) {
      try {
        const gj   = JSON.parse(s.coverage_geojson);
        const coords = gj.features[0].geometry.coordinates[0];
        const latlngs = coords.map(c => [c[1], c[0]]);
        const poly = L.polygon(latlngs, {
          color: '#378ADD', fillColor: '#378ADD',
          fillOpacity: 0.15, weight: 1.5, dashArray: '4,4'
        }).addTo(map);
        poly.on('mouseover', () => showPanel(s));
        poly.on('click',     () => showPanel(s));
        polygonLayers.push(poly);
      } catch (e) { /* skip bad geojson */ }
    }

    // Marker
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:28px;height:28px;border-radius:50%;
        background:${color};border:3px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.25);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:11px;font-weight:600;cursor:pointer;
      ">${s.id.toString().padStart(2,'0')}</div>`,
      iconSize: [28,28], iconAnchor: [14,14]
    });

    const marker = L.marker([s.lat, s.lng], { icon }).addTo(map);
    marker.on('mouseover', () => showPanel(s));
    marker.on('click',     () => showPanel(s));
    markerLayers.push(marker);
  });
}

// ── Update summary counts ──────────────────────────────────────
function updateSummary(stations) {
  document.getElementById('stat-total').textContent       = 32;
  document.getElementById('stat-operational').textContent = stations.filter(s => s.status === 'operational').length;
  document.getElementById('stat-maintenance').textContent = stations.filter(s => s.status === 'maintenance').length;
  document.getElementById('stat-nonop').textContent       = stations.filter(s => s.status === 'non-operational').length;
}

// ── Side panel ─────────────────────────────────────────────────
function showPanel(s) {
  activeStationId = s.id;

  // Highlight polygon
  polygonLayers.forEach(l => l.setStyle({ fillOpacity:0.15, weight:1.5, color:'#378ADD' }));
  const idx = allStations.findIndex(st => st.id === s.id);
  if (polygonLayers[idx]) {
    polygonLayers[idx].setStyle({ fillOpacity:0.35, weight:2.5, color:'#185FA5' });
  }

  const r = s.latestReport || {};
  const o = s.operator     || {};
  const statusLabel = {
    operational: 'Operational',
    maintenance: 'Under Maintenance',
    'non-operational': 'Non-Operational'
  };
  const statusColor = {
    operational: '#1D9E75',
    maintenance: '#EF9F27',
    'non-operational': '#E24B4A'
  };

  let html = '';

  // Photo (admin only)
  if (currentView === 'admin' && (s.photo_url || r.photo_url)) {
    const photo = r.photo_url || s.photo_url;
    html += `<img src="${photo}" class="panel-photo" alt="Station photo" onerror="this.style.display='none'" />`;
  }

  // Header
  html += `
    <div class="panel-station-header">
      <div class="station-circle" style="background:${statusColor[s.status] || '#378ADD'}">
        ${s.id.toString().padStart(2,'0')}
      </div>
      <div>
        <div class="station-name">${s.name}</div>
        <div class="station-loc">${s.location}</div>
      </div>
    </div>
    <div>
      <span class="status-badge ${s.status}">
        ● ${statusLabel[s.status] || s.status}
      </span>
    </div>
  `;

  if (currentView === 'admin') {
    // Full admin view
    html += `
      <div style="border-top:1px solid #e2e8f0;padding-top:12px;">
        <div class="info-row" style="margin-bottom:8px;">
          <div class="info-row-label">Pump Operator</div>
          <div class="info-row-value" style="font-weight:600;">${o.name || '—'}</div>
        </div>
        <div class="info-row" style="margin-bottom:12px;">
          <div class="info-row-label">Contact</div>
          <div class="info-row-value">📞 ${o.contact || '—'}</div>
        </div>
        <div class="info-grid">
          <div class="info-tile">
            <div class="info-tile-label">Pumps</div>
            <div class="info-tile-value">${s.pumps || '—'}</div>
          </div>
          <div class="info-tile">
            <div class="info-tile-label">Capacity</div>
            <div class="info-tile-value" style="font-size:13px;">${s.capacity || '—'}</div>
          </div>
          <div class="info-tile">
            <div class="info-tile-label">💧 Water Level</div>
            <div class="info-tile-value">${r.water_level || '—'}</div>
          </div>
          <div class="info-tile">
            <div class="info-tile-label">⏱ Runtime</div>
            <div class="info-tile-value" style="font-size:12px;">${r.runtime_hours || '—'}</div>
          </div>
        </div>
        <div class="info-row" style="margin-top:10px;">
          <div class="info-row-label">🔧 Last Maintenance</div>
          <div class="info-row-value">${r.last_maintenance || '—'}</div>
        </div>
      </div>
    `;

    if (r.notes) {
      html += `
        <div>
          <div class="info-row-label" style="margin-bottom:5px;">📋 Operational Notes</div>
          <div class="notes-box">${r.notes}</div>
        </div>
      `;
    }

    html += `
      <button class="btn-edit" onclick="openModal(${s.id})">✏️ Update Station Status</button>
    `;

  } else {
    // Public view
    html += `
      <div style="border-top:1px solid #e2e8f0;padding-top:12px;">
        <div class="info-grid">
          <div class="info-tile">
            <div class="info-tile-label">Pumps</div>
            <div class="info-tile-value">${s.pumps || '—'}</div>
          </div>
          <div class="info-tile">
            <div class="info-tile-label">Capacity</div>
            <div class="info-tile-value" style="font-size:12px;">${s.capacity || '—'}</div>
          </div>
        </div>
        <div style="margin-top:10px;">
          <div class="info-row-label" style="margin-bottom:5px;">📋 Latest Status Report</div>
          <div class="report-box">${r.notes || 'No report available yet.'}</div>
        </div>
        <div style="margin-top:10px;">
          <div class="info-row-label" style="margin-bottom:4px;">🗺 Coverage Area</div>
          <div class="info-row-value" style="font-size:12px;color:#64748b;">
            Highlighted in blue on the map.
          </div>
        </div>
      </div>
    `;
  }

  document.getElementById('panel-content').className = 'panel-body';
  document.getElementById('panel-content').innerHTML = html;
}

// ── Status Update Modal ────────────────────────────────────────
function openModal(stationId) {
  activeStationId = stationId;
  const s = allStations.find(st => st.id === stationId);
  const r = s?.latestReport || {};

  document.getElementById('modal-title').textContent    = `Update: ${s?.name || 'Station'}`;
  document.getElementById('modal-status').value         = s?.status || 'operational';
  document.getElementById('modal-water').value          = r.water_level || '';
  document.getElementById('modal-runtime').value        = r.runtime_hours || '';
  document.getElementById('modal-maintenance').value    = r.last_maintenance || '';
  document.getElementById('modal-notes').value          = r.notes || '';
  document.getElementById('modal-photo').value          = r.photo_url || '';
  document.getElementById('update-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('update-modal').classList.add('hidden');
}

async function submitUpdate() {
  const btn = document.querySelector('.btn-save');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    const status      = document.getElementById('modal-status').value;
    const water_level = document.getElementById('modal-water').value;
    const runtime     = document.getElementById('modal-runtime').value;
    const maintenance = document.getElementById('modal-maintenance').value;
    const notes       = document.getElementById('modal-notes').value;
    const photo_url   = document.getElementById('modal-photo').value;

    // Step 1: Update station status
    const stationRes = await supabaseFetch(`stations?id=eq.${activeStationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
      headers: { 'Prefer': 'return=representation' }
    });
    console.log('Station update result:', stationRes);

    // Step 2: Insert new status report
    const reportRes = await supabaseFetch('status_reports', {
      method: 'POST',
      body: JSON.stringify({
        station_id:       activeStationId,
        water_level,
        runtime_hours:    runtime,
        last_maintenance: maintenance,
        notes,
        photo_url,
        reported_by:      currentUser?.name || 'Admin',
        source:           'manual'
      }),
      headers: { 'Prefer': 'return=representation' }
    });
    console.log('Report insert result:', reportRes);

    // Step 3: Close modal and reload fresh data
    closeModal();
    await loadStations();

    // Step 4: Re-show the updated panel
    const updated = allStations.find(s => s.id === activeStationId);
    if (updated) showPanel(updated);

    // Step 5: Show brief success message
    const banner = document.createElement('div');
    banner.textContent = '✅ Station updated successfully!';
    banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#1D9E75;color:white;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 3000);

  } catch (err) {
    console.error('Full error:', err);
    alert('Error saving update:\n' + err.message + '\n\nCheck that RLS is disabled in Supabase for all tables.');
  } finally {
    btn.textContent = 'Save Update';
    btn.disabled = false;
  }
}

// ── Allow Enter key on login ───────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('login-screen').classList.contains('hidden')) {
    handleLogin();
  }
});

// ── Auto-refresh every 5 minutes ──────────────────────────────
setInterval(() => {
  if (!document.getElementById('dashboard').classList.contains('hidden')) {
    loadStations();
  }
}, 5 * 60 * 1000);
