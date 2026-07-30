# Product Spec

HandChord is a desktop-first gesture-controlled musical sandbox. Users will select chords with two-hand finger gestures.

- Left-hand vertical movement controls reverb.
- Left-hand horizontal movement controls distortion.
- Right-hand vertical movement controls internal performance volume.
- Right-hand horizontal movement controls chorus.
- Built-in sounds, personal samples, looping and composition will be added after the core instrument is stable.
- Camera and audio processing should happen locally in the browser.

## Camera preview

- The desktop-first camera experience starts only when the user selects **Start Camera**; no permission is requested when the page loads.
- Camera access requests video only and never requests microphone access.
- The webcam preview is mirrored horizontally so it behaves like a normal selfie view.
- The interface clearly shows camera-not-started, permission-requesting, active, denied, unavailable, and error states.
- Users can stop an active camera. Active media tracks must also stop when the camera experience unmounts or the page is left.
- After it is stopped, the camera does not restart unless the user selects a camera button again.
- The camera stream remains active independently of model loading, model-ready transitions, tracking state, diagnostics, and React rerenders.
- The camera becomes active only after the stable video element has accepted `srcObject`, loaded metadata, and resolved `video.play()`.
- `useCamera` has explicit ownership of the stream and may stop it only for an explicit user stop, genuine component unmount, intentional replacement, or failed startup.
- The video element remains mounted while requesting permission and while model or tracking states change.
- MediaPipe may read the active video but must never stop, detach, or replace the camera stream.

## Hand landmark tracking

- MediaPipe Hand Landmarker from the official `@mediapipe/tasks-vision` package provides browser hand tracking.
- Up to two hands can be detected at once. For each hand, the app processes 21 landmarks, handedness, and handedness confidence locally in the browser.
- The camera video and landmark canvas overlay must remain aligned for the same visible `contain` area, including letterboxing, browser resizing, and device pixel ratio.
- The video preview and overlay are mirrored exactly once so the skeleton follows the mirrored selfie view.
- Tracking processes at most one current frame at a time and skips unchanged frames so stale camera frames do not accumulate.

## Finger-state recognition

- Each detected hand classifies thumb, index, middle, ring, and little fingers as `extended`, `folded`, or `unclear`.
- Supported canonical gestures are fist (0), one (index), two (index + middle), three (index + middle + ring), four (four long fingers with folded thumb), and open palm (5).
- Raw extended-finger count and canonical gesture remain separate. For example, thumb + index has raw count 2 but is an unsupported canonical pattern, never a fist.
- Finger states use hand-local geometry. Long fingers use joints, palm distance, and palm direction; the thumb uses separate CMC/MCP/tip geometry, outward separation, and multiple agreeing signals so a naturally diagonal open thumb is not mistaken for folded.
- Hand identity uses MediaPipe anatomical handedness. Low handedness confidence is shown as unresolved rather than guessed, and screen crossing does not swap left/right roles.
- A valid gesture must remain present for 200–300 ms before becoming stable. A stable gesture remains visible through up to 500 ms of unclear or temporarily missing frames.
- A valid new pose that is still confirming is shown as **Hold…**. Low confidence, missing joints, unresolved handedness, and unsupported patterns show their specific rejection reason.
- Finger recognition remains separate from audio, chord mapping, effects, and all composition features.
