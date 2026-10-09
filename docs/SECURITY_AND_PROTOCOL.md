# Security, synchronization and protocol requirements

## NON-NEGOTIABLE PRIVATE REQUEST POLICY
A GM-only request's existence, owner, type, target, note, time, count, status and payload must not be exposed to non-GM clients, including via DOM, console logs, broadcast socket payloads, shared settings or accessible persisted documents. Hiding a broadcast message in CSS or filtering in the client is **not confidentiality**.

## Foundry transport threat model
Official Foundry module documentation describes `socket: true` as a module namespace that relays packets **to all other connected clients**, so `game.socket.emit('module.right-to-speak', {recipient: GM, secret: ...})` by itself is not private; other clients may receive the bytes. Do not implement GM-only secrecy that way. Assess V14 server-enforced document permissions and whisper visibility, or another genuinely server-enforced method. If no appropriate secure mechanism exists in a standalone module, report it as a blocker; do not silently downgrade privacy. Socketlib-style targeted routing alone is not proof of server-side secrecy without verifying transport routing.

## Authorization
- Validate effective sender, request ownership, and GM privilege. A user-supplied `senderId` or `isGM` is untrusted.
- Use server-enforced document ownership/visibility where possible.
- If a GM-connected client acts as coordinator, note that this guards ordinary users with unmodified clients but is not robust against malicious forged sockets unless server enforces provenance.
- Sanitize notes as text, not HTML; use `textContent`, no raw `innerHTML` injection, and bound note length (e.g. 240 chars). Validate enums/UUID length and target IDs.
- Avoid inadvertently writing private details into public chat, logs, settings, or shared reducer state.

## Suggested logical model
```
Request {
 id: UUID, ownerUserId: string, urgency: 'normal'|'urgent',
 category: 'word'|'intervention'|'action'|'support'|'counteraction'|'clarification',
 targetUserId: string|null, note: string,
 visibility: 'public'|'gm', status: 'pending'|'acknowledged'|'floor'|'closed'|'cancelled',
 createdAt: ISO8601, updatedAt: ISO8601, revision: integer
}
```

Do not require timestamps from client to establish ordering. GM authoritative sequencer or suitable server-backed solution should assign monotonic order and revisions. Active queue sorting: urgent section first, then FIFO within each section. Keep public/private views isolated.

## Logical messages (transport to be selected only after security proof)
- CREATE_REQUEST: unique request id or idempotency key, visibility at creation.
- UPDATE_REQUEST: category/target/note/visibility, expected revision.
- CANCEL_REQUEST: requester-owned active request.
- ACKNOWLEDGE_REQUEST, GRANT_FLOOR, CLOSE_REQUEST: GM only.
- SNAPSHOT_REQUEST / SNAPSHOT_RESPONSE: per-view authorization and projection.
- STATE_EVENT: revisioned nonsecret events only; never broadast private existence.

## Delivery rules
- Private created: only owner+GM have access; no public badge increments, empty-slot changes, timing signal or placeholder shown to others.
- Public created: share only appropriate public fields; redact note if configured.
- GM offline: explicit state; no false acknowledgment.
- Reconnect/resync: unauthorized clients cannot fetch cached private data.
- Failure to deliver: explicit error and retry; no lost request labeled as successful.
- Player cancels while GM acknowledges: conflict deterministic with revisions.

## Privacy validation scenarios
1. Three browser sessions: GM, Alice, Bob. Alice submits private counteraction with Bob targeted. Bob browser network inspector and DOM must see *no private data or identifiable event*.
2. Bob refreshes, switches tabs, reconnects and inspects all shared state: still no leak.
3. GM refreshes, rejoins and receives the private request; Alice sees own status.
4. Alice changes private→public: confirm, then only public projection appears.
5. Alice changes public→private: warn earlier public disclosure cannot be undone.
6. Try malicious forged updates from another player and forged GM actions; reject where enforcement permits; document any residual limits.

## Security gate
No 'ready for release' claim until multi-client privacy verification. If robust GM-only privacy requires architecture beyond standard module APIs, ship a clearly labeled public-only prototype **only with user approval**; never include fake 'secret' functionality.
