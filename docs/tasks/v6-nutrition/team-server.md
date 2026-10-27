# Team charter: Nutrition server (db + MCP) (v6, ADR-0025)
Status: skeleton 2026-10-27 14:09 (architect) · dispatch after N-F0's commit · Lead sheet: `docs/tasks/v6-nutrition.md` (team "nutri-server": mission, owned paths, frozen contracts, Assumes — normative; copy them here at dispatch) · Design: `docs/design/nutrition.md`

## Task table
| id | role/model | box | status | notes |
| --- | --- | --- | --- | --- |
(paste the team's rows from the Lead sheet; order: N-S1 → N-S2 ∥ N-S3 → N-SR → fix → N-SQ)

## Frozen contracts
(from the Lead sheet's "Frozen" line + N-F0's report: exact exported symbol names)

## Assumes (cited)
(from the Lead sheet; re-read each against its source before the first brief)

## Ports
worker 9031 — probe `ps -ef | grep "port 903"` first; never 8787/8790/8081/8991/9011/9012/9021.

## Log
- 2026-10-27 14:09 · skeleton written (architect).
