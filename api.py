from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import sqlite3

app = FastAPI()

def get_db():
    conn = sqlite3.connect("ships.db")
    conn.row_factory = sqlite3.Row
    return conn

@app.get("/ships")
def get_ships():
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

app.mount("/", StaticFiles(directory="static", html=True), name="static")
