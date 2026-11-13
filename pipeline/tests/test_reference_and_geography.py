"""Reference factors, geography and the artefact writer."""

from __future__ import annotations

import json

import pytest

from freshpipe import geography, reference, weather
from freshpipe.artefacts import ArtefactError, write_artefact, write_meta
from freshpipe.sources import SOURCE_IDS


# --- Emission factors and shelf life ---------------------------------------------------------------

def test_transport_factors_match_desnz_2025_and_rank_sensibly() -> None:
    assert reference.transport_factor("sea") == pytest.approx(0.01612)     # DESNZ ID 27_320_3235_14_1
    assert reference.transport_factor("air") == pytest.approx(0.89939)     # DESNZ ID 27_317_3158_14_1
    assert reference.transport_factor("truck") == pytest.approx(0.11894)   # DESNZ ID 27_306_3140_14_1
    assert reference.transport_factor("air") > reference.transport_factor("local_truck") \
        > reference.transport_factor("truck") > reference.transport_factor("sea")


def test_every_planning_category_has_a_food_factor_and_shelf_life() -> None:
    planning = reference.load_shelf_life().dropna(subset=["planning_days"])
    for category in planning["category_id"]:
        assert reference.food_factor(category) > 0
        assert reference.planning_shelf_life_days(category) > 0
    assert reference.food_factor("poultry") == pytest.approx(9.87)       # Poore and Nemecek (2018)
    assert reference.planning_shelf_life_days("berries") == 3              # FoodKeeper strawberries 2–3 days


def test_assumed_shelf_lives_are_labelled_as_assumptions() -> None:
    planning = reference.load_shelf_life().dropna(subset=["planning_days"]).set_index("category_id")
    assert set(planning.index[planning["basis"] == "assumption"]) == {"poultry", "dates", "bananas"}


# --- Geography -------------------------------------------------------------------------------------

def test_haversine_matches_the_known_london_paris_distance() -> None:
    london, paris = (51.5074, -0.1278), (48.8566, 2.3522)
    assert geography.haversine_km(london, paris) == pytest.approx(343.5, abs=1.0)


def test_routes_use_known_places_and_declare_their_chokepoints() -> None:
    places = {p.id: p for p in geography.PLACES}
    assert len(geography.SUPPLIER_ROUTES) == 8
    assert {r.archetype for r in geography.SUPPLIER_ROUTES} == {"local_farm", "gcc_overland", "sea_import", "air_import"}
    for route in geography.SUPPLIER_ROUTES:
        assert all(p in places for p in route.place_ids)
        assert set(route.chokepoint_ids) == {p for p in route.place_ids if places[p].kind == "chokepoint"}


def test_route_distances_rank_as_expected() -> None:
    km = {r.supplier_id: geography.route_distance_km(r) for r in geography.SUPPLIER_ROUTES}
    assert km["sup-local-farm"] < km["sup-gcc-truck"] < km["sup-sea-import"] < km["sup-sea-europe"]
    assert km["sup-air-import"] < km["sup-air-europe"]


def test_routes_json_passes_its_contract(tmp_path) -> None:
    write_artefact("routes.json", geography.routes_body(), provenance="REAL",
                   sources=["fathallah2024-atlantic-council"], root=tmp_path)


# --- Weather ---------------------------------------------------------------------------------------

def test_open_meteo_response_is_parsed_into_tidy_rows() -> None:
    payload = {"daily": {"time": ["2026-01-01", "2026-01-02"], "temperature_2m_max": [25.1, 24.0],
                         "temperature_2m_mean": [21.0, 20.5], "precipitation_sum": [0.0, 1.2]}}
    frame = weather.parse_response(payload, "Dubai", 25.2, 55.3)
    assert tuple(frame.columns) == weather.CSV_COLUMNS and len(frame) == 2


def test_open_meteo_response_with_gaps_is_rejected() -> None:
    payload = {"daily": {"time": ["2026-01-01"], "temperature_2m_max": [None],
                         "temperature_2m_mean": [21.0], "precipitation_sum": [0.0]}}
    with pytest.raises(ValueError):
        weather.parse_response(payload, "Dubai", 25.2, 55.3)


def test_committed_weather_covers_the_horizon_and_is_plausible() -> None:
    frame = weather.load_weather()  # raises if any emirate misses a horizon day
    dubai = frame[frame["emirate"] == "Dubai"].assign(month=lambda f: f["date"].str[5:7])
    assert dubai.loc[dubai["month"] == "07", "tMaxC"].mean() > 38   # Dubai summer
    assert dubai.loc[dubai["month"] == "01", "tMaxC"].mean() < 28   # Dubai winter
    assert (frame["tMaxC"] >= frame["tMeanC"]).all() and (frame["precipMm"] >= 0).all()


# --- Artefact writer -------------------------------------------------------------------------------

def test_writer_rejects_unknown_sources(tmp_path) -> None:
    with pytest.raises(ArtefactError, match="unknown source"):
        write_artefact("routes.json", geography.routes_body(), provenance="REAL", sources=["nope"], root=tmp_path)


def test_writer_rejects_contract_violations(tmp_path) -> None:
    with pytest.raises(ArtefactError, match="violates"):
        write_artefact("routes.json", {"places": []}, provenance="REAL", sources=[], root=tmp_path)


def test_meta_lists_every_registered_source(tmp_path) -> None:
    meta = json.loads(write_meta(root=tmp_path).read_text(encoding="utf-8"))
    assert {s["id"] for s in meta["sourcesCatalog"]} == SOURCE_IDS
    assert meta["isFixture"] is False and meta["operatorIsFictional"] is True
