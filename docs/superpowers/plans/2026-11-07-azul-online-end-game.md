# Azul online rooms and end-game action

## Goal

Enable Azul in the existing host-authoritative online room flow, retain its standalone AI mode, and add a confirmed end-game action.

## Design

- Reuse the existing room code, lobby, peer transport, host seat, and AI-filled empty seats in `index.html`.
- Keep the Azul rules engine in `games/azul/index.html`. The host iframe owns online match state; guest iframes render host snapshots and send intent-only tile selection, row placement, and floor placement actions.
- Validate online snapshots at the parent before storing and broadcasting them. The child validates turn, source, color, and legal destination before mutating state.
- In solo mode, the end-game control ends the current game and shows the existing score result. In an online room, any player can request match termination; the host marks the game ended and broadcasts its final snapshot.
- Keep the current end-state and all room controls inside existing UI; add no service or backend.

## TDD plan

1. Add a browser test proving Azul room controls are enabled and the in-game settings expose end-game confirmation; verify it fails on current behavior.
2. Enable Azul room controls and route create/join/start through generic transport. Add Azul snapshot validation and host action dispatch.
3. Add child iframe online initialization, host snapshot publish, guest snapshot apply, validated remote actions, host-only AI, and return-to-hub behavior.
4. Add confirmed end-game flow for solo and online play.
5. Run browser tests for lobby, AI, end confirmation, selection/placement, snapshot propagation, and regression smoke checks; inspect the diff and publish only the current Stage branch after successful checks.

## Files

- `index.html`: lobby activation, transport messages, snapshot validation, iframe bridge, and host termination.
- `games/azul/index.html`: online state ownership, local-vs-remote actions, state sync, and end-game UI.
- `tests/azul-online-room.cjs`: bounded Chromium browser coverage.
