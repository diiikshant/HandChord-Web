# Project Notes

- Current milestone: Desktop webcam preview
- Working: Webcam preview implemented; automated camera-state tests and the production build pass.
- Files and hooks added: `src/hooks/useCamera.ts`, `src/hooks/cameraState.ts`, and `src/hooks/cameraState.test.ts`.
- Supported states: camera not started, permission requested, camera active, permission denied, camera unavailable, and camera error.
- Known browser limitations: a camera must be available and permitted; camera access requires a secure page in production (or `localhost` during local development); the front-camera preference is only a preference and the browser may choose another camera.
- Physical browser testing: Still pending in Chrome.
- Next recommended task: Test the webcam preview in Chrome and confirm the permission, mirrored preview, and stop-camera behavior.
