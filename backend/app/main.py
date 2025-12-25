from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from app.zkillboard import ZKillboardWebSocket

app = FastAPI(title="Solo Hunter - EVE Online PvP Monitor")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global RedisQ manager
zkill_ws = None

@app.on_event("startup")
async def startup_event():
    """Start the zkillboard RedisQ connection on startup"""
    global zkill_ws
    zkill_ws = ZKillboardWebSocket()  # Actually uses RedisQ, kept name for compatibility
    asyncio.create_task(zkill_ws.connect())

@app.on_event("shutdown")
async def shutdown_event():
    """Close RedisQ connection on shutdown"""
    global zkill_ws
    if zkill_ws:
        await zkill_ws.disconnect()

@app.get("/")
async def root():
    return {"message": "Solo Hunter API", "status": "running"}

@app.get("/api/kills")
async def get_recent_kills():
    """Get the 15 most recent kills"""
    global zkill_ws
    if zkill_ws:
        return {"kills": zkill_ws.get_recent_kills()}
    return {"kills": []}

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    global zkill_ws
    return {
        "status": "healthy",
        "redisq_connected": zkill_ws.is_connected() if zkill_ws else False,
        "paused": zkill_ws.is_paused() if zkill_ws else False
    }

@app.post("/api/pause")
async def pause_parsing():
    """Pause parsing of killmails"""
    global zkill_ws
    if zkill_ws:
        zkill_ws.pause()
        return {"status": "paused", "message": "Parsing paused"}
    return {"status": "error", "message": "RedisQ not initialized"}

@app.post("/api/resume")
async def resume_parsing():
    """Resume parsing of killmails"""
    global zkill_ws
    if zkill_ws:
        zkill_ws.resume()
        return {"status": "resumed", "message": "Parsing resumed"}
    return {"status": "error", "message": "RedisQ not initialized"}

@app.get("/api/regions")
async def get_region_stats():
    """Get region activity statistics"""
    global zkill_ws
    if zkill_ws:
        return {"regions": zkill_ws.get_region_stats()}
    return {"regions": []}
