# Wayfinder’s Rest — Project Spec (Living Doc)

## Purpose
A meta-game web site with puzzles, keys, and a final hangout tavern.It will continue to evolve. My vision is a web based labrynth game that can quickly have new levels added via new web pages and will ultimately persist character data and have a multiplayer element to it. 

## Hosting
- Render Web Service
- Repo: WayfinderSolutions-cloud/Flowise
- Root directory: wayfinder-site
- Gate: SITE_GATE_CODE (cookie wf_gate=1)
- Health: GET /health returns {"ok":true}

## High-level flow
- / (star chart puzzle) -> /jump (warp) -> /labyrinth (maze hub)
- Keys:
  - Dragon mini-game at /dragon grants localStorage wayfinder_key_dragon=1
  - Lateral mini-game at /lateral grants localStorage wayfinder_key_lateral=1
- When both keys exist, hidden Rest door appears in labyrinth (farthest cell) and becomes active when touched.
- /rest is the final tavern hangout scene.

## Key routes & assets (wayfinder-site)
- server.js (routes, gate, static file serving)
- /labyrinth: labyrinth.html, maze.js, maze.css, terminal.css
- /dragon: dragon.html, dragon.js, dragon.css
- /lateral: lateral.html, lateral.js, lateral.css
- /dream: dream.html, dream.css, dream-castle.png
- /lateral-dream: lateral-dream.html, lateral-vignette.png
- /rest: rest.html, rest.js, rest.css, rest-tavern.png

## Current important constants
- Rest tavern background image: rest-tavern.png (1216x672)
- Arrival message bubble on /rest: shows after 3s and persists until clicked

## Conventions
- Prefer full-file replacements when changing key files.
- Always list files/routes/env vars to change and how to test locally + on Render.