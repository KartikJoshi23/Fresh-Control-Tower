"""Registry of every external source the pipeline cites.

It feeds `meta.json` (`sourcesCatalog`), and the artefact writer checks that every source id an
artefact cites exists here. `verified=False` marks a source that has not yet been checked against its
primary page. It must be verified before the report cites it (PROGRESS.md, known issues).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

ACCESSED = "2026-11-13"


@dataclass(frozen=True)
class Source:
    """One citable source. `citation` is the short Harvard form, for example "UNEP (2024)"."""

    id: str
    citation: str
    url: str | None
    licence: str
    verified: bool = True
    accessed: str = ACCESSED

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


SOURCES: tuple[Source, ...] = (
    # --- Real datasets -------------------------------------------------------------------------
    Source("wang2025-freshretailnet", "Wang et al. (2025)", "https://arxiv.org/abs/2505.16319", "CC BY 4.0"),
    Source("dingdong2025-frn50k", "Dingdong-Inc (2025)",
           "https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K", "CC BY 4.0"),
    Source("dingdong2026-frnlt", "Dingdong-Inc (2026)",
           "https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-LT", "CC BY 4.0"),
    Source("yapwh2023-vegetables", "YapWH (2023)",
           "https://www.kaggle.com/datasets/yapwh1208/supermarket-sales-data", "CC BY-NC-SA 4.0"),
    Source("ma2024-cumcm", "Ma (2024)", "https://arxiv.org/abs/2409.09065", "arXiv preprint (cited)"),
    # --- Problem evidence ----------------------------------------------------------------------
    Source("unep2024-food-waste", "UNEP (2024)",
           "https://wedocs.unep.org/bitstream/handle/20.500.11822/45275/Food-Waste-Index-2024-key-messages.pdf",
           "Cited (UNEP)"),
    Source("sohail2026-gulf-business", "Sohail (2026)",
           "https://gulfbusiness.com/en/2026/logistics/higher-costs-tighter-margins-how-hormuz-disruptions-are-testing-uae-food-supplies/",
           "Cited (Gulf Business)"),
    Source("fathallah2024-atlantic-council", "Fathallah (2024)",
           "https://www.atlanticcouncil.org/blogs/menasource/uae-food-security", "Cited (Atlantic Council)"),
    Source("communicate2026-nielseniq", "Communicate Online (2026)",
           "https://communicateonline.me/news/ramadan-fuels-double-digit-fmcg-growth-boosts-tech-sales-across-mena/",
           "Cited (Communicate; NielsenIQ data)"),
    Source("rana2026-worldpanel", "Rana (2026)",
           "https://worldpanelbynumerator.com/insights/uae-fmcg-demand-q1-2026-ramadan-consumption-trends",
           "Cited (Worldpanel by Numerator)"),
    Source("goharbakhsh2026-hormuz", "Goharbakhsh, Rahbari and Aghabayk (2026)",
           "https://doi.org/10.3390/su18189534", "CC BY 4.0"),
    Source("ihl2025-distortion", "IHL Group (2025)",
           "https://www.ihlservices.com/news/analyst-corner/2025/09/retail-inventory-crisis-persists-despite-172-billion-in-improvements",
           "Cited (vendor estimate)"),
    Source("sebugwaawo2022-khaleej-times", "Sebugwaawo (2022)",
           "https://www.khaleejtimes.com/uae/uae-dh6-billion-worth-of-food-wasted-annually-says-minister",
           "Cited (Khaleej Times)"),
    # --- Reference data ------------------------------------------------------------------------
    Source("open-meteo", "Open-Meteo (n.d.)", "https://open-meteo.com/en/docs/historical-weather-api",
           "CC BY 4.0 (non-commercial use)"),
    Source("desnz2025-ghg-factors", "DESNZ (2025)",
           "https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025",
           "Open Government Licence v3.0"),
    Source("usda-foodkeeper", "USDA FSIS (2025)", "https://catalog.data.gov/dataset/fsis-foodkeeper-data", "CC0 1.0"),
    Source("poore-nemecek2018", "Poore and Nemecek (2018)", "https://doi.org/10.1126/science.aaq0216",
           "Cited (Science)"),
    Source("owid-ghg-per-kg", "Our World in Data (n.d.)", "https://ourworldindata.org/grapher/ghg-per-kg-poore",
           "CC BY 4.0"),
    # --- UAE calendar --------------------------------------------------------------------------
    Source("timeanddate-uae-holidays", "timeanddate.com (n.d.)",
           "https://www.timeanddate.com/holidays/united-arab-emirates/", "Cited (secondary aggregator)"),
    Source("wam2026-ramadan-start", "WAM (2026)",
           "https://www.wam.ae/en/article/bysbidd-breaking-wednesday-first-day-ramadan-uae", "Cited (official)"),
    Source("wam2025-school-calendar", "WAM (2025)",
           "https://www.wam.ae/en/article/bkttnt6-ministry-education-unveils-new-school-calendar-for",
           "Cited (official)", verified=False),
    Source("news-school-calendar-2023", "ProPakistani (2023)",
           "https://propakistani.pk/2023/07/31/dates-revealed-for-the-new-school-term-in-uae/",
           "Cited (news)", verified=False),
    Source("news-school-calendar-2024", "Emirates 24|7 (2024)",
           "https://www.emirates247.com/uae/uae-school-year-wrap-up-students-last-day-june-14-teachers-summer-break-begins-july-15-2024-05-01-1.731965",
           "Cited (news)", verified=False),
    Source("news-school-calendar-2025", "The National (2024)",
           "https://www.thenationalnews.com/uae/education/2024/07/04/uae-school-calendar-2024-25-holidays",
           "Cited (news)", verified=False),
    Source("news-school-calendar-2026", "Gulf News (2026)",
           "https://gulfnews.com/living-in-uae/education/uae-school-calendar-2026-27-when-do-schools-reopen-after-summer-break-1.500596274",
           "Cited (news)", verified=False),
    # --- Placeholders --------------------------------------------------------------------------
    Source("fixture-placeholder", "Phase 4 placeholder (no external source)", None, "n/a"),
)

SOURCE_IDS: frozenset[str] = frozenset(source.id for source in SOURCES)


def catalog() -> list[dict[str, object]]:
    """The `sourcesCatalog` list for meta.json, in registry order."""
    return [source.as_dict() for source in SOURCES]
