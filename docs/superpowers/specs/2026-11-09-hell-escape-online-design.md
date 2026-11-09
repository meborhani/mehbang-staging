# Hell Escape Online Rooms — Design

## Intent

Add online room creation, joining, waiting-room configuration, and multiplayer play to Hell Escape, matching the shared Mahbang room flow while preserving the existing Hell Escape screen and rules. The existing iframe remains the presentation layer; Supabase owns the authoritative game state.

## Goals

- Host can create a 2–4 seat room, share its five-digit code, and start when ready; guests can join before start.
- Empty seats are filled by server-controlled bots at start, matching other room games.
- Server validates wagers, reveals, end-turn, pact choices, turn deadlines, scoring, and bot actions.
- Polling, seat identity, rejoin, presence, disconnect grace, server history, and game completion follow existing server-room conventions.
- The game iframe receives only seat-specific, redacted state and sends intents to the parent room adapter.
- Changes are isolated to a new branch from the Stage publishing branch and published only to Stage after verification.

## Non-goals

- No gameplay-rule redesign, artwork changes, or production/Main changes.
- No browser-authoritative fallback presented as online play.
- No changes to existing game engines or room behavior.

## Approaches

1. **Browser-hosted room:** Reuse peer transport and let the host browser own the game. Rejected because host closure can interrupt play and clients can forge game state.
2. **Dedicated Supabase room and engine:** Add a Hell Escape Edge Function/core and SQL room RPCs, while reusing the shared room UI and bridging the existing iframe. Selected because it matches the newer server games and makes actions, randomness, bots, deadlines, and settlement authoritative.
3. **Rewrite Hell Escape into the generic in-page engine:** Rejected because it duplicates the existing board UI and risks changing established gameplay.

## Design calls

- Use 2–4 seats; host selects seat count, guests join the same lobby, and server bots fill vacant seats when the host starts.
- Server generates and retains the coal bag and hidden wagers; public views reveal only permitted information.
- Every player sends actions through the authenticated parent adapter to the `hell` Edge Function. The iframe never writes canonical game state.
- Keep server state versioned and saved with compare-and-swap. Polling clients retry/rejoin through their authenticated seat.
- Turn duration is 60 seconds. A turn with no valid action is handled by the server bot policy; a turn with at least one safe reveal can be ended normally. Revealing the devil advances immediately.
- Keep existing settlement rules and bot personality behavior, but run them server-side. Online local history is written from the server result.
- When reconnect grace expires, the server temporarily substitutes a bot for that seat; the human may reclaim it on reconnect. Room-wide abandonment closes the game as unfinished according to current server patterns.

## Constraints

- Preserve the existing iframe visual design and offline flow.
- Edge Function code must be available to Supabase independently of the browser bundle; SQL schema/RPC migration must be included.
- Do not place service-role credentials in the client.
- Publish the source change only to the Stage branch, never Main/production.

