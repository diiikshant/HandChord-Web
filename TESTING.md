# Testing Checklist

- Dependencies install successfully.
- Development server starts.
- The HandChord start screen opens in Chrome on a desktop or laptop.
- Production build succeeds.
- Browser console has no errors.
- Camera permission is not requested when the page loads.
- **Start Camera** requests video permission only.
- Microphone permission is never requested.

## Finger-state recognition

- Test a fist and confirm raw count 0 and stable gesture **fist**.
- Test a closed fist whose thumb rests across the curled fingers. The thumb should be **folded**, not **unclear**, and the stable result should be **fist** after its confirmation time.
- Test index only, index + middle, index + middle + ring, four long fingers with folded thumb, and open palm for counts 1 through 5.
- Confirm the four-finger pose does not count the folded thumb, while an open palm counts all five fingers.
- For an open palm, spread the thumb comfortably to the side even if it is slightly bent; it should still report raw count 5 and **open palm**, not four.
- Test both anatomical left and anatomical right hands; identity should remain based on handedness even if hands cross on screen.
- Test slight hand rotation and natural hand movement; states should remain useful rather than depending on screen Y position alone.
- Cover a fingertip or lower its landmark confidence where possible; the relevant finger should become **unclear** with a specific reason rather than guessed.
- Confirm normal Chrome tracking does not report every finger as **unclear** because of an unreported zero visibility value.
- Show thumb + index and confirm raw count 2 with **unsupported finger pattern**, not fist or canonical two.
- Briefly move a hand out of frame and back. The previous stable gesture should remain for about 500 ms, then become **hand temporarily missing** if it stays absent.
- Open **Gesture Diagnostics** and complete fist, one, two, three, four, and open palm. Each expected pose must remain stable for one second before passing.
- Verify in desktop Chrome with no console errors.
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

## Standalone chord-audio test

- Refresh the page and confirm there is no audio before selecting **Enable Audio**.
- Select **Enable Audio**. Confirm the status becomes **ready** and the AudioContext state is `running`; no microphone permission is requested.
- Select **Play Test Tone (A4)** and confirm a short 440 Hz tone plays.
- In C Major, test I, ii, iii, IV, V, and vi. Confirm the readout shows C major, D minor, E minor, F major, G major, and A minor with their displayed note names and MIDI values.
- Switch to A Natural Minor. Confirm i, ii°, III, iv, v, and VI show A minor, B diminished, C major, D minor, E minor, and F major.
- Change root keys and scales while a chord sustains. The previous chord should release smoothly and the readout should reset until another button is selected.
- Move the Master volume slider. Confirm it changes loudness without clicks, clipping, or stuck notes.
- Select one chord, then another. Confirm the transition is smooth. Select the same chord repeatedly and confirm volume does not build up.
- Select **Stop** and confirm the chord releases smoothly. Check that no sound continues afterward.
- Switch to another browser tab while a chord is playing. Confirm it releases safely. Return and use **Resume Audio** if Chrome shows the audio state as suspended.
- Refresh after using audio. Confirm a new explicit **Enable Audio** action is required.
- Test through desktop speakers and headphones. Confirm no clicking, clipping, red console errors, or unexpected audio output.
