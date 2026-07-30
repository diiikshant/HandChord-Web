# Product Spec

HandChord is a desktop-first gesture-controlled musical sandbox. Users will select chords with two-hand finger gestures.

- Left-hand vertical movement controls reverb.
- Left-hand horizontal movement controls distortion.
- Right-hand vertical movement controls tape delay.
- Right-hand horizontal movement controls chorus.
- Built-in sounds and local personal samples are available; microphone recording, composition looping, and arrangement remain future work.
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
- Finger recognition remains separate from the audio engine and movement effects. This milestone adds a dedicated controller bridge that consumes only already-stable canonical gestures; raw counts and per-frame landmarks never trigger audio directly.

## Standalone chord-audio test

- Audio requires explicit user activation through **Enable Audio**. The app creates or resumes its AudioContext only after that action; no sound is created on page load.
- The Audio Test supports all 12 chromatic root keys and Major or Natural Minor scales. Scales and diatonic triads are generated algorithmically from their interval patterns.
- The first six degrees are available as buttons. In C major they are C major, D minor, E minor, F major, G major, and A minor. In A natural minor they are A minor, B diminished, C major, D minor, E minor, and F major.
- The built-in synth is a warm polyphonic browser instrument: a triangle oscillator plus a quieter, slightly detuned sine oscillator for every note. It supports at least six simultaneous notes.
- Selecting a chord sustains it. Selecting another chord releases the old chord smoothly before starting the new one. Selecting the same chord again does not stack duplicate notes. **Stop**, key/scale changes, page backgrounding, and leaving the Audio Test release active notes safely.
- Audio runs through polyphonic voice gain envelopes, a conservative master gain, a DynamicsCompressorNode, and then the browser audio destination. Oscillators never connect directly to speakers without a gain envelope, and released nodes are stopped and disconnected.
- The Audio Test remains available for button-only debugging alongside gesture control. Its buttons share the single AudioContext but can be used independently of the camera.

## Built-in instruments

- HandChord includes five built-in instruments: **Warm Pad**, **Soft Keys**, **Pluck**, **Organ**, and **Deep Bass**. **Warm Pad** is the default when no valid saved selection exists.
- Each instrument is a reusable data definition with oscillator layers, ADSR envelope, low-pass filter, detune, octave offset, and per-voice gain compensation. The definitions are separate from React components and are read by the shared PolySynth only when new voices are created.
- Warm Pad uses a gently detuned triangle/saw blend with a soft attack and long release. Soft Keys uses smooth sine/triangle layers with a faster attack. Pluck is bright with a short auto-releasing envelope. Organ uses stable sine, triangle, and saw harmonics with near-full sustain. Deep Bass uses lower sine/triangle layers, a one-octave-lower voicing, and a low-pass filter to control low-frequency energy.
- Selecting an instrument in either the camera performance experience or Audio Test releases the active chord smoothly, applies the selected preset to future voices, and leaves key, scale, manual master volume, calibration, hand tracking, and effect settings unchanged. It does not create a second AudioContext or duplicate effect graph.
- The selected instrument is persisted locally in browser storage and restored after refresh. Invalid saved data safely falls back to Warm Pad.
- Every instrument uses the existing effect chain: distortion, chorus, tape delay, reverb, fixed 100% performance gain, manual master gain, and compressor. Gain compensation and the compressor prevent extreme loudness changes, while manual master volume remains the user safety limit.
- Instrument octave offsets change only playable register, never the chosen chord function: Deep Bass is one octave lower; the other initial presets use the normal register. Built-in instruments share the common sound-source architecture with personal samples, while microphone recording remains future work.

## Personal sounds

- Users can import a short personal audio file locally through the browser file picker. Browser-decodable WAV, MP3, M4A/AAC, and OGG files are supported up to 12 MB and 10 seconds. Files are decoded through the existing AudioContext and are never uploaded to a server.
- Users can also select **Record Sound** to make a personal sound through the microphone. The app explains the local-only capture flow first and requests audio-only microphone permission only after **Start Recording**; it never requests video for recording or requests the camera again. A 3/2/1 countdown can be cancelled, recording can be stopped early, and capture stops automatically at 10 seconds.
- The recorder feature-detects a browser-supported MediaRecorder format, preferring Opus WebM when available. The recording is decoded through the existing AudioContext, then opens in the same sample editor as an imported sound. Recorded sounds support Instrument mode, One-shot mode, root notes, optional Loop Sample, envelopes, existing transposition limits, and every existing gesture-controlled effect.
- Microphone recording is local-only and persists through the same IndexedDB personal-sound storage. Recorded metadata includes source type, original MIME type, and recording duration as well as the existing trim, fade, normalisation, reverse, mode, root-note, loop, and timestamp data. Recording never creates a separate playback/effects engine, resets calibration/key/scale, or uploads data.
- Leading/trailing low-amplitude silence is suggested as an editable trim after recording. The middle of a recording is never automatically removed. Nearly silent recordings produce a warning and do not default to normalisation. Automatic pitch detection remains out of scope.
- The microphone stream has separate lifecycle ownership from the camera stream. Completing, cancelling, failing, page-hiding, or unmounting a recording stops only microphone tracks and analysis nodes; camera tracking and its permission state remain independent.
- The lightweight sample editor shows file name, duration, downsampled waveform, trim start/end, preview/stop, fade-in/out, normalisation, reverse, mode, manual root note, loop setting, Save, and Cancel. Trim settings are saved as metadata with the original local audio rather than destructively rewriting it; at least 80 ms must remain.
- **Play as Instrument** creates a new one-use sample source for each chord voice, pitch-shifts it from the manually assigned root note, and applies an envelope. Its **Loop Sample** setting defaults to off. When enabled, every pitched voice repeats the selected trimmed region while its chord remains active; chord changes, Stop, Gesture Audio off, source/instrument changes, page backgrounding, and disposal smoothly release the loop. **Trigger as One-shot** always triggers one trimmed, unlooped sample at original pitch for each chord action, suited to percussion, speech, impacts, and effects.
- Instrument playback rate is `2^(semitones / 12)`, clamped from 0.5× to 2×. Notes far from the root select a closer octave first where possible. Automatic pitch detection and advanced loop-point editing are out of scope.
- Fades default to 15 ms to avoid clicks. Looping needs a trimmed region of at least 120 ms. Its loop start/end are the trim start/end, and a 30 ms processed edge fade (clamped to at most 50 ms or one quarter of the loop) reduces clicks. A subtle boundary dip can remain; separate loop-point and seamless-crossfade editing are out of scope. Peak normalisation targets 0.85 amplitude with at most 4× gain and skips near-silent files. Reverse and all processing remain local.
- Saved personal sounds include ID, name, source type, mode, original file name, root MIDI note, trim range, fades, normalisation gain, reverse, loop enabled/start/end/edge fade settings, and timestamps. Users can preview, select, rename, edit, duplicate, and delete them. Deleting the active personal sound falls back to Warm Pad.
- Personal sounds use IndexedDB, not localStorage, for original audio bytes and metadata. They survive refresh and browser restart; invalid or missing records are handled safely, and older records with the original loop flag are normalised safely. localStorage remains only for small preferences.
- Built-in and personal sounds share one sound-source architecture and the same signal path: sound source → distortion → chorus → tape delay → reverb → fixed performance gain → manual master gain → compressor → audio destination. Selecting a source does not reset calibration, key, scale, effects, tracking, or chord mapping.

## Stable two-hand gesture chord control

- The anatomical left hand selects chord position: stable one, two, three, four, and open palm select positions 1 through 5. The anatomical right hand selects the bank: stable open palm selects the primary bank and stable index-only selects the secondary bank. Other right-hand gestures are unsupported for chord selection.
- In Major mode, primary positions 1–5 map to I, ii, iii, IV, and V. Secondary positions 1–5 map to vi, vii diminished, ♭VII major, iv minor, and the secondary dominant V/vi. The music engine generates each chord from the selected root and scale rather than React storing note arrays.
- In Natural Minor mode, the primary bank maps to i, ii diminished, III, iv, and v. The secondary bank uses musically valid equivalents: VI, VII, ♭VII, iv, and V/VI. The same algorithmic music engine generates their notes.
- Each individual finger gesture must first become stable through finger recognition. A complete left/right combination then remains unchanged for 100 ms before it changes a chord, avoiding an unnecessary second long delay. The confirmed combination latches: it does not retrigger the same chord every tracking frame.
- Both anatomical hands showing stable fists for 500 ms stops the current gesture-controlled chord. One fist alone does not stop playback. If both hands are missing for 850 ms, the gesture-controlled chord begins its safe smooth release. Brief unclear tracking retains the last stable role for 650 ms and the current chord for up to 900 ms.
- The live camera panel has a Gesture Audio toggle. Turning it off releases a gesture-controlled chord cleanly but leaves camera tracking and the button-based Audio Test working.
- Gesture control remains separate from movement-controlled effects, calibration, sampling, looping, recording, and composition features.

## Four-axis movement calibration diagnostics

- The final control model is: anatomical left vertical = reverb, anatomical left horizontal = distortion, anatomical right vertical = tape delay, and anatomical right horizontal = inward/leftward chorus. Finger gestures continue to select chords; movement values never retrigger them.
- Palm position is the average of wrist, index MCP, middle MCP, ring MCP, and little MCP. Anatomical handedness owns the controls; screen location never permanently assigns a hand role.
- Mirroring is applied once to movement coordinates. In the visible selfie preview, moving left lowers horizontal value, moving right raises it, moving down lowers vertical value, and moving up raises it.
- One shared calibration profile contains four independent ranges: `leftVertical`, `leftHorizontal`, `rightVertical`, and `rightHorizontal`. Each range has minimum, maximum, validity, and update time. Updating, clearing, or recalibrating one range preserves the other three.
- Guided calibration captures lower, upper, visual-left, and visual-right positions for each intended anatomical hand. It samples for about 700 ms and stores a median only when the required hand is present, resolved, confident, and has a sufficiently wide range.
- Calibration is persisted locally in browser localStorage. Missing or invalid saved data is ignored safely; Reset All clears all four ranges.
- A calibrated axis maps lower/left to 0, upper/right to 1, and midpoint to approximately 0.5, clamping outside values. Values use a 5% dead zone and exponential smoothing. Losing one hand retains its last safe value for 500 ms without disabling the other hand.
- Movement never retriggers chords, changes finger gestures, or changes the audio graph during this milestone.

## Left-hand vertical reverb control

- Anatomical left-hand vertical movement controls reverb only. Lower calibrated position is nearly dry; upper calibrated position becomes wide and ambient. It remains independent of the other three connected axes.
- The response is curved: the normalised leftVertical value is squared and maps from 0% to 95% wet. This leaves the lower range controllable while making the upper range substantially more ambient.
- The native Web Audio graph is: polyphonic synth → dry path and reverb send → locally generated stereo ConvolverNode → wet gain → existing master gain → DynamicsCompressorNode → audio destination. The reverb graph is built once in the existing AudioContext.
- The generated local impulse response has an approximately 6-second decay with channel variation for stereo width. Wet and dry gain changes use smooth targets that settle in roughly 300 ms, avoiding per-frame jumps and loudness surges.
- Reverb Control requires a valid leftVertical calibration. If missing or disabled, it safely uses 10% wet and displays **Reverb calibration required** when applicable. Temporary left-hand loss preserves the last safe reverb setting and never stops chord playback.
- Reverb movement does not retrigger chords, change chord latching, alter finger recognition, or affect the primary/secondary banks or both-fist stop.

## Right-hand vertical tape delay

- Anatomical right-hand vertical movement controls tape delay. The calibrated lower position is dry or minimal; moving visually upward increases the delay; the calibrated upper position is strongest. Delay movement never changes volume, chords, finger recognition, chord banks, or chorus.
- `rightVertical` uses a weighted squared response. It maps from 100 ms to 700 ms, 0% to 65% wet mix, and 0% to 55% feedback. The midpoint is approximately 280 ms, 20% wet, and 21% feedback. Feedback is always below 1.0.
- The tape-delay graph is native Web Audio: dry signal plus `DelayNode → 3.5 kHz low-pass filter → feedback gain`, mixed before reverb. Filtered repeats become darker than the dry chord. It uses no feedback modulation in this initial version and builds the delay nodes only once in the existing AudioContext.
- Wet/dry changes settle in about 210 ms, feedback in about 300 ms, and delay time in about 360 ms through AudioParam automation. Missing or disabled calibration uses 0% wet and feedback. Temporary right-hand loss retains the last safe setting and never stops the chord.
- The rightVertical calibration range is now labelled **Tape Delay**. Existing valid calibration is retained; recalibrating it updates only that axis.
- Internal performance gain is fixed at 100%, so hand movement never changes HandChord’s volume. The manual master-volume slider remains available as the user’s overall safety control and now defaults to 100%, with the compressor providing output protection.

## Left-hand horizontal distortion

- Anatomical left-hand horizontal movement controls the internal distortion amount using the calibrated, mirrored user-visible coordinate. Visual-left is clean (0% wet); moving visually right increases the effect up to 70% wet. No second coordinate mirror is applied in the audio path.
- The response is curved: `leftHorizontal² × 0.70`. This makes the midpoint about 17.5% wet and leaves most of the physical movement range useful for controlled drive rather than reaching harsh distortion too quickly.
- The native audio graph is: polyphonic synth → parallel dry and WaveShaperNode distortion paths → reverb dry/wet routing → performance gain → manual master gain → DynamicsCompressorNode → browser audio destination. The distortion graph is built once inside the existing AudioContext, uses 2× oversampling, and is never recreated for tracking updates.
- Distortion wet/dry gains use smooth AudioParam targets that settle in about 195 ms. A small compensation keeps the clean path at no less than 82.5% and limits the wet path to 80% of its requested mix before the compressor, reducing loudness surges and clipping risk.
- Distortion Control requires leftHorizontal calibration. If it is missing or the control is off, the app uses a clean 0% distortion and keeps chords, reverb, tape delay, and chorus active. Temporary left-hand loss retains the last safe value and never stops or retriggers the chord.
- Distortion movement never retriggers chords or changes finger recognition, and remains independent from the other three axes.

## Right-hand horizontal chorus width

- Anatomical right-hand horizontal movement controls chorus width using the calibrated, user-visible mirrored coordinate. Visual-right/outward means nearly dry at 0% wet; moving visually left or inward increases the effect to a wide 80% wet mix at the calibrated visual-left position. The audio layer does not mirror the camera coordinate again.
- The response is `(1 − rightHorizontal)² × 0.80`, giving about 20% wetness at midpoint. The inward direction is more comfortable and keeps the right hand visible nearer the centre of the body. The displayed chorus percentage always represents this reversed mapping, while the hand-position diagnostic remains unchanged.
- Chorus is a lightweight feedback-free native Web Audio stage: a clean path runs alongside left and right modulated delays, then joins through a stereo merger before reverb. Its base delay is 18 ms, depth is 2.5 ms, and independent sine LFO rates are 0.25 Hz left and 0.33 Hz right, avoiding extreme pitch wobble and metallic feedback.
- The final graph is: polyphonic synth → distortion → chorus → tape delay → reverb → fixed performance gain (100%) → manual master gain → DynamicsCompressorNode → browser audio destination. The graph, delay nodes, and modulation oscillators are built once in the existing AudioContext; movement only automates effect parameters.
- Chorus Control requires rightHorizontal calibration. If it is missing or the control is off, the app safely uses 0% chorus. Temporary right-hand loss retains the last safe setting and never stops or retriggers the current chord; reverb, distortion, and volume remain active.
## Sampled chord timing

- All notes in a Play as Instrument sampled chord start together, begin release together, and become silent together.
- For a non-looping sample, HandChord calculates each note's natural duration from the trimmed playable duration and its final clamped playback rate, then uses the shortest of those durations for the complete chord.
- A looping sampled chord sustains while held, then every looping member receives the same release and stop timing when the chord changes or stops.
- One-shot sounds remain single original-pitch triggers and do not use sampled-chord timing.
- Independent pitch-and-time stretching is out of scope; a lower pitched non-looping note may be intentionally shortened to match the shortest higher note.
