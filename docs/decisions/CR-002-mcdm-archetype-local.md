# CR-002: rename the MCDM archetype `local_farm` to `local`

| Field | Value |
|---|---|
| Raised by | Anurag |
| Date | 2026-11-14 |
| Status | Proposed |
| Affects | data contract |
| Files | `web/src/lib/contracts/mcdm.ts` (`Archetype`), `docs/contracts/mcdm.schema.json`, `pipeline/freshpipe/mcdm.py` (`CONTRACT_ARCHETYPE`) |
| Tasks affected | P4-03 (producer), P8-02 and P8-03 (Sourcing page, Route Globe labels) |

## Problem

Decision D-22 (Part 2) added a second local supplier, `sup-local-bakery`, and renamed the routes archetype from `local_farm` to `local`, so it covers both the vertical farm and the bakery.

The MCDM contract still only accepts `local_farm`. So `mcdm.json` currently labels the **bakery** as `local_farm`, through a mapping in `mcdm.py` (`CONTRACT_ARCHETYPE`). The file is valid, but the Sourcing page would show a bakery as a farm.

## Proposed change

```diff
-export const Archetype = z.enum(["local_farm", "gcc_overland", "sea_import", "air_import"]);
+export const Archetype = z.enum(["local", "gcc_overland", "sea_import", "air_import"]);
```

- Bump `CONTRACT_VERSION` to 1.1.0 and run `npm run contracts:export`.
- Drop the mapping in `mcdm.py` and re-run `python pipeline/run.py --step mcdm`.

## Impact

- **Who changes what.** One enum value, one mapping and one regenerated file. No page has been built on it yet (Part 8).
- **Version.** `CONTRACT_VERSION` changes, so every artefact's header changes too. A full re-export (`--step part4` and the Part 1 steps that write artefacts) keeps everything on 1.1.0.

## Alternatives considered

- **Keep `local_farm`** and explain it in the UI. Rejected: a bakery labelled as a farm misleads the board.
- **Add `local` alongside `local_farm`.** This leaves two names for one archetype.

## Lead decision

<Pending>
