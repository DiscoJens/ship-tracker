# Standalone AIS collector script.
# Note: this functionality is also built into api.py via the startup_event.
# Run this independently if you want to collect data without the web server.

import asyncio
import websockets
import json
import aiosqlite
from datetime import datetime, timezone
from dotenv import load_dotenv
import os

# Load API key from .env file
load_dotenv()
API_KEY = os.getenv("AISSTREAM_API_KEY")
DB_FILE = "ships.db"

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

async def fetch_ships():
    """Connect to the AIS stream and continuously save vessel sightings to the database.
    Reconnects automatically if the connection drops."""
    url = "wss://stream.aisstream.io/v0/stream"

    # Define the geographic bounding box to monitor
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
                    print("Connected! Logging ships to database...\n")

                    async for raw_message in ws:
                        message = json.loads(raw_message)
                        meta   = message.get("MetaData", {})
                        report = message.get("Message", {}).get("PositionReport", {})

                        # Skip vessels with no name or placeholder name
                        name = meta.get("ShipName", "").strip()
                        if not name or name == "Unknown":
                            continue

                        # Extract position and movement data from the AIS message
                        mmsi       = meta.get("MMSI")
                        lat        = meta.get("latitude")
                        lon        = meta.get("longitude")
                        speed      = report.get("Sog")        # Speed over ground in knots
                        heading    = report.get("TrueHeading") # Compass heading (511 = unavailable)
                        course     = report.get("Cog")         # Course over ground in degrees
                        nav_status = report.get("NavigationalStatus")  # 0=underway, 1=anchor, 5=moored, etc.

                        # Skip if position is missing
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

                        print(f"Saved: {name:30} | {speed or 0:.1f}kn | HDG {heading or '???'}° | {seen_at}")

            except Exception as e:
                print(f"Connection dropped: {e} — reconnecting in 3 seconds...")
                await asyncio.sleep(3)

asyncio.run(fetch_ships())