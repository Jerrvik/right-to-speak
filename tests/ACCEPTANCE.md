# Acceptance criteria and test plan

## A. Build / packaging — MUST
- [ ] `module.json` valid V14 manifest; `id` = `right-to-speak`, `type` = `module`, compatibility minimum 14. Set `verified` only after actual confirmation.
- [ ] No imaginary repository URLs or placeholder release download URLs.
- [ ] Installable ZIP includes root folder `right-to-speak/` with `module.json` at immediate child path.
- [ ] Valid ES module import, all assets load, ru/en localized, game system independent.
- [ ] No external runtime dependencies.

## B. UI — MUST
- [ ] Move, collapse and reopen panel with saved position/setting per user.
- [ ] On first load, visible without overlapping tool rail or sidebar.
- [ ] Handle narrow window, zoom and browser resize.
- [ ] Two buttons prominently visible; no need to depend on player's name length.
- [ ] Dark charcoal/graphite/burgundy, legible labels, no perpetual animation.
- [ ] Works with keyboard and reduced-motion preferences.

## C. Player flow — MUST
- [ ] Normal request with single click; urgent request with single click, categorization after delivery.
- [ ] One active request per player; duplicate click doesn't spam.
- [ ] Optional target **user**, optional note, all four intervention subtypes.
- [ ] Privacy selection applied at creation (no temporary public leak).
- [ ] Player can cancel, see acknowledgement/floor status and amend pending request.

## D. GM flow — MUST
- [ ] GM sees public and private queues with urgency/FIFO order.
- [ ] GM can acknowledge, grant floor, close; players see authorized status updates.
- [ ] Queue survives reconnect and refresh; no duplicate records or stale events.
- [ ] GM can clear all with confirmation; if multiple GMs, documented conflict resolution.
- [ ] Offline GM behavior transparent to requester.

## E. Security — RELEASE BLOCKERS
- [ ] GM-only private request not transmitted in plaintext on broadcast sockets or globally readable settings/documents.
- [ ] Nonrecipient browser receives no private request presence/count/metadata via socket, DOM, cache or snapshots.
- [ ] Privacy survives refresh and reconnect; linked player cannot see private note just because named.
- [ ] Actions verify actual permissions/ownership as far as Foundry supports; trust-boundary limitations documented.
- [ ] Private→public explicit confirmation; public→private cautions previous disclosure.
- [ ] No HTML injection through names or notes.

## F. Tests — MUST
- [ ] Unit: reducer statuses, FIFO priority, idempotence, validation, projection filtering.
- [ ] Manual Foundry V14: GM + 2 players, concurrent action, reload, disconnect, secret target, rapid clicks, long nickname.
- [ ] Report automated checks separately from manual checks; do not falsely mark manual tests passed.
