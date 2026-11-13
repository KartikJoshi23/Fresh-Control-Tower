# report/ (the LaTeX boardroom report; written in Phase 6)

The compiled PDF is the **single source document** for the NotebookLM deck (at most 9 slides).

## Structure

- **Main sections.** `sections/01-…09-*.tex` map **one-to-one to slides 1–9** (`implementation-plan.md` §11–12).
- **Section format.** Each section opens with:
  - `\section{<slide title>}`;
  - `\slideheadline{<one sentence>}`;
  - `\keynumbers{…}`, holding the figures the slide may use, each with its provenance.
- **Appendices.** `appendices/a–e` hold provenance and fidelity, model validation, calculation verifications, the traceability matrix and the glossary. They are not slides.
- **References.** `references.bib` (Harvard author–date via biblatex `authoryear` and Biber). Entries marked "to confirm" must be verified before they are cited.
- **Placeholders.** `\todophase{…}` marks text still to write. **None may remain in the final PDF.**

## Compile

**Overleaf:**
1. Upload the `report/` folder, or connect the GitHub repository.
2. Set Menu → Compiler to **pdfLaTeX**. Biber runs automatically.
3. Copy the screenshots the report uses into `report/figures/`.

**Locally (MiKTeX or TeX Live):**

```bash
latexmk -pdf main.tex
```

The skeleton was checked on 13 Nov 2026 with MiKTeX (pdfLaTeX + Biber): it compiles with no errors.
