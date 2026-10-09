# UI/UX and interaction specification

## Visual direction
Inspired by dark Foundry table shown by requester: deep charcoal #0e0d13, subdued charcoal surfaces, fine graphite dividers, muted burgundy urgency and quiet silver text. Not a copied VTM licensed skin. Small refined square controls, almost no ornament. No purchased fonts/assets. Russian legible; not medieval parchment by default. Theme tokens in `design/tokens.json`.

## Player widget
- Default anchored near left edge beneath Foundry tool icons, but does not overlap tool rail. Actual anchor must respect viewport and Foundry UI, configurable by drag.
- Width expanded ~250–300px; compact mode 42–52px launcher, with pending count only for authorized visible requests. Position clamps to viewport after resize; do not drift behind sidebar.
- Header `Право голоса` + drag affordance + collapse.
- Two primary buttons: `Слово` (neutral open palm icon) and `Вмешаться` (burgundy lightning/exclamation icon).
- Toggle `Только мастеру` **visible before sending**.
- Once submitted: status chip, cancel action, details editor. Category segmented menu or small 2×2 grid; target user searchable dropdown; short optional note (max 240). Can skip details.
- A user's private request never exposes private status in visible public queue counts.

## GM widget
- Launcher with count of pending visible-to-GM requests.
- Expand: two sections Urgent, Normal; within each oldest-first. One row = icon, full name in tooltip / ellipsis visually, category text, linked target (if present), state chip. GM-only row lock icon.
- Row click expands note and actions `Увидел`, `Дать слово`, `Завершить`.
- `Очистить очередь` requires confirm; should not accidentally delete request history.
- GM can reposition independently; state saved locally.

## Visual status language
Normal: silver grey. Urgent: muted burgundy with short pulse. Support: muted teal. Counteraction: dusty rose. Clarification: cool periwinkle. Status: pending grey, acknowledged pale blue, floor gold, closed desaturated green. Do not convey meaning only by color. Distinguish priority versus category in UI.

## Interaction details
- One click submits a request, privacy is already selected; clicking current request does not create duplicate.
- Initial intervention sends `intervention` immediately, then player may update subtype without triggering extra pulse.
- Acknowledge sends author a non-intrusive `Мастер увидел` status.
- Grant floor visually marks request, optionally audibly pings requester only if they opted in.
- Long player names truncate *within row*, never obscure actions or icons.
- Hover tooltip, keyboard tab, ARIA accessible. Reduced-motion fallback no animation.
- Mobile/narrow screens: stack buttons and keep panel on-screen.

## UI review criteria
See acceptance tests. No permanently flashing red. No blocking modal for routine requests. No obscuring game canvas during normal play.
