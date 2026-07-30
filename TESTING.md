# Testing Checklist

- Dependencies install successfully.
- Development server starts.
- The HandChord start screen opens in Chrome on a desktop or laptop.
- Production build succeeds.
- Browser console has no errors.
- Camera permission is not requested when the page loads.
- **Start Camera** requests video permission only.
- Microphone permission is never requested.

## Desktop development layout

- At a common laptop width (at least 1040 px), confirm the live camera preview and Gesture Audio status remain visible in the left column while you scroll the **Controls & diagnostics** panel on the right.
- Open and close **Movement & calibration**, **Four movement effects**, **Sounds & Audio Test**, and **Tracking & finger diagnostics**. Confirm each group reveals the same controls and no camera, tracking, or audio state is reset.
- Resize below the desktop breakpoint. Confirm the view safely becomes a single-column layout, with all controls still reachable and no horizontal overflow.
- While the camera is active, scroll, expand, and collapse development groups. Confirm the camera LED and preview remain active, hand tracking continues, and Chrome shows no console errors.

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

## Built-in instrument selection

- Confirm **Warm Pad** is selected by default and is shown in both the camera performance selector and the Audio Test selector.
- Select Soft Keys, Pluck, Organ, and Deep Bass. Confirm each shows its name, description, waveform/envelope debug details, octave offset, gain compensation, and active voice count.
- Start a button-controlled chord, then switch instruments. Confirm the old chord releases smoothly without stuck notes, and the next chord uses the new sound.
- Repeat the switching check while Gesture Audio owns a chord. Confirm the chord is released safely, tracking and calibration remain active, and a later chord uses the selected preset.
- Test each instrument with reverb, distortion, inward/leftward chorus, and tape delay. Confirm all effects remain active and no selector change resets their controls.
- Verify Deep Bass plays a lower register without excessive low-frequency clipping. Verify Pluck decays and releases on its own without a stuck sustained note.
- Move the manual master-volume slider with every instrument. Confirm it remains the only output-level control, transitions do not cause extreme loudness jumps, and the fixed performance gain remains 100%.
- Refresh the page after choosing an instrument. Confirm the selection returns. Set an invalid saved instrument value through browser storage only if comfortable, refresh, and confirm Warm Pad is restored safely.
- Test speakers and headphones. Confirm no clipping, microphone request, red Chrome console errors, or duplicate/stuck voices.

## Personal audio import and sample instruments

- Enable Audio, select **Add Personal Sound**, then import a short WAV file. Repeat with MP3 and any browser-supported M4A/AAC or OGG file.
- Try an unsupported file, an empty file, a file over 12 MB, and audio longer than 10 seconds. Confirm a clear error appears and no sound is saved.
- In the editor, test waveform display, preview/stop, trim start/end, 15 ms fades, normalisation, reverse, root note selection, and Save/Cancel. Confirm preview and saved playback use only the selected trim region.
- Save an Instrument-mode sound with Loop Sample on. Test button-controlled and gesture-controlled chords; confirm individual chord notes pitch-shift from the selected root note, loop only inside the trim range, release on Stop/chord change/source change, and never leave stuck voices.
- Save a One-shot sound. Repeat the same chord action several times; confirm it triggers at original pitch without looping or reusing an old source node.
- Test every personal sound with reverb, distortion, tape delay, inward chorus, and manual master volume. Confirm all four movement controls and calibration remain unchanged.
- Select a built-in instrument, then a personal sound, then a built-in sound again. Confirm each release is clean and the effect graph/tracking remain live.
- Test Rename, Edit, Duplicate, Delete, and deletion of the active sound. Confirm active deletion returns to Warm Pad and removes local stored audio data.
- Refresh and restart Chrome. Confirm saved sounds remain. Temporarily simulate missing saved audio data only if comfortable; confirm the app gives a recovery message rather than crashing.
- Confirm the browser makes no network upload, no microphone request, and no red console errors. Test speakers and headphones for clipping and pitch-shifting quality.

## Instrument sample looping

- Import or edit an Instrument-mode personal sound. Confirm **Loop Sample** is off by default, the sample plays once from trim start to trim end, and an audio file that ends while a chord is held becomes silent.
- Enable **Loop Sample**. Confirm the editor says the trimmed region repeats while the chord is playing, shows the trim range and 30 ms debug edge fade, and refuses a trimmed loop shorter than 120 ms.
- Test a short sustained sample, a long sample, a trimmed sample, and a reversed sample. Confirm every pitched chord voice repeats only its selected trim region and retains root-note pitch shifting.
- Change chords while looping, then use Stop, both-fist stop, Gesture Audio off, built-in instrument selection, personal-sound selection, and a browser-tab switch. Confirm every old loop fades out and no loop continues afterward.
- Switch an enabled looping sound to One-shot mode. Confirm the loop control is hidden, the saved one-shot never loops, and it keeps original pitch.
- Edit and reopen a saved looping sound, refresh the page, restart Chrome, duplicate the sound, and delete it. Confirm valid loop settings persist, duplicates retain them, older saved sounds remain usable, and deleting an active sound stops it safely.
- Leave a looping chord active for several minutes while observing Chrome. Confirm voice count does not increase, CPU/memory do not keep climbing, all four movement effects still work, and Chrome has no console errors.

## Stable two-hand gesture chord control

- Enable Audio first, then enable the **Gesture Audio** toggle in the live camera panel.
- Hold right open palm with left one, two, three, four, and open palm. After finger recognition becomes stable plus about 100 ms, confirm the primary-bank chords I, ii, iii, IV, and V play in the selected Major key.
- Hold right index-only with left one, two, three, four, and open palm. Confirm the secondary-bank chords vi, vii diminished, ♭VII major, iv minor, and V/vi play in Major mode.
- Switch to Natural Minor and repeat both banks. Confirm the panel displays i, ii°, III, iv, v in the primary bank and VI, VII, ♭VII, iv, V/VI in the secondary bank.
- Hold the same valid two-hand combination. Confirm it does not repeatedly restart or grow louder.
- Change only one hand, then hold the new complete combination for about 100 ms after the new finger gesture is stable. Confirm the new chord transitions smoothly.
- Make both stable fists and hold for 500 ms. Confirm the panel shows **stopped** and the chord releases. Confirm one fist alone does not stop a chord.
- Briefly hide one hand or allow one unclear frame. Confirm the current chord remains while the panel says tracking is temporarily lost. Hide both hands for about one second and confirm the chord begins its smooth release.
- Use an unsupported right-hand gesture such as two fingers. Confirm the panel says **unsupported** and does not play a random chord.
- Cross the hands in the camera view. Confirm anatomical left still chooses the position and anatomical right still chooses the bank.
- Turn Gesture Audio off while it is playing. Confirm its chord releases, camera tracking continues, and the Audio Test buttons still play their chords.
- Confirm there are no stuck notes, clicks, clipping, microphone requests, or red Chrome console errors.

## Four-axis movement calibration diagnostics

- Complete all eight guided steps: left lower/upper/visual-left/visual-right, then right lower/upper/visual-left/visual-right. Hold each requested position still until capture completes.
- After each completed axis, inspect the calibration summary. Confirm only that named range becomes Ready and previously calibrated ranges remain Ready.
- Test left-hand vertical and horizontal separately. Confirm left/down approaches 0, right/up approaches 1 in the matching diagnostic values.
- Test right-hand vertical and horizontal separately with the same mirrored visible-direction behaviour.
- Move both hands at once. Confirm both meters continue updating independently.
- Use each individual axis recalibration action, then each hand recalibration action, and finally Reset All. Confirm only the advertised ranges are cleared.
- Refresh the page and restart Chrome. Confirm valid calibration ranges remain available. Confirm malformed or missing browser storage does not crash the app.
- Hide one hand briefly, then longer than 500 ms. Its value should remain safe while the other hand continues; the panel should report retention, then temporary unavailability.
- Cross hands in view. Confirm anatomical roles remain associated with their own movement controls.
- While holding a gesture-controlled chord, move both hands. Confirm no chord retriggers or changes because of movement.
- Confirm the visible left/right and up/down direction matches the diagnostic values, and that Chrome has no console errors.

## Left-hand vertical reverb control

- Calibrate leftVertical, enable audio, then enable **Reverb Control**. At the lower position, confirm the chord is nearly dry.
- Move the left hand slowly to the midpoint. Confirm a moderate reverb amount and no sudden gain jump.
- Move to the upper calibrated position. Confirm a wide, long ambient reverb while the dry chord remains understandable.
- Move upward and downward slowly, then quickly. Confirm the wetness follows smoothly rather than stepping or clicking.
- Play both button-controlled and gesture-controlled chords. Confirm the same reverb control applies and movement never retriggers the chord.
- Stop a chord at a high setting. Confirm the reverb tail continues naturally without clipping or a large loudness surge.
- Briefly hide the left hand, then keep it hidden. Confirm the last reverb amount stays safe and the panel reports temporary unavailability without stopping audio.
- Turn Reverb Control off. Confirm it returns smoothly to its 10% default while chords and tracking continue.
- Refresh the page, test desktop speakers and headphones, and confirm no console errors.

## Right-hand vertical tape delay

- Confirm the Tape Delay panel shows a fixed **Performance gain: 100%** while moving either hand. Use the Audio Test manual master slider to change overall output volume; it must remain independent of all movement controls.
- Calibrate rightVertical through the renamed **Tape Delay** lower and upper steps, enable audio, and turn on **Tape Delay Control**. At the lower position, confirm chords are dry or nearly dry.
- Move the right hand to midpoint and upper position. Confirm about 280 ms / 20% wet / 21% feedback near midpoint and up to 700 ms / 65% wet / 55% feedback at the upper position.
- Move upward and downward slowly, then rapidly. Confirm delay changes smoothly without harsh clicks, clipping, runaway feedback, or excessive volume buildup. Let a chord stop at a high setting and confirm the long repeats fade safely.
- Keep Reverb and Chorus Control active. Confirm tape delay feeds naturally into reverb, chorus remains controlled only by inward/leftward right-horizontal movement, and neither effect changes the other.
- Test both button-controlled and gesture-controlled chords. Confirm right-hand vertical movement does not retrigger, change, or stop chords.
- Briefly hide the right hand, then keep it hidden. Confirm delay keeps its last safe setting and the panel reports unavailable without stopping audio.
- Turn Tape Delay Control off. Confirm wet mix and feedback smoothly return to 0% while the dry chord, reverb, distortion, chorus, and tracking continue.
- Refresh and confirm calibration persists. Recalibrate only Tape Delay and confirm the other three calibration ranges remain ready. Test speakers and headphones and confirm no Chrome console errors or microphone request.

## Right-hand horizontal chorus width

- Calibrate rightHorizontal, enable audio, and turn on **Chorus Control**. At the calibrated visual-right/outward position, confirm button-controlled and gesture-controlled chords are nearly dry.
- Move the right hand leftward toward the body. Confirm the panel rises from 0% through about 20% at midpoint to a maximum of 80% wet at the calibrated visual-left position, with gentle widening in the middle and a wide, lush sustained chord at the left.
- Move slowly left-to-right and right-to-left, then rapidly. Confirm changes are smooth, free from clicks, excessive pitch wobble, metallic feedback, loudness surges, or clipping.
- Move the right hand diagonally while Tape Delay Control is active. Confirm upward vertical movement changes only tape delay while leftward horizontal movement increases only chorus. Then move all four axes together and confirm reverb, distortion, tape delay, and chorus remain independent.
- While a gesture chord plays, move the right hand horizontally. Confirm the chord neither restarts nor changes unless its stable finger gesture changes. Confirm the Audio Test buttons remain usable.
- Briefly hide the right hand, then keep it hidden longer than 500 ms. Confirm the last chorus value remains safe, the panel reports unavailable, and the chord plus the other three axes continue.
- Turn Chorus Control off. Confirm it smoothly returns to 0% wet while all other controls remain active. Refresh and confirm calibration persists. Test speakers and headphones, then confirm Chrome has no red console errors or microphone request.

## Left-hand horizontal distortion

- Calibrate leftHorizontal, enable audio, and turn on **Distortion Control**. At the calibrated visual-left position, confirm button-controlled and gesture-controlled chords stay clean.
- Move the left hand to the midpoint, then the calibrated visual-right position. Confirm the panel rises from about 0% through about 18% to a maximum of 70% wet, with a usable moderate drive rather than immediate harshness.
- Move slowly left to right and right to left, then move rapidly. Confirm distortion changes smoothly with no clicks, stuck notes, major loudness surge, or clipping.
- Move the left hand diagonally while Reverb Control is active. Confirm vertical movement changes reverb and horizontal movement changes distortion independently, without changing the active chord unless the finger gesture changes.
- Briefly hide the left hand, then keep it hidden longer than 500 ms. Confirm the last distortion amount stays safe, the panel reports unavailable, right-hand tape delay continues normally, and the chord continues.
- Turn Distortion Control off while a chord is playing. Confirm it returns smoothly to clean 0% wet while reverb, tape delay, chorus, tracking, and the chord continue.
- Refresh and confirm saved calibration remains available. Test speakers and headphones for clipping or loudness surges, and confirm the Chrome console has no red errors or microphone request.
