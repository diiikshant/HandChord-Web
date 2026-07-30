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
