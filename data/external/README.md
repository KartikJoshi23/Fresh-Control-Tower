# data/external/ (REAL reference data; Part 1, WP2)

Every file cites its sources through ids in `pipeline/freshpipe/sources.py`. That registry also feeds `meta.json`. No value is entered without a source; stated assumptions are labelled as such.

| File | Contents | How it was produced |
|---|---|---|
| `uae_calendar.csv` | 31 events for 2023–2026: Ramadan, Eid al-Fitr, Eid al-Adha (with Arafat Day), Islamic New Year, Prophet's Birthday, National Day, New Year, school summer breaks. Each row has `source_ids`, a `verified` flag and a note. | Curated by hand from timeanddate.com's UAE holiday pages (read 13 Nov 2026). Ramadan 2026's start is confirmed by the Presidential Court (WAM). **School breaks are `verified = false`**: they come from news reports and must be checked against MoE before being cited. |
| `weather_uae.csv` | Daily max and mean temperature and precipitation for Dubai, Sharjah and Abu Dhabi, 1 Jan 2023 – 31 Oct 2026 (4,200 rows) | Fetched by `python pipeline/run.py --step weather --refresh` from the Open-Meteo Historical Weather API (ERA5; CC BY 4.0) |
| `emission_factors.csv` | Transport factors (kg CO2e per tonne.km) and food factors (kg CO2e per kg) | **Transport:** DESNZ 2025 flat file (`ghg-conversion-factors-2025-flat-format.xlsx`, OGL v3.0); each row records the DESNZ factor ID. **Food:** Poore and Nemecek (2018) global averages, via Our World in Data (CC BY 4.0). |
| `shelf_life.csv` | Storage times by category, plus the planning shelf life (days from receipt) and its `basis` | USDA FSIS FoodKeeper (CC0), with product IDs recorded. Its server refuses scripted downloads (HTTP 403), so the values were read from the official JSON in a browser. Three planning values (poultry, dates, bananas) are labelled `assumption`, each with its reason. |

**Refreshing.** Re-run the weather fetch with the command below. The other files are curated: edit them only with a source, and run the pipeline tests afterwards.

```bash
python pipeline/run.py --step weather --refresh
```
