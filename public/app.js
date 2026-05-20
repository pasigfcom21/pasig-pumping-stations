// ── State ──────────────────────────────────────────────────────
var currentView = 'public';
var currentUser = null;
var leafletMap = null;
var polygonLayers = [];
var markerLayers = [];
var activeStationId = null;
var allStations = [];

// ── Supabase fetch ─────────────────────────────────────────────
function dbFetch(path, method, body) {
  var url = SUPABASE_URL + '/rest/v1/' + path;
  var opts = {
    method: method || 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(url, opts).then(function(res) {
    return res.text().then(function(text) {
      if (!res.ok) throw new Error(text);
      return text ? JSON.parse(text) : [];
    });
  });
}

// ── Login ──────────────────────────────────────────────────────
function handleLogin() {
  var email    = document.getElementById('login-email').value.trim().toLowerCase();
  var password = document.getElementById('login-password').value;
  var errBox   = document.getElementById('login-error');
  var found    = null;

  for (var i = 0; i < ADMIN_ACCOUNTS.length; i++) {
    if (ADMIN_ACCOUNTS[i].email === email && ADMIN_ACCOUNTS[i].password === password) {
      found = ADMIN_ACCOUNTS[i];
      break;
    }
  }

  if (!found) { errBox.classList.remove('hidden'); return; }
  errBox.classList.add('hidden');
  currentUser = found;
  currentView = 'admin';
  showDashboard();
}

function enterPublicView() {
  currentUser = null;
  currentView = 'public';
  showDashboard();
}

function handleLogout() {
  currentUser = null;
  currentView = 'public';
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}

function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  // Update badge
  var badge = document.getElementById('view-badge');
  var icon  = document.getElementById('view-badge-icon');
  var label = document.getElementById('view-badge-label');
  var logoutBtn = document.getElementById('logout-btn');

  if (currentView === 'admin') {
    badge.className = 'badge-admin';
    icon.textContent  = '🔒';
    label.textContent = 'Admin View';
    logoutBtn.style.display = '';
  } else {
    badge.className = 'badge-public';
    icon.textContent  = '🌐';
    label.textContent = 'Public View';
    logoutBtn.style.display = 'none';
  }

  // Init map after a short delay so the div is visible and sized
  setTimeout(function() {
    if (!leafletMap) {
      leafletMap = L.map('map', { zoomControl: true });
      leafletMap.setView([14.5600, 121.0748], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
      }).addTo(leafletMap);
      // Force map to recalculate size
      leafletMap.invalidateSize();
    }
    loadAndRender();
  }, 300);
}

// ── Load data ──────────────────────────────────────────────────
function loadAndRender() {
  document.getElementById('last-updated').textContent = 'Loading…';

  var stationsPromise = dbFetch('stations?select=*&order=id');
  var reportsPromise  = dbFetch('status_reports?select=*&order=id.desc');
  var opsPromise      = dbFetch('operators?select=*');

  Promise.all([stationsPromise, reportsPromise, opsPromise])
    .then(function(results) {
      var stations  = results[0];
      var reports   = results[1];
      var operators = results[2];

      allStations = stations.map(function(s) {
        // Use == not === to handle string/number type mismatches from DB
        var latestReport = null;
        for (var i = 0; i < reports.length; i++) {
          if (String(reports[i].station_id) === String(s.id)) { latestReport = reports[i]; break; }
        }
        var operator = null;
        for (var j = 0; j < operators.length; j++) {
          if (String(operators[j].station_id) === String(s.id)) { operator = operators[j]; break; }
        }
        s.latestReport = latestReport || {};
        s.operator     = operator     || {};
        return s;
      });

      drawStations();
      updateCounts();

      document.getElementById('last-updated').textContent =
        new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    })
    .catch(function(err) {
      console.error('Load error:', err);
      document.getElementById('last-updated').textContent = 'Load failed';
      alert('Could not load data.\n\n' + err.message);
    });
}

// shortcut for refresh button
function loadStations() { loadAndRender(); }

// ── Draw markers & polygons ────────────────────────────────────
function drawStations() {
  // Remove old layers
  for (var i = 0; i < polygonLayers.length; i++) {
    if (polygonLayers[i]) leafletMap.removeLayer(polygonLayers[i]);
  }
  for (var j = 0; j < markerLayers.length; j++) {
    if (markerLayers[j]) leafletMap.removeLayer(markerLayers[j]);
  }
  polygonLayers = [];
  markerLayers  = [];

  var colors = { 'operational':'#1D9E75', 'maintenance':'#EF9F27', 'non-operational':'#E24B4A' };

  allStations.forEach(function(s) {
    var color = colors[s.status] || '#378ADD';

    // Polygon
    var poly = null;
    if (s.coverage_geojson) {
      try {
        var gj     = JSON.parse(s.coverage_geojson);
        var coords = gj.features[0].geometry.coordinates[0];
        var latlngs = coords.map(function(c) { return [c[1], c[0]]; });
        poly = L.polygon(latlngs, {
          color: '#378ADD', fillColor: '#378ADD',
          fillOpacity: 0.15, weight: 1.5, dashArray: '4,4'
        }).addTo(leafletMap);
        (function(station) {
          poly.on('mouseover', function() { showPanel(station); });
          poly.on('click',     function() { showPanel(station); });
        })(s);
      } catch(e) { poly = null; }
    }
    polygonLayers.push(poly);

    // Marker
    var num  = s.id.toString().padStart(2, '0');
    var html = '<div style="width:28px;height:28px;border-radius:50%;background:' + color +
               ';border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);display:flex;' +
               'align-items:center;justify-content:center;color:white;font-size:11px;' +
               'font-weight:600;cursor:pointer;">' + num + '</div>';
    var icon   = L.divIcon({ className: '', html: html, iconSize: [28,28], iconAnchor: [14,14] });
    var marker = L.marker([s.lat, s.lng], { icon: icon }).addTo(leafletMap);

    (function(station) {
      marker.on('mouseover', function() { showPanel(station); });
      marker.on('click',     function() { showPanel(station); });
    })(s);
    markerLayers.push(marker);
  });
}

// ── Summary counts ─────────────────────────────────────────────
function updateCounts() {
  var op = 0, mt = 0, no = 0;
  allStations.forEach(function(s) {
    if (s.status === 'operational')    op++;
    if (s.status === 'maintenance')    mt++;
    if (s.status === 'non-operational') no++;
  });
  document.getElementById('stat-total').textContent       = 32;
  document.getElementById('stat-operational').textContent = op;
  document.getElementById('stat-maintenance').textContent = mt;
  document.getElementById('stat-nonop').textContent       = no;
}

// ── Side panel ─────────────────────────────────────────────────
function showPanel(s) {
  activeStationId = s.id;

  // Reset all polygons then highlight the selected one
  for (var i = 0; i < polygonLayers.length; i++) {
    if (polygonLayers[i]) polygonLayers[i].setStyle({ fillOpacity:0.15, weight:1.5, color:'#378ADD' });
  }
  var idx = allStations.indexOf(s);
  if (idx >= 0 && polygonLayers[idx]) {
    polygonLayers[idx].setStyle({ fillOpacity:0.35, weight:2.5, color:'#185FA5' });
  }

  var r = s.latestReport || {};
  var o = s.operator     || {};

  var statusColors = { 'operational':'#1D9E75','maintenance':'#EF9F27','non-operational':'#E24B4A' };
  var statusLabels = { 'operational':'Operational','maintenance':'Under Maintenance','non-operational':'Non-Operational' };
  var color = statusColors[s.status] || '#378ADD';
  var label = statusLabels[s.status] || s.status;
  var num   = s.id.toString().padStart(2,'0');

  var html = '';

  // Photo (admin only)
  if (currentView === 'admin' && (r.photo_url || s.photo_url)) {
    html += '<img src="' + (r.photo_url || s.photo_url) + '" class="panel-photo" alt="Photo" onerror="this.style.display=\'none\'">';
  }

  // Header
  html += '<div class="panel-station-header">';
  html += '<div class="station-circle" style="background:' + color + '">' + num + '</div>';
  html += '<div><div class="station-name">' + s.name + '</div>';
  html += '<div class="station-loc">' + s.location + '</div></div></div>';
  html += '<span class="status-badge ' + s.status + '">● ' + label + '</span>';

  if (currentView === 'admin') {
    html += '<div style="border-top:1px solid #e2e8f0;padding-top:12px;">';
    html += '<div class="info-row" style="margin-bottom:8px;">';
    html += '<div class="info-row-label">Pump Operator</div>';
    html += '<div class="info-row-value" style="font-weight:600;">' + (o.name || '—') + '</div></div>';
    html += '<div class="info-row" style="margin-bottom:12px;">';
    html += '<div class="info-row-label">Contact</div>';
    html += '<div class="info-row-value">📞 ' + (o.contact || '—') + '</div></div>';
    html += '<div class="info-grid">';
    html += '<div class="info-tile"><div class="info-tile-label">Pumps</div><div class="info-tile-value">' + (s.pumps || '—') + '</div></div>';
    html += '<div class="info-tile"><div class="info-tile-label">Capacity</div><div class="info-tile-value" style="font-size:13px;">' + (s.capacity || '—') + '</div></div>';
    html += '<div class="info-tile"><div class="info-tile-label">💧 Water Level</div><div class="info-tile-value">' + (r.water_level || '—') + '</div></div>';
    html += '<div class="info-tile"><div class="info-tile-label">⏱ Runtime</div><div class="info-tile-value" style="font-size:12px;">' + (r.runtime_hours || '—') + '</div></div>';
    html += '</div>';
    html += '<div class="info-row" style="margin-top:10px;">';
    html += '<div class="info-row-label">🔧 Last Maintenance</div>';
    html += '<div class="info-row-value">' + (r.last_maintenance || '—') + '</div></div></div>';
    if (r.notes) {
      html += '<div><div class="info-row-label" style="margin-bottom:5px;">📋 Operational Notes</div>';
      html += '<div class="notes-box">' + r.notes + '</div></div>';
    }
    html += '<button class="btn-edit" onclick="openModal(' + s.id + ')">✏️ Update Station Status</button>';

  } else {
    html += '<div style="border-top:1px solid #e2e8f0;padding-top:12px;">';
    html += '<div class="info-grid">';
    html += '<div class="info-tile"><div class="info-tile-label">Pumps</div><div class="info-tile-value">' + (s.pumps || '—') + '</div></div>';
    html += '<div class="info-tile"><div class="info-tile-label">Capacity</div><div class="info-tile-value" style="font-size:12px;">' + (s.capacity || '—') + '</div></div>';
    html += '</div>';
    html += '<div style="margin-top:10px;"><div class="info-row-label" style="margin-bottom:5px;">📋 Latest Status Report</div>';
    html += '<div class="report-box">' + (r.notes || 'No report available yet.') + '</div></div>';
    html += '<div style="margin-top:10px;"><div class="info-row-label" style="margin-bottom:4px;">🗺 Coverage Area</div>';
    html += '<div class="info-row-value" style="font-size:12px;color:#64748b;">Highlighted in blue on the map.</div></div></div>';
  }

  document.getElementById('panel-content').className = 'panel-body';
  document.getElementById('panel-content').innerHTML = html;
}

// ── Modal ──────────────────────────────────────────────────────
function openModal(stationId) {
  activeStationId = stationId;
  var s = null;
  for (var i = 0; i < allStations.length; i++) {
    if (allStations[i].id === stationId) { s = allStations[i]; break; }
  }
  var r = (s && s.latestReport) ? s.latestReport : {};

  document.getElementById('modal-title').textContent      = 'Update: ' + (s ? s.name : 'Station');
  document.getElementById('modal-status').value           = s ? s.status : 'operational';
  document.getElementById('modal-water').value            = r.water_level      || '';
  document.getElementById('modal-runtime').value          = r.runtime_hours    || '';
  document.getElementById('modal-maintenance').value      = r.last_maintenance || '';
  document.getElementById('modal-notes').value            = r.notes            || '';
  document.getElementById('modal-photo').value            = r.photo_url        || '';
  document.getElementById('update-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('update-modal').classList.add('hidden');
}

function submitUpdate() {
  var btn    = document.querySelector('.btn-save');
  var status = document.getElementById('modal-status').value;
  var water  = document.getElementById('modal-water').value;
  var runtime= document.getElementById('modal-runtime').value;
  var maint  = document.getElementById('modal-maintenance').value;
  var notes  = document.getElementById('modal-notes').value;
  var photo  = document.getElementById('modal-photo').value;
  var sid    = activeStationId;

  btn.textContent = 'Saving…';
  btn.disabled = true;

  // Step 1: update station status
  dbFetch('stations?id=eq.' + sid, 'PATCH', { status: status })
    .then(function() {
      // Step 2: insert status report
      return dbFetch('status_reports', 'POST', {
        station_id:       sid,
        water_level:      water,
        runtime_hours:    runtime,
        last_maintenance: maint,
        notes:            notes,
        photo_url:        photo,
        reported_by:      currentUser ? currentUser.name : 'Admin',
        source:           'manual'
      });
    })
    .then(function() {
      closeModal();
      btn.textContent = 'Save Update';
      btn.disabled = false;

      // Reload data then refresh panel
      loadAndRenderThen(function() {
        for (var i = 0; i < allStations.length; i++) {
          if (allStations[i].id === sid) { showPanel(allStations[i]); break; }
        }
        var banner = document.createElement('div');
        banner.textContent = '✅ Station updated successfully!';
        banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#1D9E75;color:white;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
        document.body.appendChild(banner);
        setTimeout(function() { banner.remove(); }, 3000);
      });
    })
    .catch(function(err) {
      console.error('Save error:', err);
      btn.textContent = 'Save Update';
      btn.disabled = false;
      alert('Error saving:\n' + err.message);
    });
}

// Load and render, then run a callback when done
function loadAndRenderThen(callback) {
  document.getElementById('last-updated').textContent = 'Loading…';

  Promise.all([
    dbFetch('stations?select=*&order=id'),
    dbFetch('status_reports?select=*&order=id.desc'),
    dbFetch('operators?select=*')
  ]).then(function(results) {
    var stations  = results[0];
    var reports   = results[1];
    var operators = results[2];

    allStations = stations.map(function(s) {
      var latestReport = null;
      for (var i = 0; i < reports.length; i++) {
        if (String(reports[i].station_id) === String(s.id)) { latestReport = reports[i]; break; }
      }
      var operator = null;
      for (var j = 0; j < operators.length; j++) {
        if (String(operators[j].station_id) === String(s.id)) { operator = operators[j]; break; }
      }
      s.latestReport = latestReport || {};
      s.operator     = operator     || {};
      return s;
    });

    drawStations();
    updateCounts();
    document.getElementById('last-updated').textContent =
      new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

    if (callback) callback();
  }).catch(function(err) {
    console.error('Reload error:', err);
    document.getElementById('last-updated').textContent = 'Load failed';
  });
}

// ── Enter key on login ─────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    var loginScreen = document.getElementById('login-screen');
    if (!loginScreen.classList.contains('hidden')) handleLogin();
  }
});

// ── Auto-refresh every 5 minutes ──────────────────────────────
setInterval(function() {
  var dash = document.getElementById('dashboard');
  if (dash && !dash.classList.contains('hidden')) loadAndRender();
}, 300000);
