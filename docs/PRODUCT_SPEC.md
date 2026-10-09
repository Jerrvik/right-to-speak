# Functional specification — Right to Speak v1.0

## 1. Goal and scope
Players need a low-disruption way to request speech or urgently interrupt a developing scene. The GM must know whether a request involves support, counteraction, action, or clarification and which participant is involved. Works on **Foundry VTT 14**, regardless of game system (including VTM V20 and medieval fantasy).

## 2. Participants
- Player: submit, edit, link, cancel, view own requests and other public requests.
- Gamemaster: all player capabilities + manage every request, see private requests, acknowledge, grant floor, close, clear queue.
- Multi-GM: avoid competing acknowledgments with a predictable policy; all active GMs can see and handle; conflict resolved by revision/authoritative processor.

## 3. Player actions
### A. 'Слово' — normal
One click submits a normal public request without needing a form. Show status and allow editing optional note/target and privacy. Consider allowing privacy selection *before creation*, to avoid leaking an initially public request. If user has selected GM-only mode persist that choice locally so both buttons honor it at creation time.

### B. 'Вмешаться' — urgent
One click emits initial request immediately with currently selected visibility. Other users see urgent public alert without requiring chat posts; private alert goes only to the GM. After submitting, player can optionally categorize it: `action`, `support`, `counteraction`, `clarification`, add a note and link to another participant (user ID). Updating is not a new alert; badge and queue entry update in place. Explicit save or autosave, never on every keystroke across sockets.

### C. Privacy
GM-only switch always visible before either submit button; it must apply to request *at submission*. It must remain visible/editable once submitted, but **changing private to public requires explicit confirmation** and a fresh safe public projection; changing public to private cannot erase information already witnessed. Show a warning about this. Default public, unless player's own previous choice was private.

### D. Linking
Optional `targetUserId` selected from user roster, including offline actors? Do **not** show offline users by default; optionally allow GMs. Choose user, not player-character or token. Target link shown to GM and to public users only when request itself is public. Other player does not automatically become an owner or get private note access simply by being linked.

### E. One request per player
Each player has at most one active request. Re-click can show request/editor or cancel via explicit action, not create duplicates. Priority escalation normal→urgent allowed, but rate-limited; cannot downgrade to bypass cooldown. Updates retain original creation time and queue position; urgency sorting separated from FIFO.

## 4. Request categories
`word`, `action`, `support`, `counteraction`, `clarification`; `word` is separate normal action, remaining categories are urgent subtypes. Before choosing subtype, urgent is displayed as `intervention` (unspecified). Categories describe player intent, not game mechanics and never automate rolls.

## 5. Statuses
`pending` → `acknowledged` → `floor` → `closed`; GM may go `pending` → `floor` or close immediately. Player cancellation changes active to `cancelled` (not visible in active queue). GM acknowledgments clearly signal 'Мастер увидел' to the submitter. Giving floor highlights player in queue; never starts an audio call. Closing removes active card with concise confirmation. Closed/cancelled retention: session-only bounded list; allow purge on GM clear. Reopen out of scope.

## 6. Urgent behavior
At arrival: 2–3 restrained pulses on GM panel, then persistent indicator. No full-screen flashing. Sound off by default; user opt-in. Private urgent pulse **GM only**, public can use subdued visible alert for everyone; options default to GM + requester strong emphasis, others mild. If panel collapsed, badge and pulse on launcher.

## 7. Persistence and reconnect
Shared active request queue and status changes survive refresh/reconnect. Track logical schema version and request revision. GM/client reconnect receives authorized snapshot without leakage. Local per-user panel position, collapsed state and preferences retained. Stale/duplicate events must not create multiple entries. If no GM is connected: display clearly `Мастер не в сети`; queue locally with 'not delivered' status or disable submit and explain — choose one and document; **never pretend delivery succeeded**.

## 8. Preferences
GM world settings: public queue visibility (default visible); sounds permission opt-in; rate limit; maximum retained completed requests; whether anonymous public notes visible; private-by-default optional GM control (consider preference privacy). User settings: panel position, collapsed state, sounds on/off, reduce motion, last-selected visibility. Respect OS reduced motion.

## 9. Out of scope for v1
- Dice rolls, initiative, VTM disciplines, integration with actor sheets.
- Audio/video voice chat integration.
- Separate universal safety/pause system. Do not conflate roleplay urgency with an actual player safety stop.
- Full activity analytics, permanent chat logs, histories across multiple campaigns.
- Cross-world cloud state.

## 10. Accessibility
Keyboard accessible buttons and focus order, screen-reader labels; status updates via aria-live (polite; urgent assertive only if suitable), tooltips, focus visible, usable at 200% zoom, good contrast, text truncation with title tooltip. ESC closes dropdowns not the underlying request.
