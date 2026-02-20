// ── Map setup ──────────────────────────────────────────────────────────────
const map = L.map('map').setView([70.0, 20.0], 6);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO'
}).addTo(map);

// Draw the monitored bounding box on the map
const trackedArea = L.rectangle(
    [[68.0, 14.0], [74.0, 41.0]],  // [south, west], [north, east]
    {
        color: '#00ff41',
        weight: 0.5,
        fillColor: '#00ff41',
        fillOpacity: 0.03,
        dashArray: '4, 8'
    }
).addTo(map);

// Track active markers, the selected vessel, and the current trail
let markers = [];
let activeTrail = null;
let selectedMarker = null;

// ── Helper functions ────────────────────────────────────────────────────────

// Map AIS navigational status code to a display color
function statusColor(code) {
    const colors = {
        0: '#00ff41',  // underway
        1: '#ffd700',  // at anchor
        2: '#ff4444',  // not under command
        3: '#ff4444',  // restricted
        4: '#ff4444',  // constrained by draught
        5: '#00ffff',  // moored
        6: '#ff4444',  // aground
        7: '#ffd700',  // fishing
        8: '#00ff41',  // sailing
    };
    return colors[code] ?? '#888888';  // grey for unknown
}

// Map AIS navigational status code to a human-readable label
function navStatus(code) {
    const statuses = {
        0: 'UNDERWAY',
        1: 'AT ANCHOR',
        2: 'NOT UNDER COMMAND',
        3: 'RESTRICTED',
        4: 'CONSTRAINED BY DRAUGHT',
        5: 'MOORED',
        6: 'AGROUND',
        7: 'FISHING',
        8: 'SAILING',
        15: 'UNKNOWN'
    };
    return statuses[code] ?? 'UNKNOWN';
}

// Create a Leaflet icon for a vessel:
// - Arrow (▲) rotated to course direction if course is available
// - Dot (●) if course is unavailable
function createArrowIcon(course, color) {
    const validCourse = course != null && course < 360;
    const rotation = validCourse ? course : 0;
    const symbol = validCourse ? '▲' : '●';
    const size = validCourse ? '12px' : '16px';
    return L.divIcon({
        className: '',
        html: `<div style="
            color: ${color};
            font-size: ${size};
            transform: rotate(${rotation}deg);
            line-height: 1;
        ">${symbol}</div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
}

// Populate the vessel info panel with data for a given ship
function updateVesselPanel(ship) {
    const color = statusColor(ship.navigational_status);
    document.getElementById('vessel-info').innerHTML = `
        <div class="panel-title">// VESSEL</div>
        <div class="stat-row"><span class="stat-label">NAME</span><span class="stat-value">${ship.name}</span></div>
        <div class="stat-row"><span class="stat-label">MMSI</span><span class="stat-value">${ship.mmsi ?? 'N/A'}</span></div>
        <div class="stat-row"><span class="stat-label">STATUS</span><span class="stat-value" style="color:${color}">${navStatus(ship.navigational_status)}</span></div>
        <hr class="stat-divider">
        <div class="stat-row"><span class="stat-label">LAT</span><span class="stat-value">${ship.lat.toFixed(4)}</span></div>
        <div class="stat-row"><span class="stat-label">LON</span><span class="stat-value">${ship.lon.toFixed(4)}</span></div>
        <div class="stat-row"><span class="stat-label">SPEED</span><span class="stat-value">${ship.speed != null ? ship.speed.toFixed(1) + ' kn' : 'N/A'}</span></div>
        <div class="stat-row"><span class="stat-label">HEADING</span><span class="stat-value">${ship.heading != null && ship.heading !== 511 ? ship.heading + '°' : 'N/A'}</span></div>
        <div class="stat-row"><span class="stat-label">COURSE</span><span class="stat-value">${ship.course != null ? ship.course.toFixed(1) + '°' : 'N/A'}</span></div>
        <hr class="stat-divider">
        <div class="stat-row"><span class="stat-label">LAST SEEN</span><span class="stat-value">${new Date(ship.seen_at).toLocaleTimeString('no-NO', { hour12: false })}</span></div>
        <a href="https://www.vesselfinder.com/vessels/details/${ship.mmsi}" target="_blank" style="display:block; margin-top: 12px; color: var(--green); font-size: 0.72rem; letter-spacing: 0.1em;">VIEW ON VESSELFINDER →</a>
    `;
}

// ── Data loading ────────────────────────────────────────────────────────────

// Fetch and draw the position history for a vessel as a polyline
async function showTrail(shipName) {
    // Remove any existing trail before drawing a new one
    if (activeTrail) {
        map.removeLayer(activeTrail);
        activeTrail = null;
    }

    const response = await fetch(`/ships/${encodeURIComponent(shipName)}/trail`);
    const trail = await response.json();

    if (trail.length < 2) return;  // Need at least 2 points to draw a line

    const points = trail.map(p => [p.lat, p.lon]);

    activeTrail = L.polyline(points, {
        color: '#00ff41',
        weight: 2,
        opacity: 0.5
    }).addTo(map);
}

// Add or update a single vessel marker on the map
function updateMarker(ship) {
    const color = statusColor(ship.navigational_status);
    const existingIndex = markers.findIndex(m => m._shipData?.name === ship.name);

    if (existingIndex !== -1) {
        // Ship already on map — update its position and icon
        const existing = markers[existingIndex];
        const isSelected = selectedMarker?._shipData?.name === ship.name;
        existing.setLatLng([ship.lat, ship.lon]);
        existing.setIcon(createArrowIcon(ship.course, isSelected ? '#ffffff' : color));
        existing._shipData = ship;

        // If this is the selected vessel, update the info panel too
        if (isSelected) updateVesselPanel(ship);
    } else {
        // New vessel — create and add a marker
        const icon = createArrowIcon(ship.course, color);
        const marker = L.marker([ship.lat, ship.lon], { icon }).addTo(map);
        marker._shipData = ship;

        marker.on('click', () => {
            // Reset previously selected marker
            if (selectedMarker) {
                const prevShip = selectedMarker._shipData;
                const prevColor = statusColor(prevShip.navigational_status);
                selectedMarker.setIcon(createArrowIcon(prevShip.course, prevColor));
            }

            // Highlight selected marker in white
            marker.setIcon(createArrowIcon(ship.course, '#ffffff'));
            selectedMarker = marker;
            selectedMarker._shipData = ship;

            showTrail(ship.name);
            updateVesselPanel(ship);
        });

        markers.push(marker);
    }

    // Update header
    document.getElementById('ship-count').textContent = `${markers.length} VESSELS TRACKED`;
    document.getElementById('last-updated').textContent = `UPDATED ${new Date().toLocaleTimeString('no-NO', { hour12: false })}`;
}

// Fetch all current vessels on page load to populate the map immediately
async function loadInitialShips() {
    const response = await fetch('/ships/latest');
    const ships = await response.json();
    ships.forEach(updateMarker);
}

// Fetch and render summary statistics in the stats panel
async function loadStats() {
    const response = await fetch('/stats');
    const stats = await response.json();

    document.getElementById('stats-content').innerHTML = `
        <div class="stat-row">
            <span class="stat-label">TOTAL SIGHTINGS</span>
            <span class="stat-value">${stats.total_sightings}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">UNIQUE VESSELS</span>
            <span class="stat-value">${stats.unique_ships}</span>
        </div>
        <hr class="stat-divider">
        <div class="panel-title">// MOST ACTIVE</div>
        ${stats.most_active.map(s => `
            <div class="active-ship">
                <span>${s.name || 'UNKNOWN'}</span>
                <span>${s.count}</span>
            </div>
        `).join('')}
    `;
}

// ── WebSocket for live updates ───────────────────────────────────────────────
const ws = new WebSocket(`ws://${window.location.host}/ws`);

ws.onopen = () => {
    console.log('WebSocket connected — receiving live updates');
};

ws.onmessage = (event) => {
    // New ship position received — update the map instantly
    const ship = JSON.parse(event.data);
    updateMarker(ship);
};

ws.onclose = () => {
    // WebSocket failed — fall back to polling every 30 seconds
    console.log('WebSocket disconnected — falling back to polling');
    setInterval(loadInitialShips, 30000);
};

// ── Initialise ──────────────────────────────────────────────────────────────
loadInitialShips();   // Load existing ships immediately on page load
loadStats();
setInterval(loadStats, 30000);  // Refresh statistics every 30 seconds