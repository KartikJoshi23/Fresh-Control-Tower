# data/external/ (REAL reference data; filled in Part 1, WP2)

Planned files:

| File | Contents | Source |
|---|---|---|
| `uae_calendar.csv` | Festival and holiday dates for 2023–2026: Ramadan, Eid al-Fitr, Eid al-Adha, National Day, New Year, school breaks. Has a `source_url` column. | Official UAE announcements, one per row |
| `weather_uae.csv` | Daily maximum and mean temperature and precipitation for Dubai, Sharjah and Abu Dhabi | Open-Meteo Historical Weather API (CC BY 4.0) |
| `emission_factors.csv` | Transport factors by mode (truck, refrigerated truck, container ship, air freight) and food factors by category | UK DESNZ (2025); Poore and Nemecek (2018) |
| `shelf_life.csv` | Refrigerated shelf life by category | USDA FSIS FoodKeeper (CC0) |

Every file includes `source` and `accessed` columns. Values are never typed in without a source.
