# Testing Checklist

- Dependencies install successfully.
- Development server starts.
- The HandChord start screen opens in Chrome on a desktop or laptop.
- Production build succeeds.
- Browser console has no errors.
- Camera permission is not requested when the page loads.
- **Start Camera** requests video permission only.
- Microphone permission is never requested.
- The active webcam preview is mirrored horizontally.
- **Stop Camera** stops the webcam indicator and returns to the not-started state.
- Denying permission shows the permission-denied state and **Try Again** is available.
- A missing or unavailable camera shows the camera-unavailable state and **Try Again** is available.
- Refreshing the page does not automatically start the camera or request permission.
- Verify the experience in desktop Chrome.

## MediaPipe hand tracking

- The local MediaPipe Hand Landmarker model loads successfully and the model status becomes **ready**.
- No active camera means no tracking inference runs.
- With no hands in view, diagnostics show zero hands and the no-hands state.
- With one hand in view, diagnostics show one hand with handedness and confidence.
- With two hands in view, diagnostics show two hands with handedness and confidence.
- Moving a hand left and right moves the mirrored skeleton left and right with the selfie preview.
- Moving a hand up and down moves the skeleton up and down with the preview.
- Check alignment at all four visible camera corners: top-left, top-right, bottom-left, and bottom-right.
- Resize the Chrome window and confirm the video and canvas overlay remain aligned with correct letterboxing.
- Confirm the preview and skeleton are mirrored together exactly once.
- Confirm the diagnostics panel shows a realistic inference FPS, video dimensions, canvas dimensions, and model status.
- Stopping the camera stops tracking and clears hand results.
- Refreshing the page keeps the camera stopped; starting it again restores tracking after the model is ready.
- Microphone permission is never requested.
- Verify in desktop Chrome with no console errors.

## Camera lifecycle repair

- After **Start Camera**, the Mac camera LED remains on and the webcam preview becomes visible.
- Model loading does not stop the camera stream.
- The transition from model loading to model ready does not stop the camera stream.
- **Start Camera** starts one stream; **Stop Camera** stops it and turns off the camera indicator.
- Repeated start attempts while permission is pending or the camera is active do not create a second request or stream.
- Refreshing the page leaves the camera stopped until the user selects **Start Camera** again.
- Test the development build with React StrictMode enabled and confirm the final user-started stream remains live.
- Test the production preview build and confirm the preview also appears there.
- In the Chrome console, review `[HandChord camera]` diagnostics for request, stream, metadata, playback, track, generation, and explicit-stop events. There should be no red errors.
- Microphone permission is never requested.
