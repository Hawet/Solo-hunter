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
        "redisq_connected": zkill_ws.is_connected() if zkill_ws else False
    }
