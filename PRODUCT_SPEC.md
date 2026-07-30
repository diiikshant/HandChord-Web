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
