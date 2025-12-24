import asyncio
import json
import aiohttp
import uuid
from typing import List, Dict, Optional
from datetime import datetime

class ZKillboardRedisQ:
    """
    RedisQ client for zkillboard.com to receive real-time kill data
    Uses HTTP polling instead of WebSocket for better reliability
    """
    
    def __init__(self, max_kills: int = 15, queue_id: Optional[str] = None, ttw: int = 1):
        # RedisQ endpoint
        self.base_url = "https://zkillredisq.stream/listen.php"
        # ESI endpoint for fetching killmail data
        self.esi_base_url = "https://esi.evetech.net/v1/killmails"
        
        # Generate unique queue ID if not provided
        self.queue_id = queue_id or f"solo-hunter-{uuid.uuid4().hex[:8]}"
        self.ttw = max(1, min(10, ttw))  # Clamp between 1-10 seconds
        
        self.recent_kills: List[Dict] = []
        self.max_kills = max_kills
        self.connected = False
        self.lock = asyncio.Lock()
        self.session: Optional[aiohttp.ClientSession] = None
        self._running = False
        
    async def connect(self):
        """Start polling RedisQ for killmails"""
        self._running = True
        self.connected = True
        
        # Create aiohttp session
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=15),
            headers={"User-Agent": "SoloHunter/1.0"}
        )
        
        print(f"Connected to RedisQ with queueID: {self.queue_id}")
        print(f"Polling every {self.ttw} seconds...")
        
        while self._running:
            try:
                await self._poll_redisq()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"RedisQ polling error: {type(e).__name__}: {e}")
                await asyncio.sleep(5)  # Wait before retrying
    
    async def _poll_redisq(self):
        """Poll RedisQ for new killmails"""
        if not self.session:
            return
        
        try:
            # Build RedisQ URL
            url = f"{self.base_url}?queueID={self.queue_id}&ttw={self.ttw}"
            
            async with self.session.get(url, allow_redirects=True) as response:
                if response.status == 429:
                    print("Rate limited (429). Waiting 60 seconds...")
                    await asyncio.sleep(60)
                    return
                
                if response.status != 200:
                    print(f"RedisQ returned status {response.status}")
                    await asyncio.sleep(5)
                    return
                
                data = await response.json()
                
                # Check if we got a killmail package
                package = data.get('package')
                if package is None:
                    # No killmail in the wait time, continue polling
                    return
                
                # Process the package
                await self._process_package(package)
                
        except aiohttp.ClientError as e:
            print(f"HTTP client error: {e}")
            await asyncio.sleep(5)
        except json.JSONDecodeError as e:
            print(f"JSON decode error: {e}")
            await asyncio.sleep(1)
    
    async def _process_package(self, package: Dict):
        """Process a RedisQ package and fetch killmail from ESI"""
        try:
            kill_id = package.get('killID')
            zkb = package.get('zkb', {})
            hash_value = zkb.get('hash')
            
            if not kill_id or not hash_value:
                print(f"Invalid package: missing killID or hash")
                return
            
            # Fetch killmail from ESI
            killmail = await self._fetch_killmail_from_esi(kill_id, hash_value)
            if killmail:
                await self._process_kill(kill_id, killmail, package)
            else:
                print(f"Failed to fetch killmail {kill_id} from ESI")
                
        except Exception as e:
            print(f"Error processing package: {e}")
    
    async def _fetch_killmail_from_esi(self, kill_id: int, hash_value: str) -> Optional[Dict]:
        """Fetch killmail data from EVE ESI API"""
        if not self.session:
            return None
        
        try:
            url = f"{self.esi_base_url}/{kill_id}/{hash_value}/"
            
            async with self.session.get(url) as response:
                if response.status == 200:
                    return await response.json()
                elif response.status == 404:
                    print(f"Killmail {kill_id} not found in ESI")
                    return None
                else:
                    print(f"ESI returned status {response.status} for killmail {kill_id}")
                    return None
                    
        except Exception as e:
            print(f"Error fetching killmail from ESI: {e}")
            return None
    
    async def _process_kill(self, kill_id: int, killmail: Dict, package: Dict):
        """Process a killmail and add it to recent kills"""
        async with self.lock:
            try:
                victim = killmail.get('victim', {})
                attackers = killmail.get('attackers', [])
                
                # Get solar system information
                solar_system_id = killmail.get('solar_system_id', 0)
                
                # Find the final blow attacker
                final_blow_attacker = None
                for attacker in attackers:
                    if attacker.get('final_blow', False):
                        final_blow_attacker = attacker
                        break
                
                # Get zkb metadata
                zkb = package.get('zkb', {})
                
                # Format kill information
                formatted_kill = {
                    "killmail_id": kill_id,
                    "killmail_time": killmail.get('killmail_time', datetime.utcnow().isoformat()),
                    "solar_system_id": solar_system_id,
                    "victim": {
                        "character_id": victim.get('character_id'),
                        "corporation_id": victim.get('corporation_id'),
                        "alliance_id": victim.get('alliance_id'),
                        "ship_type_id": victim.get('ship_type_id'),
                        "damage_taken": victim.get('damage_taken', 0)
                    },
                    "attacker": {
                        "character_id": final_blow_attacker.get('character_id') if final_blow_attacker else None,
                        "corporation_id": final_blow_attacker.get('corporation_id') if final_blow_attacker else None,
                        "alliance_id": final_blow_attacker.get('alliance_id') if final_blow_attacker else None,
                        "ship_type_id": final_blow_attacker.get('ship_type_id') if final_blow_attacker else None,
                        "damage_done": final_blow_attacker.get('damage_done', 0) if final_blow_attacker else 0
                    },
                    "zkb": {
                        "total_value": zkb.get('totalValue', 0),
                        "points": zkb.get('points', 0),
                        "npc": zkb.get('npc', False),
                        "solo": zkb.get('solo', False),
                        "labels": zkb.get('labels', [])
                    },
                    "zkill_url": f"https://zkillboard.com/kill/{kill_id}/"
                }
                
                # Add to beginning of list
                self.recent_kills.insert(0, formatted_kill)
                
                # Keep only the most recent kills
                if len(self.recent_kills) > self.max_kills:
                    self.recent_kills = self.recent_kills[:self.max_kills]
                
                print(f"Processed killmail {kill_id} from system {solar_system_id}")
                    
            except Exception as e:
                print(f"Error processing kill: {e}")
    
    def get_recent_kills(self) -> List[Dict]:
        """Get the list of recent kills (thread-safe)"""
        return self.recent_kills.copy()
    
    def is_connected(self) -> bool:
        """Check if RedisQ is connected"""
        return self.connected
    
    async def disconnect(self):
        """Disconnect from RedisQ"""
        self._running = False
        self.connected = False
        if self.session:
            await self.session.close()
            self.session = None

# Keep the old class name for backwards compatibility
ZKillboardWebSocket = ZKillboardRedisQ
