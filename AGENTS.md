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
- Camera and microphone streams must have separate lifecycle ownership; cleanup of one must never stop tracks owned by the other.
- User recordings remain local unless a future feature explicitly adds an upload workflow.
- MediaRecorder MIME types must be feature-detected before recording starts; do not assume one browser format works everywhere.
- All microphone tracks and analysis nodes must be explicitly cleaned up after recording, cancellation, error, page hiding, or unmount.
- Notes in one sampled chord must use shared AudioContext scheduling and the final clamped playback rate when calculating their duration.
- Manage sampled chord voices as one group so their release, stop, disconnect, and cleanup cannot drift apart.
- Musical transport scheduling must use AudioContext time and exact sample-frame ranges; visual timers must never be the timing source of truth.
- Internal composition recording must exclude the metronome, manual master gain, final compressor, and composition-loop playback.
- Register the composition AudioWorklet once per AudioContext, and never route loop playback back into the performance recording tap.
- Composition transport changes must follow its explicit state model, and every loop playback AudioBufferSourceNode must receive explicit stop and cleanup.
- All layers in one composition must share the same timing definition and use one shared AudioContext playback start time.
- Keep runtime composition AudioBuffers separate from serialisable layer metadata; existing layers must never be baked into a newly recorded layer.
- Layer effects are baked during recording and layer playback must not pass through those effects a second time.
- Store project audio in IndexedDB, never localStorage, and never serialise runtime Web Audio objects.
- Never delete a previously valid saved project before its replacement save transaction succeeds.
- Project schemas must be versioned and migrated explicitly; Personal Sounds and project audio have separate ownership.
- Project loading must validate saved audio frame count and metadata. All project audio remains local unless a future feature explicitly adds upload.
