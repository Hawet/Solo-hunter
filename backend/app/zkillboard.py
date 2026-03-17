import asyncio
import bisect
import json
import aiohttp
import uuid
import os
from collections import deque
from typing import List, Dict, Optional, Set, Tuple
from datetime import datetime
from pathlib import Path

# EVE Online group_id -> (ship_class_name, size, tier)
# Size: small (frigate/destroyer), medium (cruiser/BC), large (battleship), capital
# Tier: t1, t2, t3, faction
_GROUP_SHIP_META: Dict[int, Tuple[str, str, str]] = {
    # -- small --
    25:   ("Frigate",                "small",   "t1"),
    324:  ("Assault Frigate",        "small",   "t2"),
    831:  ("Covert Ops",             "small",   "t2"),
    834:  ("Stealth Bomber",         "small",   "t2"),
    893:  ("Electronic Attack Ship",  "small",   "t2"),
    830:  ("Interceptor",            "small",   "t2"),
    1527: ("Logistics Frigate",      "small",   "t2"),
    420:  ("Destroyer",              "small",   "t1"),
    541:  ("Interdictor",            "small",   "t2"),
    1534: ("Command Destroyer",      "small",   "t2"),
    1305: ("Tactical Destroyer",     "small",   "t3"),
    # -- medium --
    26:   ("Cruiser",                "medium",  "t1"),
    358:  ("Heavy Assault Cruiser",  "medium",  "t2"),
    894:  ("Heavy Interdictor",      "medium",  "t2"),
    906:  ("Combat Recon Ship",      "medium",  "t2"),
    833:  ("Force Recon Ship",       "medium",  "t2"),
    832:  ("Logistics Cruiser",      "medium",  "t2"),
    963:  ("Strategic Cruiser",      "medium",  "t3"),
    419:  ("Battlecruiser",          "medium",  "t1"),
    540:  ("Command Ship",           "medium",  "t2"),
    # -- large --
    27:   ("Battleship",             "large",   "t1"),
    898:  ("Black Ops",              "large",   "t2"),
    900:  ("Marauder",               "large",   "t2"),
    # -- capital --
    547:  ("Carrier",                "capital",  "t1"),
    485:  ("Dreadnought",            "capital",  "t1"),
    659:  ("Supercarrier",           "capital",  "t1"),
    30:   ("Titan",                  "capital",  "t1"),
    1538: ("Force Auxiliary",        "capital",  "t1"),
    883:  ("Capital Industrial Ship","capital",  "t1"),
    # -- misc flyable hulls (size based on class feel) --
    31:   ("Shuttle",                "small",   "t1"),
    237:  ("Rookie Ship",            "small",   "t1"),
    1283: ("Expedition Frigate",     "small",   "t1"),
    543:  ("Exhumer",                "medium",  "t2"),
    463:  ("Mining Barge",           "medium",  "t1"),
    941:  ("Industrial Command Ship","large",   "t1"),
    513:  ("Freighter",              "capital",  "t1"),
    902:  ("Jump Freighter",         "capital",  "t2"),
    380:  ("Transport Ship",         "medium",  "t2"),
    28:   ("Industrial",             "medium",  "t1"),
    1972: ("Flag Cruiser",           "medium",  "t2"),
}

# Faction ship detection: Navy Issue / Fleet Issue / Pirate names in the ship name,
# or meta_group_id == 4 from ESI.  We also accept certain group_ids that are
# *exclusively* faction (SOE ships use normal group ids but have meta_group 4).
_FACTION_NAME_HINTS = frozenset([
    "navy", "fleet issue", "issue", "pirate",
    "guristas", "sansha", "blood raider", "serpentis", "angel",
    "mordu", "sisters", "soe", "concord",
])


class ZKillboardRedisQ:
    """
    RedisQ client for zkillboard.com to receive real-time kill data
    Uses HTTP polling instead of WebSocket for better reliability
    """
    
    def __init__(self, max_kills: int = 15, queue_id: Optional[str] = None, ttw: int = 1):
        # RedisQ endpoint
        self.base_url = "https://zkillredisq.stream/listen.php"
        # ESI endpoint for fetching killmail data
        self.esi_base_url = "https://esi.evetech.net"
        # EVE image CDN for ship icons
        self.image_cdn = "https://images.evetech.net"
        
        # Generate unique queue ID if not provided
        self.queue_id = queue_id or f"solo-hunter-{uuid.uuid4().hex[:8]}"
        self.ttw = max(1, min(10, ttw))  # Clamp between 1-10 seconds
        
        self.recent_kills: List[Dict] = []
        self.max_kills = max_kills
        self.connected = False
        self.lock = asyncio.Lock()
        self.session: Optional[aiohttp.ClientSession] = None
        self._running = False
        self._paused = False
        self._pause_event = asyncio.Event()
        self._pause_event.set()  # Start unpaused
        
        # Track region activity
        self.region_stats: Dict[int, Dict] = {}  # region_id -> {name, count}
        self.system_cache: Dict[int, Dict] = {}  # system_id -> {name, region_id, region_name}
        
        # Local cache files for static data
        self.cache_dir = Path(__file__).parent.parent / "cache"
        self.cache_dir.mkdir(exist_ok=True)
        self.items_cache_file = self.cache_dir / "items.json"
        self.ships_cache_file = self.cache_dir / "ships.json"
        self.ship_meta_cache_file = self.cache_dir / "ship_meta.json"
        self.map_cache_file = self.cache_dir / "map_data.json"
        
        # In-memory caches (loaded from files)
        self.items_cache: Dict[int, str] = {}  # type_id -> name
        self.ships_cache: Dict[int, str] = {}  # type_id -> name
        self.ship_meta_cache: Dict[str, Dict] = {}  # str(type_id) -> {name, group_id, tags:[]}
        self.map_cache: Dict = {}  # Full map data cache
        
        # Derived structures built from map_cache
        self.adjacency: Dict[int, Set[int]] = {}
        self._systems_index: List[Tuple[str, int]] = []  # sorted (name_lower, system_id)
        self._systems_by_id: Dict[int, Dict] = {}  # system_id -> {system_id, name, region_id, security_status}
        
        # Ship metadata search index (built after loading cache)
        self._ship_meta_index: List[Tuple[str, int]] = []  # sorted (name_lower, type_id)
        self._ship_meta_by_id: Dict[int, Dict] = {}  # type_id -> full meta entry
        
        # Load existing caches
        self._load_cache()
        
    def _load_cache(self):
        """Load cached items, ships, ship_meta, and map data from JSON files"""
        try:
            if self.items_cache_file.exists():
                with open(self.items_cache_file, 'r', encoding='utf-8') as f:
                    self.items_cache = json.load(f)
                print(f"Loaded {len(self.items_cache)} items from cache")
        except Exception as e:
            print(f"Error loading items cache: {e}")
            self.items_cache = {}
        
        try:
            if self.ships_cache_file.exists():
                with open(self.ships_cache_file, 'r', encoding='utf-8') as f:
                    self.ships_cache = json.load(f)
                print(f"Loaded {len(self.ships_cache)} ships from cache")
        except Exception as e:
            print(f"Error loading ships cache: {e}")
            self.ships_cache = {}
        
        try:
            if self.ship_meta_cache_file.exists():
                with open(self.ship_meta_cache_file, 'r', encoding='utf-8') as f:
                    self.ship_meta_cache = json.load(f)
                print(f"Loaded {len(self.ship_meta_cache)} ship metadata entries from cache")
        except Exception as e:
            print(f"Error loading ship_meta cache: {e}")
            self.ship_meta_cache = {}
        
        try:
            if self.map_cache_file.exists():
                with open(self.map_cache_file, 'r', encoding='utf-8') as f:
                    self.map_cache = json.load(f)
                systems_count = len(self.map_cache.get('systems', {}))
                stargates_count = len(self.map_cache.get('stargates', {}))
                print(f"Loaded map cache: {systems_count} systems, {stargates_count} stargates")
        except Exception as e:
            print(f"Error loading map cache: {e}")
            self.map_cache = {'systems': {}, 'stargates': {}, 'regions': {}}
        
        self._build_derived_structures()
        self._build_ship_meta_index()
    
    def _save_items_cache(self):
        """Save items cache to JSON file"""
        try:
            with open(self.items_cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.items_cache, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving items cache: {e}")
    
    def _save_ships_cache(self):
        """Save ships cache to JSON file"""
        try:
            with open(self.ships_cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.ships_cache, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving ships cache: {e}")
    
    def _save_map_cache(self):
        """Save map data cache to JSON file"""
        try:
            with open(self.map_cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.map_cache, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving map cache: {e}")
    
    def _save_ship_meta_cache(self):
        """Save ship metadata cache to JSON file"""
        try:
            with open(self.ship_meta_cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.ship_meta_cache, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving ship_meta cache: {e}")

    # ---- Ship metadata / tag helpers ----

    @staticmethod
    def _derive_ship_tags(name: str, group_id: int, meta_group_id: Optional[int] = None) -> List[str]:
        """Derive tier/size/class tags from ESI group_id and meta_group_id."""
        tags: List[str] = []
        meta = _GROUP_SHIP_META.get(group_id)
        if meta:
            ship_class, size, tier = meta
            tags.append(size)

            is_faction = (meta_group_id == 4) or any(h in name.lower() for h in _FACTION_NAME_HINTS)
            if is_faction and tier == "t1":
                tags.append("faction")
            else:
                tags.append(tier)

            tags.append(ship_class.lower())
        return tags

    def _build_ship_meta_index(self):
        """Build sorted search index from the ship_meta_cache for fast autocomplete."""
        index: List[Tuple[str, int]] = []
        by_id: Dict[int, Dict] = {}
        for tid_str, entry in self.ship_meta_cache.items():
            tid = int(tid_str)
            name = entry.get("name", "")
            if not name:
                continue
            by_id[tid] = {
                "type_id": tid,
                "name": name,
                "group_id": entry.get("group_id"),
                "tags": entry.get("tags", []),
            }
            index.append((name.lower(), tid))
        index.sort(key=lambda x: x[0])
        self._ship_meta_index = index
        self._ship_meta_by_id = by_id
        print(f"Built ship meta search index: {len(index)} entries")

    async def _ensure_ship_meta(self, ship_type_id: int) -> Optional[Dict]:
        """Fetch & cache ESI type metadata for a ship so tags are available.
        Returns the cached meta entry or None on failure."""
        tid_str = str(ship_type_id)
        if tid_str in self.ship_meta_cache:
            return self.ship_meta_cache[tid_str]

        if not self.session:
            return None

        try:
            url = f"{self.esi_base_url}/v3/universe/types/{ship_type_id}/"
            async with self.session.get(url) as response:
                if response.status != 200:
                    return None
                type_data = await response.json()
                name = type_data.get("name", f"Ship {ship_type_id}")
                group_id = type_data.get("group_id")
                meta_group_id = type_data.get("meta_group_id")
                tags = self._derive_ship_tags(name, group_id, meta_group_id)
                entry = {
                    "name": name,
                    "group_id": group_id,
                    "meta_group_id": meta_group_id,
                    "tags": tags,
                }
                self.ship_meta_cache[tid_str] = entry
                self._save_ship_meta_cache()

                tid = int(ship_type_id)
                self._ship_meta_by_id[tid] = {
                    "type_id": tid,
                    "name": name,
                    "group_id": group_id,
                    "tags": tags,
                }
                entry_key = (name.lower(), tid)
                insert_pos = bisect.bisect_left(self._ship_meta_index, entry_key)
                if insert_pos >= len(self._ship_meta_index) or self._ship_meta_index[insert_pos] != entry_key:
                    self._ship_meta_index.insert(insert_pos, entry_key)

                return entry
        except Exception as e:
            print(f"Error fetching ship meta for {ship_type_id}: {e}")
            return None

    def get_ship_tags(self, ship_type_id: int) -> List[str]:
        """Return cached tags for a ship type, or empty list if unknown."""
        entry = self.ship_meta_cache.get(str(ship_type_id))
        return entry.get("tags", []) if entry else []

    def search_ships(self, query: str, limit: int = 15) -> List[Dict]:
        """Search ship types by name (prefix + substring). Returns list of meta dicts."""
        if not query:
            return []
        q = query.lower()
        results: List[Dict] = []
        seen: Set[int] = set()

        lo = bisect.bisect_left(self._ship_meta_index, (q,))
        for i in range(lo, len(self._ship_meta_index)):
            name_lower, tid = self._ship_meta_index[i]
            if not name_lower.startswith(q):
                break
            if tid not in seen:
                seen.add(tid)
                results.append(self._ship_meta_by_id[tid])
            if len(results) >= limit:
                return results

        if len(results) < limit:
            for name_lower, tid in self._ship_meta_index:
                if tid in seen:
                    continue
                if q in name_lower:
                    seen.add(tid)
                    results.append(self._ship_meta_by_id[tid])
                    if len(results) >= limit:
                        break

        return results

    def get_all_ship_types(self) -> List[Dict]:
        """Return all known ship types for client-side autocomplete."""
        return list(self._ship_meta_by_id.values())

    @staticmethod
    def _is_kspace_region(region_id) -> bool:
        """Return True for known-space regions (filter out WH, VR, ADR)"""
        if region_id is None:
            return False
        rid = int(region_id)
        if 11000000 <= rid < 12000000:  # Wormhole
            return False
        if 12000000 <= rid < 13000000:  # Abyssal Deadspace
            return False
        if 14000000 <= rid < 15000000:  # Victory Road
            return False
        return True

    def _build_derived_structures(self):
        """Build adjacency list, systems search index, and seed ship meta from ships_cache."""
        self._build_adjacency()
        self._build_systems_index()
        self._seed_ship_meta_from_names()

    def _seed_ship_meta_from_names(self):
        """Ensure every entry in ships_cache has a corresponding ship_meta_cache entry.
        Uses name-only heuristic (no ESI call) so it works offline at startup."""
        added = 0
        for tid_str, name in self.ships_cache.items():
            if tid_str in self.ship_meta_cache:
                continue
            self.ship_meta_cache[tid_str] = {
                "name": name,
                "group_id": None,
                "meta_group_id": None,
                "tags": [],
            }
            added += 1
        if added:
            self._save_ship_meta_cache()
            print(f"Seeded {added} ship_meta entries from ships_cache (tags pending ESI lookup)")

    def _build_adjacency(self):
        self.adjacency = {}
        for sg in self.map_cache.get('stargates', {}).values():
            f = sg.get('from_system_id')
            t = sg.get('to_system_id')
            if f and t:
                self.adjacency.setdefault(f, set()).add(t)
                self.adjacency.setdefault(t, set()).add(f)
        print(f"Built adjacency list: {len(self.adjacency)} systems with gates")

    def _build_systems_index(self):
        """Pre-build a sorted list of (name_lower, system_id) for fast prefix search,
        and a lookup dict system_id -> summary for the names endpoint."""
        index: List[Tuple[str, int]] = []
        by_id: Dict[int, Dict] = {}
        for sys_data in self.map_cache.get('systems', {}).values():
            sid = sys_data.get('system_id')
            name = sys_data.get('name')
            rid = sys_data.get('region_id')
            if not sid or not name:
                continue
            if not self._is_kspace_region(rid):
                continue
            entry = {
                "system_id": sid,
                "name": name,
                "region_id": rid,
                "security_status": round(sys_data.get('security_status', 0), 2),
            }
            by_id[sid] = entry
            index.append((name.lower(), sid))
        index.sort(key=lambda x: x[0])
        self._systems_index = index
        self._systems_by_id = by_id
        print(f"Built systems search index: {len(index)} k-space systems")

    def search_systems(self, query: str, limit: int = 15) -> List[Dict]:
        """Search systems by name. Prefix match first via bisect, then substring fallback."""
        if not query:
            return []
        q = query.lower()
        results: List[Dict] = []
        seen: Set[int] = set()

        # Fast prefix search via bisect
        lo = bisect.bisect_left(self._systems_index, (q,))
        for i in range(lo, len(self._systems_index)):
            name_lower, sid = self._systems_index[i]
            if not name_lower.startswith(q):
                break
            if sid not in seen:
                seen.add(sid)
                results.append(self._systems_by_id[sid])
            if len(results) >= limit:
                return results

        # Substring fallback (only if we have room)
        if len(results) < limit:
            for name_lower, sid in self._systems_index:
                if sid in seen:
                    continue
                if q in name_lower:
                    seen.add(sid)
                    results.append(self._systems_by_id[sid])
                    if len(results) >= limit:
                        break

        return results

    def get_systems_in_range(self, system_id: int, jumps: int) -> Dict:
        """BFS from system_id up to `jumps` hops. Returns origin info + list of system_ids."""
        jumps = max(1, min(jumps, 25))
        origin = self._systems_by_id.get(system_id)
        if not origin or system_id not in self.adjacency:
            return {
                "origin": {"system_id": system_id, "name": origin["name"] if origin else f"System {system_id}"},
                "systems": [system_id],
                "jumps": jumps,
            }

        visited: Set[int] = {system_id}
        queue: deque = deque()
        queue.append((system_id, 0))
        while queue:
            current, depth = queue.popleft()
            if depth >= jumps:
                continue
            for neighbor in self.adjacency.get(current, set()):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, depth + 1))

        return {
            "origin": {"system_id": system_id, "name": origin["name"]},
            "systems": list(visited),
            "jumps": jumps,
        }

    def get_all_system_names(self) -> List[Dict]:
        """Return all k-space systems for autocomplete."""
        return list(self._systems_by_id.values())

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
                # Wait if paused (this will block until resume is called)
                await self._pause_event.wait()
                
                # Only poll if not paused (double check after wait)
                if not self._paused:
                    await self._poll_redisq()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"RedisQ polling error: {type(e).__name__}: {e}")
                if not self._paused:
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
            url = f"{self.esi_base_url}/v1/killmails/{kill_id}/{hash_value}/"
            
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
    
    async def _resolve_names(self, ids: List[int]) -> Dict[int, str]:
        """Resolve EVE IDs to names using ESI API"""
        if not ids or not self.session:
            return {}
        
        # Remove duplicates and None values
        unique_ids = list(set([id for id in ids if id is not None]))
        if not unique_ids:
            return {}
        
        try:
            url = f"{self.esi_base_url}/v2/universe/names/"
            async with self.session.post(url, json=unique_ids) as response:
                if response.status == 200:
                    names_data = await response.json()
                    result = {item['id']: item['name'] for item in names_data}
                    
                    # Log if some IDs weren't resolved
                    resolved_ids = set(result.keys())
                    requested_ids = set(unique_ids)
                    missing_ids = requested_ids - resolved_ids
                    if missing_ids:
                        print(f"Warning: Could not resolve names for IDs: {missing_ids}")
                    
                    return result
                elif response.status == 429:
                    # Rate limited - wait a bit and retry once
                    print(f"Rate limited by ESI, waiting 2 seconds...")
                    await asyncio.sleep(2)
                    async with self.session.post(url, json=unique_ids) as retry_response:
                        if retry_response.status == 200:
                            names_data = await retry_response.json()
                            return {item['id']: item['name'] for item in names_data}
                        else:
                            print(f"Failed to resolve names after retry: {retry_response.status}")
                            return {}
                else:
                    error_text = await response.text()
                    print(f"Failed to resolve names: {response.status} - {error_text[:200]}")
                    return {}
        except Exception as e:
            print(f"Error resolving names: {e}")
            import traceback
            traceback.print_exc()
            return {}
    
    async def _get_ship_info(self, ship_type_id: int) -> Dict:
        """Get ship type information including name and tags (with caching)"""
        await self._ensure_ship_meta(ship_type_id)
        tags = self.get_ship_tags(ship_type_id)

        if ship_type_id in self.ships_cache:
            return {
                "name": self.ships_cache[ship_type_id],
                "icon_url": f"{self.image_cdn}/types/{ship_type_id}/icon",
                "tags": tags,
            }
        
        if not self.session:
            return {"name": f"Ship {ship_type_id}", "icon_url": None, "tags": tags}
        
        try:
            url = f"{self.esi_base_url}/v3/universe/types/{ship_type_id}/"
            async with self.session.get(url) as response:
                if response.status == 200:
                    type_data = await response.json()
                    ship_name = type_data.get('name', f"Ship {ship_type_id}")
                    
                    self.ships_cache[ship_type_id] = ship_name
                    self._save_ships_cache()
                    
                    return {
                        "name": ship_name,
                        "icon_url": f"{self.image_cdn}/types/{ship_type_id}/icon",
                        "tags": tags,
                    }
                else:
                    return {
                        "name": f"Ship {ship_type_id}",
                        "icon_url": f"{self.image_cdn}/types/{ship_type_id}/icon",
                        "tags": tags,
                    }
        except Exception as e:
            print(f"Error fetching ship info: {e}")
            return {
                "name": f"Ship {ship_type_id}",
                "icon_url": f"{self.image_cdn}/types/{ship_type_id}/icon",
                "tags": tags,
            }
    
    async def _get_item_name(self, item_type_id: int) -> str:
        """Get item name (with caching)"""
        # Check cache first
        if item_type_id in self.items_cache:
            return self.items_cache[item_type_id]
        
        if not self.session:
            return f"Item {item_type_id}"
        
        try:
            # Use ESI names endpoint for bulk resolution (more efficient)
            url = f"{self.esi_base_url}/v2/universe/names/"
            async with self.session.post(url, json=[item_type_id]) as response:
                if response.status == 200:
                    names_data = await response.json()
                    if names_data and len(names_data) > 0:
                        item_name = names_data[0].get('name', f"Item {item_type_id}")
                        
                        # Cache the result
                        self.items_cache[item_type_id] = item_name
                        self._save_items_cache()
                        
                        return item_name
        except Exception as e:
            print(f"Error fetching item name: {e}")
        
        return f"Item {item_type_id}"
    
    async def _get_system_info(self, system_id: int) -> Dict:
        """Get system information including name and region"""
        # Check cache first
        if system_id in self.system_cache:
            return self.system_cache[system_id]
        
        if not self.session:
            return {"name": f"System {system_id}", "region_id": None, "region_name": None}
        
        try:
            # Get system info
            url = f"{self.esi_base_url}/v4/universe/systems/{system_id}/"
            async with self.session.get(url) as response:
                if response.status == 200:
                    system_data = await response.json()
                    system_name = system_data.get('name', f"System {system_id}")
                    constellation_id = system_data.get('constellation_id')
                    region_id = None
                    region_name = None
                    
                    # Get constellation to find region
                    if constellation_id:
                        const_url = f"{self.esi_base_url}/v1/universe/constellations/{constellation_id}/"
                        async with self.session.get(const_url) as const_response:
                            if const_response.status == 200:
                                const_data = await const_response.json()
                                region_id = const_data.get('region_id')
                                
                                # Get region name
                                if region_id:
                                    region_names = await self._resolve_names([region_id])
                                    region_name = region_names.get(region_id, f"Region {region_id}")
                                    
                                    # Initialize region stats if not exists (without lock to avoid deadlock)
                                    # The actual count increment happens in _process_kill which already has the lock
                                    if region_id not in self.region_stats:
                                        self.region_stats[region_id] = {
                                            "name": region_name,
                                            "count": 0
                                        }
                    
                    result = {
                        "name": system_name,
                        "region_id": region_id,
                        "region_name": region_name
                    }
                    
                    # Cache the result
                    self.system_cache[system_id] = result
                    return result
                else:
                    return {"name": f"System {system_id}", "region_id": None, "region_name": None}
        except Exception as e:
            print(f"Error fetching system info: {e}")
            return {"name": f"System {system_id}", "region_id": None, "region_name": None}
    
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
                
                # Get zkb metadata early for PvE filtering
                zkb = package.get('zkb', {})
                
                # Filter out PvE kills - skip if no player attacker (character_id)
                # NPCs don't have character_id, so this filters out PvE kills
                # Also check zkb.npc flag as additional validation
                if not final_blow_attacker or not final_blow_attacker.get('character_id') or zkb.get('npc', False):
                    print(f"Skipping PvE kill {kill_id} - no player attacker or NPC kill")
                    return
                
                # Filter to only player attackers (those with character_id)
                player_attackers = [a for a in attackers if a.get('character_id')]
                
                # Collect all IDs that need name resolution
                ids_to_resolve = []
                if victim.get('character_id'):
                    ids_to_resolve.append(victim['character_id'])
                if victim.get('corporation_id'):
                    ids_to_resolve.append(victim['corporation_id'])
                if victim.get('alliance_id'):
                    ids_to_resolve.append(victim['alliance_id'])
                
                # Collect IDs from all player attackers
                for attacker in player_attackers:
                    if attacker.get('character_id'):
                        ids_to_resolve.append(attacker['character_id'])
                    if attacker.get('corporation_id'):
                        ids_to_resolve.append(attacker['corporation_id'])
                    if attacker.get('alliance_id'):
                        ids_to_resolve.append(attacker['alliance_id'])
                
                # Resolve names
                names = await self._resolve_names(ids_to_resolve) if ids_to_resolve else {}
                
                # Debug: Log if any character names are missing
                missing_character_names = []
                for attacker in player_attackers:
                    char_id = attacker.get('character_id')
                    if char_id and char_id not in names:
                        missing_character_names.append(char_id)
                if missing_character_names:
                    print(f"Warning: Missing character names for IDs: {missing_character_names} in kill {kill_id}")
                
                # Get ship information
                victim_ship_info = {}
                attacker_ship_info = {}
                
                if victim.get('ship_type_id'):
                    victim_ship_info = await self._get_ship_info(victim['ship_type_id'])
                
                if final_blow_attacker and final_blow_attacker.get('ship_type_id'):
                    attacker_ship_info = await self._get_ship_info(final_blow_attacker['ship_type_id'])
                
                # Process all attackers
                all_attackers_data = []
                for attacker in player_attackers:
                    attacker_ship_info_full = {}
                    if attacker.get('ship_type_id'):
                        attacker_ship_info_full = await self._get_ship_info(attacker['ship_type_id'])
                    
                    all_attackers_data.append({
                        "character_id": attacker.get('character_id'),
                        "character_name": names.get(attacker.get('character_id'), None) if attacker.get('character_id') else None,
                        "corporation_id": attacker.get('corporation_id'),
                        "corporation_name": names.get(attacker.get('corporation_id'), None) if attacker.get('corporation_id') else None,
                        "alliance_id": attacker.get('alliance_id'),
                        "alliance_name": names.get(attacker.get('alliance_id'), None) if attacker.get('alliance_id') else None,
                        "ship_type_id": attacker.get('ship_type_id'),
                        "ship_name": attacker_ship_info_full.get('name') if attacker_ship_info_full else None,
                        "ship_icon": attacker_ship_info_full.get('icon_url') if attacker_ship_info_full else None,
                        "ship_tags": attacker_ship_info_full.get('tags', []) if attacker_ship_info_full else [],
                        "damage_done": attacker.get('damage_done', 0),
                        "final_blow": attacker.get('final_blow', False)
                    })
                
                # Sort attackers by damage done (descending)
                all_attackers_data.sort(key=lambda x: x.get('damage_done', 0), reverse=True)
                
                # Get system information
                system_info = await self._get_system_info(solar_system_id)
                
                # Update region stats (only for PvP kills that passed the filter)
                if system_info.get('region_id'):
                    region_id = system_info['region_id']
                    if region_id in self.region_stats:
                        self.region_stats[region_id]['count'] += 1
                
                # Process victim fit (items)
                victim_items = victim.get('items', [])
                fit_items = []
                if victim_items:
                    # Organize items by slot (high: 27-34, mid: 19-26, low: 11-18, rig: 92-97, cargo: 5)
                    for item in victim_items:
                        item_type_id = item.get('item_type_id')
                        flag = item.get('flag', 0)
                        
                        if not item_type_id:
                            continue
                        
                        # Get item name (uses cache)
                        item_name = await self._get_item_name(item_type_id)
                        
                        # Categorize by slot
                        slot_type = None
                        if 27 <= flag <= 34:  # High slots
                            slot_type = "high"
                        elif 19 <= flag <= 26:  # Mid slots
                            slot_type = "mid"
                        elif 11 <= flag <= 18:  # Low slots
                            slot_type = "low"
                        elif 92 <= flag <= 97:  # Rigs
                            slot_type = "rig"
                        elif flag == 5:  # Cargo
                            slot_type = "cargo"
                        
                        if slot_type:
                            fit_items.append({
                                "name": item_name,
                                "type_id": item_type_id,
                                "icon_url": f"{self.image_cdn}/types/{item_type_id}/icon",
                                "flag": flag,
                                "slot": slot_type,
                                "quantity_destroyed": item.get('quantity_destroyed', 0),
                                "quantity_dropped": item.get('quantity_dropped', 0)
                            })
                
                # Format kill information
                formatted_kill = {
                    "killmail_id": kill_id,
                    "killmail_time": killmail.get('killmail_time', datetime.utcnow().isoformat()),
                    "solar_system_id": solar_system_id,
                    "solar_system_name": system_info.get('name'),
                    "region_id": system_info.get('region_id'),
                    "region_name": system_info.get('region_name'),
                    "victim": {
                        "character_id": victim.get('character_id'),
                        "character_name": names.get(victim.get('character_id'), None) if victim.get('character_id') else None,
                        "corporation_id": victim.get('corporation_id'),
                        "corporation_name": names.get(victim.get('corporation_id'), None) if victim.get('corporation_id') else None,
                        "alliance_id": victim.get('alliance_id'),
                        "alliance_name": names.get(victim.get('alliance_id'), None) if victim.get('alliance_id') else None,
                        "ship_type_id": victim.get('ship_type_id'),
                        "ship_name": victim_ship_info.get('name'),
                        "ship_icon": victim_ship_info.get('icon_url'),
                        "ship_tags": victim_ship_info.get('tags', []),
                        "damage_taken": victim.get('damage_taken', 0),
                        "fit": fit_items
                    },
                    "attacker": {
                        "character_id": final_blow_attacker.get('character_id') if final_blow_attacker else None,
                        "character_name": names.get(final_blow_attacker.get('character_id'), None) if final_blow_attacker and final_blow_attacker.get('character_id') else None,
                        "corporation_id": final_blow_attacker.get('corporation_id') if final_blow_attacker else None,
                        "corporation_name": names.get(final_blow_attacker.get('corporation_id'), None) if final_blow_attacker and final_blow_attacker.get('corporation_id') else None,
                        "alliance_id": final_blow_attacker.get('alliance_id') if final_blow_attacker else None,
                        "alliance_name": names.get(final_blow_attacker.get('alliance_id'), None) if final_blow_attacker and final_blow_attacker.get('alliance_id') else None,
                        "ship_type_id": final_blow_attacker.get('ship_type_id') if final_blow_attacker else None,
                        "ship_name": attacker_ship_info.get('name') if attacker_ship_info else None,
                        "ship_icon": attacker_ship_info.get('icon_url') if attacker_ship_info else None,
                        "ship_tags": attacker_ship_info.get('tags', []) if attacker_ship_info else [],
                        "damage_done": final_blow_attacker.get('damage_done', 0) if final_blow_attacker else 0
                    },
                    "zkb": {
                        "total_value": zkb.get('totalValue', 0),
                        "points": zkb.get('points', 0),
                        "npc": zkb.get('npc', False),
                        "solo": zkb.get('solo', False),
                        "labels": zkb.get('labels', [])
                    },
                    "zkill_url": f"https://zkillboard.com/kill/{kill_id}/",
                    "all_attackers": all_attackers_data
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
    
    def get_region_stats(self) -> List[Dict]:
        """Get region statistics sorted by activity (most active first)"""
        # Note: This is called from FastAPI which runs in the same event loop
        # We don't need async lock here since we're just reading
        stats = [
            {
                "region_id": region_id,
                "name": data["name"],
                "count": data["count"]
            }
            for region_id, data in self.region_stats.items()
        ]
        # Sort by count descending
        stats.sort(key=lambda x: x["count"], reverse=True)
        return stats
    
    async def get_system_connections(self, system_id: int) -> List[Dict]:
        """Get stargate connections for a system"""
        if not self.session:
            return []
        
        try:
            # Get system info which includes stargates
            url = f"{self.esi_base_url}/v4/universe/systems/{system_id}/"
            async with self.session.get(url) as response:
                if response.status == 200:
                    system_data = await response.json()
                    stargates = system_data.get('stargates', [])
                    
                    # Get destination system for each stargate
                    connections = []
                    for stargate_id in stargates:
                        try:
                            stargate_url = f"{self.esi_base_url}/v1/universe/stargates/{stargate_id}/"
                            async with self.session.get(stargate_url) as sg_response:
                                if sg_response.status == 200:
                                    stargate_data = await sg_response.json()
                                    destination_id = stargate_data.get('destination', {}).get('system_id')
                                    if destination_id:
                                        # Get destination system name
                                        dest_system_info = await self._get_system_info(destination_id)
                                        connections.append({
                                            "from_system_id": system_id,
                                            "to_system_id": destination_id,
                                            "to_system_name": dest_system_info.get('name'),
                                            "stargate_id": stargate_id
                                        })
                        except Exception as e:
                            print(f"Error fetching stargate {stargate_id}: {e}")
                            continue
                    
                    return connections
                else:
                    return []
        except Exception as e:
            print(f"Error fetching system connections: {e}")
            return []
    
    def get_active_systems(self) -> List[Dict]:
        """Get systems with recent kills for map visualization"""
        # Extract unique systems from recent kills
        systems_map = {}
        for kill in self.recent_kills:
            system_id = kill.get('solar_system_id')
            if system_id:
                if system_id not in systems_map:
                    systems_map[system_id] = {
                        "system_id": system_id,
                        "system_name": kill.get('solar_system_name'),
                        "region_id": kill.get('region_id'),
                        "region_name": kill.get('region_name'),
                        "kill_count": 0
                    }
                systems_map[system_id]["kill_count"] += 1
        
        return list(systems_map.values())
    
    async def get_map_data(self, force_refresh: bool = False) -> Dict:
        """Get full map data (systems, stargates, regions) with caching"""
        # Check cache first if not forcing refresh
        if not force_refresh and self.map_cache.get('systems') and len(self.map_cache.get('systems', {})) > 0:
            return self.map_cache
        
        if not self.session:
            return self.map_cache if self.map_cache else {'systems': {}, 'stargates': {}, 'regions': {}}
        
        print("Fetching map data from ESI (this may take a while)...")
        
        try:
            # Initialize cache structure
            systems_data = {}
            stargates_data = {}
            regions_data = {}
            
            # Get all regions first
            regions_url = f"{self.esi_base_url}/v1/universe/regions/"
            async with self.session.get(regions_url) as response:
                if response.status == 200:
                    region_ids = await response.json()
                    print(f"Found {len(region_ids)} regions")
                    
                    # Resolve region names
                    region_names = await self._resolve_names(region_ids)
                    for region_id in region_ids:
                        regions_data[region_id] = {
                            "region_id": region_id,
                            "name": region_names.get(region_id, f"Region {region_id}")
                        }
            
            # Get all constellations
            constellations_url = f"{self.esi_base_url}/v1/universe/constellations/"
            async with self.session.get(constellations_url) as response:
                if response.status == 200:
                    constellation_ids = await response.json()
                    print(f"Found {len(constellation_ids)} constellations")
            
            # Get all systems
            systems_url = f"{self.esi_base_url}/v1/universe/systems/"
            async with self.session.get(systems_url) as response:
                if response.status == 200:
                    system_ids = await response.json()
                    print(f"Found {len(system_ids)} systems, fetching details...")
                    
                    # Fetch system details in batches to avoid rate limiting
                    batch_size = 50
                    for i in range(0, len(system_ids), batch_size):
                        batch = system_ids[i:i + batch_size]
                        print(f"Processing systems {i+1}-{min(i+batch_size, len(system_ids))}...")
                        
                        for system_id in batch:
                            try:
                                system_url = f"{self.esi_base_url}/v4/universe/systems/{system_id}/"
                                async with self.session.get(system_url) as sys_response:
                                    if sys_response.status == 200:
                                        system_data = await sys_response.json()
                                        
                                        # Get constellation info
                                        constellation_id = system_data.get('constellation_id')
                                        region_id = None
                                        if constellation_id:
                                            const_url = f"{self.esi_base_url}/v1/universe/constellations/{constellation_id}/"
                                            async with self.session.get(const_url) as const_response:
                                                if const_response.status == 200:
                                                    const_data = await const_response.json()
                                                    region_id = const_data.get('region_id')
                                        
                                        systems_data[system_id] = {
                                            "system_id": system_id,
                                            "name": system_data.get('name'),
                                            "constellation_id": constellation_id,
                                            "region_id": region_id,
                                            "position": system_data.get('position', {}),
                                            "security_status": system_data.get('security_status', 0),
                                            "stargates": system_data.get('stargates', [])
                                        }
                                        
                                        # Store stargate connections
                                        for stargate_id in system_data.get('stargates', []):
                                            if stargate_id not in stargates_data:
                                                stargates_data[stargate_id] = {
                                                    "stargate_id": stargate_id,
                                                    "from_system_id": system_id
                                                }
                                        
                                        # Small delay to avoid rate limiting
                                        await asyncio.sleep(0.1)
                            except Exception as e:
                                print(f"Error fetching system {system_id}: {e}")
                                continue
                        
                        # Longer delay between batches
                        await asyncio.sleep(1)
            
            # Fetch stargate destinations
            print(f"Fetching {len(stargates_data)} stargate destinations...")
            for stargate_id, stargate_info in list(stargates_data.items()):
                try:
                    stargate_url = f"{self.esi_base_url}/v1/universe/stargates/{stargate_id}/"
                    async with self.session.get(stargate_url) as sg_response:
                        if sg_response.status == 200:
                            sg_data = await sg_response.json()
                            destination = sg_data.get('destination', {})
                            stargate_info['to_system_id'] = destination.get('system_id')
                            stargate_info['to_stargate_id'] = destination.get('stargate_id')
                    await asyncio.sleep(0.1)
                except Exception as e:
                    print(f"Error fetching stargate {stargate_id}: {e}")
                    continue
            
            # Update cache
            self.map_cache = {
                'systems': systems_data,
                'stargates': stargates_data,
                'regions': regions_data
            }
            
            # Save to file
            self._save_map_cache()
            self._build_derived_structures()
            
            print(f"Map data cached: {len(systems_data)} systems, {len(stargates_data)} stargates, {len(regions_data)} regions")
            
            return self.map_cache
            
        except Exception as e:
            print(f"Error fetching map data: {e}")
            import traceback
            traceback.print_exc()
            return self.map_cache if self.map_cache else {'systems': {}, 'stargates': {}, 'regions': {}}
    
    def is_connected(self) -> bool:
        """Check if RedisQ is connected"""
        return self.connected
    
    def is_paused(self) -> bool:
        """Check if parsing is paused"""
        return self._paused
    
    def pause(self):
        """Pause parsing of killmails"""
        if not self._paused:
            self._paused = True
            self._pause_event.clear()
            print("Parsing paused")
    
    def resume(self):
        """Resume parsing of killmails"""
        if self._paused:
            self._paused = False
            self._pause_event.set()
            print("Parsing resumed")
    
    async def disconnect(self):
        """Disconnect from RedisQ"""
        self._running = False
        self.connected = False
        if self.session:
            await self.session.close()
            self.session = None

# Keep the old class name for backwards compatibility
ZKillboardWebSocket = ZKillboardRedisQ
