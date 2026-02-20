# MARITRAK
### Live Maritime Surveillance — Northern Norway & Barents Sea

A real-time AIS ship tracking application covering northern Norway and the Barents Sea. Built with Python, FastAPI, SQLite, and Leaflet.js.

![MARITRAK Screenshot](screenshots/map.png)

---

## Features

- **Live AIS data stream** via [aisstream.io](https://aisstream.io), updated in real time
- **True real-time map updates** via WebSocket — vessels move instantly as new data arrives
- **Interactive map** with color-coded vessel markers by navigational status
- **Course arrows** showing direction of travel for each vessel
- **Ship trails** — click any vessel to see its historical track
- **Vessel info panel** with speed, heading, course, MMSI, and navigational status
- **Statistics panel** showing total sightings, unique vessels, and most active ships
- **VesselFinder integration** — direct link to full vessel profile from the info panel
- Monitored area covers northern Norway, the Barents Sea, and the Kola Peninsula

## Tech Stack

| Layer | Technology |
|---|---|
| Data collection | Python, websockets, aiosqlite |
| Backend API | FastAPI, SQLite |
| Real-time updates | WebSocket (FastAPI + browser) |
| Frontend | HTML, CSS, Vanilla JS |
| Map | Leaflet.js, CartoDB Dark tiles |
| Package management | uv |
| Containerization | Docker |

## Project Structure

```
ship-tracker/
├── api.py              # FastAPI backend — serves API, collects AIS data, and
│                       # broadcasts live updates to browsers via WebSocket
├── fetch_ships.py      # Standalone AIS collector (alternative to api.py)
├── static/
│   ├── index.html      # Frontend markup
│   ├── app.js          # Map logic, markers, trails, WebSocket client
│   └── style.css       # Tactical dark theme
├── Dockerfile          # Container build instructions
├── docker-compose.yml  # Single-command deployment
├── .env                # API key (not committed)
├── .gitignore
└── pyproject.toml
```

## How It Works

```
aisstream.io → (WebSocket) → api.py → SQLite database
                                    ↓
                             browser (WebSocket) → live map updates
```

`api.py` runs two things simultaneously — an AIS stream collector that saves ship positions to the database, and a FastAPI server that serves the map and pushes live updates to connected browsers via WebSocket. Every time a ship broadcasts its position, the map updates instantly.

## Getting Started

### Prerequisites

- A free API key from [aisstream.io](https://aisstream.io)
- Either [uv](https://github.com/astral-sh/uv) or [Docker](https://www.docker.com)

### Configuration

Create a `.env` file in the project root:

```
AISSTREAM_API_KEY=your-api-key-here
```

### Running with Docker (recommended)

```bash
git clone https://github.com/DiscoJens/ship-tracker.git
cd ship-tracker
docker-compose up
```

Then open [http://localhost:8000](http://localhost:8000).

### Running with uv

```bash
git clone https://github.com/DiscoJens/ship-tracker.git
cd ship-tracker
uv sync
uv run uvicorn api:app
```

Then open [http://localhost:8000](http://localhost:8000).

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /ships` | All sightings, newest first |
| `GET /ships/latest` | Latest position per unique vessel |
| `GET /ships/{name}/trail` | Full position history for a vessel |
| `GET /stats` | Total sightings, unique vessels, most active ships |
| `WS /ws` | WebSocket endpoint for live vessel updates |

## Vessel Status Colors

| Color | Status |
|---|---|
| 🟢 Green | Underway / Sailing |
| 🟡 Yellow | At anchor / Fishing |
| 🔵 Cyan | Moored |
| 🔴 Red | Not under command / Restricted / Aground |
| ⚫ Grey | Unknown |

## Data Collected

Each sighting stores: vessel name, MMSI, latitude, longitude, speed over ground, true heading, course over ground, navigational status, and timestamp.

---

Built as a demonstration of real-time data pipelines, WebSocket architecture, REST API design, and map visualizations.