# data/

| Folder | Committed? | Contents | Provenance |
|---|---|---|---|
| `external/` | **Yes** (small files) | UAE festival calendar with a source per date, UAE weather (Open-Meteo), emission factors, shelf lives | REAL (each file cites its source) |
| `processed/` | **Yes** (small files) | `calibration.json`, `fidelity_report.json` | Derived from the REAL datasets |
| `interim/` | No (gitignored) | Cleaned caches of the raw datasets | Derived |
| `synthetic/` | No (gitignored) | The generated UAE world (rebuilt from the seed in `pipeline/config.yaml`) | CALIBRATED SYNTHETIC |

- **Raw datasets** live in `/Datasets/`. That folder is gitignored; the download steps are in the root `README.md`.
- Because `calibration.json` is committed, anyone can regenerate the synthetic world **without** downloading the raw data.
- Licences are listed in `DATA_LICENSES.md`.
