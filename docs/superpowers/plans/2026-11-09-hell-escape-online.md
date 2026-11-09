# Hell Escape Online — Implementation Plan

## 1. Server game core

- Add an isolated server engine wrapper using the existing Hell Escape rules engine and server-only random source.
- Add seat-specific state projections that hide the unrevealed bag and opponents' unrevealed wagers.
- Implement server actions for room start, wager/chip add, lock, reveal, end turn, pact accept/decline, next round, deadlines, bot moves, disconnect substitution, and completion.
- Add tests for authorization, invalid actions, secrecy, 60-second turn handling, bot completion, and settlement.

## 2. Supabase room service

- Add `mb_hell` and `mb_hell_seat` tables plus authenticated create/join/resize/leave/poll/context RPCs.
- Add compare-and-swap save, expiry/disconnect handling, server history writes, cleanup, and grants matching the existing server rooms.
- Add the `hell` Edge Function endpoint and server-side core import.

## 3. Shared room UI and iframe bridge

- Register Hell Escape in the shared game room registry and server adapter.
- Add create/join/lobby/start/rejoin/presence behavior using existing room UI and five-digit codes.
- Pass only the authenticated seat's projected server state into the existing iframe; route game intents back to the Edge Function.
- Keep offline AI and local resume paths intact; online mode hides AI tutorial/play controls that are offline-only.
- Save online results through the existing history/report convention.

## 4. Verification and Stage publication

- Run engine tests, Hell Escape tests, shared room tests, SQL/static checks, and browser host/guest integration tests.
- Capture a mobile viewport during lobby and active online play when browser tooling permits.
- Commit the isolated change, push only the Stage publishing branch, and report the deployed Stage URL and commit.

