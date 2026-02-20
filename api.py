from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
import sqlite3
import asyncio
import websockets
import json
import aiosqlite
from datetime import datetime, timezone
from dotenv import load_dotenv
import os

load_dotenv()
API_KEY = os.getenv("AISSTREAM_API_KEY")
DB_FILE = "ships.db"

app = FastAPI()

# ── WebSocket connection manager ────────────────────────────────────────────
# Keeps track of all browser clients currently connected
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"Browser connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        print(f"Browser disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Send a ship update to all connected browsers."""
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass  # Stale connection, will be cleaned up on disconnect

manager = ConnectionManager()

# ── Database helpers ────────────────────────────────────────────────────────
def get_db():
    """Open a connection to the SQLite database and return rows as dicts."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

async def init_db(db):
    """Create the sightings table if it doesn't already exist."""
    await db.execute("""
        CREATE TABLE IF NOT EXISTS sightings (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            name                TEXT,
            mmsi                INTEGER,
            lat                 REAL,
            lon                 REAL,
            speed               REAL,
            heading             REAL,
            course              REAL,
            navigational_status INTEGER,
            seen_at             TEXT
        )
    """)
    await db.commit()

# ── AIS collector ───────────────────────────────────────────────────────────
async def fetch_ships():
    """Connect to the AIS stream and continuously save vessel sightings.
    Broadcasts each new sighting to all connected browsers via WebSocket."""
    url = "wss://stream.aisstream.io/v0/stream"

    # Covers northern Norway, the Barents Sea, and the Kola Peninsula
    subscribe_message = {
        "APIKey": API_KEY,
        "BoundingBoxes": [
            [[68.0, 14.0], [74.0, 41.0]]  # [south, west], [north, east]
        ]
    }

    async with aiosqlite.connect(DB_FILE) as db:
        await init_db(db)

        while True:
            try:
                async with websockets.connect(url) as ws:
                    await ws.send(json.dumps(subscribe_message))
                    print("Connected to AIS stream!\n")

                    async for raw_message in ws:
                        message = json.loads(raw_message)
                        meta   = message.get("MetaData", {})
                        report = message.get("Message", {}).get("PositionReport", {})

                        # Skip vessels with no name
                        name = meta.get("ShipName", "").strip()
                        if not name or name == "Unknown":
                            continue

                        mmsi       = meta.get("MMSI")
                        lat        = meta.get("latitude")
                        lon        = meta.get("longitude")
                        speed      = report.get("Sog")
                        heading    = report.get("TrueHeading")
                        course     = report.get("Cog")
                        nav_status = report.get("NavigationalStatus")

                        if lat is None or lon is None:
                            continue

                        seen_at = datetime.now(timezone.utc).isoformat()

                        await db.execute(
                            """INSERT INTO sightings
                            (name, mmsi, lat, lon, speed, heading, course, navigational_status, seen_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (name, mmsi, lat, lon, speed, heading, course, nav_status, seen_at)
                        )
                        await db.commit()

                        # Broadcast update to all connected browsers
                        await manager.broadcast({
                            "name": name,
                            "mmsi": mmsi,
                            "lat": lat,
                            "lon": lon,
                            "speed": speed,
                            "heading": heading,
                            "course": course,
                            "navigational_status": nav_status,
                            "seen_at": seen_at
                        })

                        print(f"Saved: {name:30} | {speed or 0:.1f}kn | HDG {heading or '???'}° | {seen_at}")

            except Exception as e:
                print(f"AIS connection dropped: {e} — reconnecting in 3 seconds...")
                await asyncio.sleep(3)

# ── Start AIS collector when API starts ─────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    """Launch the AIS collector as a background task when the server starts."""
    asyncio.create_task(fetch_ships())

# ── HTTP endpoints ───────────────────────────────────────────────────────────
@app.get("/ships")
def get_ships():
    """Return all sightings, newest first."""
    db = get_db()
    rows = db.execute("""
        SELECT name, lat, lon, seen_at
        FROM sightings
        ORDER BY seen_at DESC
    """).fetchall()
    db.close()
    return [dict(row) for row in rows]

@app.get("/ships/latest")
def get_latest_ships():
    """Return the most recent position for each unique vessel."""
    db = get_db()
    rows = db.execute("""
        SELECT name, mmsi, lat, lon, speed, heading, course, navigational_status, MAX(seen_at) as seen_at
        FROM sightings
        GROUP BY name
        ORDER BY seen_at DESC
    """).fetchall()
    db.close()
    return [dict(row) for row in rows]

@app.get("/ships/{name}/trail")
def get_ship_trail(name: str):
    """Return the full position history for a named vessel, oldest first."""
    db = get_db()
    rows = db.execute("""
        SELECT name, lat, lon, seen_at
        FROM sightings
        WHERE name = ?
        ORDER BY seen_at ASC
    """, (name,)).fetchall()
    db.close()
    return [dict(row) for row in rows]

@app.get("/stats")
def get_stats():
    """Return summary statistics."""
    db = get_db()
    total_sightings = db.execute("SELECT COUNT(*) FROM sightings").fetchone()[0]
    unique_ships = db.execute("SELECT COUNT(DISTINCT name) FROM sightings").fetchone()[0]
    most_active = db.execute("""
        SELECT name, COUNT(*) as count
        FROM sightings
        GROUP BY name
        ORDER BY count DESC
        LIMIT 5
    """).fetchall()
    db.close()
    return {
        "total_sightings": total_sightings,
        "unique_ships": unique_ships,
        "most_active": [dict(row) for row in most_active]
    }

# ── WebSocket endpoint for browsers ─────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Browser connects here to receive live ship updates."""
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Serve frontend — must be last since it catches all remaining routes
app.mount("/", StaticFiles(directory="static", html=True), name="static")