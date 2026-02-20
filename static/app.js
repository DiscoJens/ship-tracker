const map = L.map('map').setView([70.0, 20.0], 6);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO'
}).addTo(map);

const trackedArea = L.rectangle(
    [[68.0, 14.0], [74.0, 41.0]],
    {
        color: '#00ff41',
        weight: 0.5,
        fillColor: '#00ff41',
        fillOpacity: 0.03,
        dashArray: '4, 8'
    }
).addTo(map);

let markers = [];
let activeTrail = null;
let selectedMarker = null;

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
    return colors[code] ?? '#888888';
}

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

async function showTrail(shipName) {
    if (activeTrail) {
        map.removeLayer(activeTrail);
        activeTrail = null;
    }

    const response = await fetch(`/ships/${encodeURIComponent(shipName)}/trail`);
    const trail = await response.json();

    if (trail.length < 2) return;

    const points = trail.map(p => [p.lat, p.lon]);

    activeTrail = L.polyline(points, {
        color: '#00ff41',
        weight: 2,
        opacity: 0.5
    }).addTo(map);
}

async function loadShips() {
    const response = await fetch('/ships/latest');
    const ships = await response.json();

    markers.forEach(m => map.removeLayer(m));
    markers = [];
    selectedMarker = null;

    document.getElementById('ship-count').textContent = `${ships.length} VESSELS TRACKED`;
    document.getElementById('last-updated').textContent = `UPDATED ${new Date().toLocaleTimeString('no-NO', { hour12: false })}`;

    ships.forEach(ship => {
        const color = statusColor(ship.navigational_status);
        const icon = createArrowIcon(ship.course, color);

        const marker = L.marker([ship.lat, ship.lon], { icon }).addTo(map);

        marker.on('click', () => {
            if (selectedMarker) {
                const prevShip = selectedMarker._shipData;
                const prevColor = statusColor(prevShip.navigational_status);
                selectedMarker.setIcon(createArrowIcon(prevShip.course, prevColor));
            }

            marker.setIcon(createArrowIcon(ship.course, '#ffffff'));
            selectedMarker = marker;
            selectedMarker._shipData = ship;

            showTrail(ship.name);
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
        });

        markers.push(marker);
    });
}

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

loadShips();
loadStats();
setInterval(loadShips, 30000);
setInterval(loadStats, 30000);