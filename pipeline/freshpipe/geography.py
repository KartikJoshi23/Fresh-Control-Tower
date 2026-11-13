"""Places and supplier routes (task P1-06) → routes.json, plus great-circle distances for CO2e.

Places are real, with coordinates rounded to 0.01°. Suppliers are FICTIONAL archetypes:
- local producers (a vertical farm and a commercial bakery);
- GCC overland;
- sea import through or around Hormuz;
- air import.

Their routes follow real geography, including the chokepoints named in the evidence:
Hormuz, Bab el-Mandeb and Suez.
Route distances chain the great-circle legs between waypoints, which approximates (and slightly
understates) real sailing or driving distances.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

EARTH_RADIUS_KM = 6371.0088  # mean Earth radius (IUGG)


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    kind: str  # origin | port | hub | store_region | chokepoint
    lat: float
    lon: float


@dataclass(frozen=True)
class SupplierRoute:
    supplier_id: str
    supplier_name: str
    archetype: str  # local | gcc_overland | sea_import | air_import
    mode: str       # local_truck | truck | sea | air
    place_ids: tuple[str, ...]
    chokepoint_ids: tuple[str, ...]

    @property
    def route_id(self) -> str:
        return f"route-{self.supplier_id.removeprefix('sup-')}"


PLACES: tuple[Place, ...] = (
    Place("uae-dubai", "Dubai (Jebel Ali)", "hub", 25.01, 55.06),
    Place("uae-dxb", "Dubai International Airport (cargo)", "hub", 25.25, 55.36),
    Place("uae-khor-fakkan", "Khor Fakkan port (Gulf of Oman)", "port", 25.35, 56.36),
    Place("hormuz", "Strait of Hormuz", "chokepoint", 26.57, 56.25),
    Place("bab-el-mandeb", "Bab el-Mandeb", "chokepoint", 12.58, 43.33),
    Place("suez", "Suez Canal", "chokepoint", 30.42, 32.35),
    Place("origin-dubai-farm", "UAE vertical farm (fictional site)", "origin", 24.95, 55.20),
    Place("origin-dubai-bakery", "UAE commercial bakery (fictional site)", "origin", 24.98, 55.17),
    Place("origin-muscat", "Muscat, Oman", "origin", 23.59, 58.41),
    Place("origin-al-kharj", "Al Kharj, Saudi Arabia", "origin", 24.15, 47.31),
    Place("origin-nhava-sheva", "Nhava Sheva (JNPT), India", "port", 18.95, 72.95),
    Place("origin-rotterdam", "Rotterdam, Netherlands", "port", 51.95, 4.14),
    Place("origin-nairobi", "Nairobi (air cargo), Kenya", "origin", -1.32, 36.93),
    Place("origin-amsterdam", "Amsterdam (air cargo), Netherlands", "origin", 52.31, 4.76),
)

SUPPLIER_ROUTES: tuple[SupplierRoute, ...] = (
    SupplierRoute("sup-local-farm", "UAE vertical farm (fictional)", "local", "local_truck",
                  ("origin-dubai-farm", "uae-dubai"), ()),
    SupplierRoute("sup-local-bakery", "UAE commercial bakery (fictional)", "local", "local_truck",
                  ("origin-dubai-bakery", "uae-dubai"), ()),
    SupplierRoute("sup-gcc-truck", "GCC overland supplier, Oman (fictional)", "gcc_overland", "truck",
                  ("origin-muscat", "uae-dubai"), ()),
    SupplierRoute("sup-gcc-ksa", "GCC overland supplier, Saudi Arabia (fictional)", "gcc_overland", "truck",
                  ("origin-al-kharj", "uae-dubai"), ()),
    SupplierRoute("sup-sea-import", "Sea importer via Jebel Ali, India (fictional)", "sea_import", "sea",
                  ("origin-nhava-sheva", "hormuz", "uae-dubai"), ("hormuz",)),
    SupplierRoute("sup-sea-khorfakkan", "Sea importer via Khor Fakkan, India (fictional)", "sea_import", "sea",
                  ("origin-nhava-sheva", "uae-khor-fakkan", "uae-dubai"), ()),
    SupplierRoute("sup-sea-europe", "Sea importer via Suez, Netherlands (fictional)", "sea_import", "sea",
                  ("origin-rotterdam", "suez", "bab-el-mandeb", "hormuz", "uae-dubai"),
                  ("suez", "bab-el-mandeb", "hormuz")),
    SupplierRoute("sup-air-import", "Air importer, Kenya (fictional)", "air_import", "air",
                  ("origin-nairobi", "uae-dxb"), ()),
    SupplierRoute("sup-air-europe", "Air importer, Netherlands (fictional)", "air_import", "air",
                  ("origin-amsterdam", "uae-dxb"), ()),
)

_PLACES_BY_ID = {place.id: place for place in PLACES}


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance in km between two (lat, lon) points in degrees."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def route_distance_km(route: SupplierRoute) -> float:
    """Sum of great-circle legs along the route's waypoints."""
    points = [(_PLACES_BY_ID[p].lat, _PLACES_BY_ID[p].lon) for p in route.place_ids]
    return sum(haversine_km(a, b) for a, b in zip(points, points[1:]))


def routes_body() -> dict[str, object]:
    """The routes.json body."""
    return {
        "places": [{"id": p.id, "name": p.name, "kind": p.kind, "lat": p.lat, "lon": p.lon} for p in PLACES],
        "routes": [{"id": r.route_id, "supplierId": r.supplier_id, "mode": r.mode,
                    "placeIds": list(r.place_ids), "chokepointIds": list(r.chokepoint_ids)}
                   for r in SUPPLIER_ROUTES],
    }
