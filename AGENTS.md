# HandChord Agent Guide

These are the permanent rules for this project:

- This is a desktop-first web application.
- Use React, TypeScript and Vite.
- Keep camera, gesture, audio and UI logic separated.
- Keep implementation tasks small.
- Explain changes for someone with minimal coding experience.
- Do not add dependencies without explaining why.
- Build and test after changes.
- Avoid unrelated refactors.
- Update the relevant Markdown documentation whenever product behaviour, architecture, testing requirements or milestone status changes.
- AudioBufferSourceNode instances are one-use only; create a new source node for every sample trigger and clean it up after release.
- Looping sample voices must always receive an explicit gain release, source stop, disconnect, and active-voice cleanup; never leave a loop running after its owner stops.
- Store personal audio data in IndexedDB, never localStorage. Use localStorage only for small preferences.
- Personal-sound persistence changes must remain backward compatible with valid older local records.
- Built-in instruments and personal sounds must use the shared sound-source architecture and the same AudioContext/effect graph.
- Imported audio must remain local unless a future feature explicitly introduces an upload workflow.
