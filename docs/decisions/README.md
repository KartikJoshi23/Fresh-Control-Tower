# Decisions and change requests

- **The decisions log** (short entries, each with a reason) is in `PROGRESS.md` §4. Add a row when a decision is made.
- **Change requests (CRs)** live in this folder. A CR is **required** before changing any of:
  - the approved plan (`implementation-plan.md`);
  - the design system (`docs/design-system.md`, `web/src/styles/tokens.css`);
  - the data contracts (`web/src/lib/contracts/**`, `docs/contracts/**`);
  - shared configuration and dependencies (`pipeline/config.yaml`, `pipeline/requirements.txt`, `web/package.json`).

## How to raise a CR

1. Copy `CR-000-template.md` to `CR-<next number>-<short-slug>.md`. For example, `CR-001-add-promo-depth-field.md`.
2. Fill it in, then open a pull request **that contains only the CR file**.
3. Add a ⛔ row to `PROGRESS.md` §5, "Open questions and blockers", that points to the CR.
4. **The lead decides.** The status becomes *Approved* or *Rejected*, with a reason, and the lead adds a row to the decisions log.
5. Only after approval, implement the change in a separate pull request that references the CR.

Never change a frozen item "quickly" without a CR. Another teammate's work probably depends on it.
