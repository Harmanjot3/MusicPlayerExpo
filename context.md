# MusicPlayerExpo Project Context

## Goal and origin

This is an early iOS-focused rebuild/prototype of the Android music player `com.tamalbasak.musicplayer` version `1.7.01`. The feature requirements were informed by a reverse-engineering analysis (REA) attachment supplied in the conversation and by the existing Android project/source material. The working Expo project is `/home/harman/MusicPlayerExpo`; the related source folder is `/home/harman/MusicPlayer`.

The intended product is a local music player with a library, now-playing screen, equalizer/sound controls, and system playback controls. The current repository is a React Native/Expo prototype, not a finished native iOS application or a complete port of the Android implementation.

## Stack and project setup

- Expo SDK `~58.0.14`, React Native `0.88.0`, React `19.3.0`, TypeScript strict mode.
- React Native Audio API (`react-native-audio-api`) handles main track playback through a native audio graph, including filters, pan, room effect, and playback notification controls.
- Expo Audio (`expo-audio`) remains in use for the optional looping ambience file player and background playback configuration.
- Expo Document Picker and File System handle importing audio from the iOS Files provider and persisting imported copies in the app's documents directory.
- Zustand stores player and sound-control UI state.
- UI uses Expo Linear Gradient, Blur, Status Bar, vector icons, SVG, gesture handler, and safe-area context.
- Entry point: `index.ts` registers `App.tsx`.
- Start development server: `npx expo start`.
- Type check: `npx tsc --noEmit`.
- Expo config inspection: `npx expo config --type public`.
- Follow `AGENTS.md` for Expo versioned documentation requirements before changing Expo/React Native APIs. The generated, Git-ignored `ios/` project comes from Expo prebuild; configure native behavior in `app.json` and plugins rather than editing generated files directly.

## Current structure and ownership

- `App.tsx`: mounts the library and controls player/EQ page-sheet modals.
- `src/screens/LibraryScreen.tsx`: loads saved tracks, filters/searches, imports files, starts playback, and shows the mini-player.
- `src/screens/PlayerScreen.tsx`: now-playing controls and track progress.
- `src/screens/EQScreen.tsx`: equalizer, sound options, ambience, and sleep timer controls.
- `src/engine/AudioEngine.ts`: singleton transport/playback engine, playlist state, lock-screen metadata, background playback, ambient player, repeat/shuffle and sleep timer.
- `src/engine/AudioGraphController.ts`: owns the persistent audio context, seven peaking filters, stereo panner, master gain, and stereo room convolution effect; connects each loaded audio file element into the graph.
- `src/engine/AudioPlaybackHost.tsx`: app-level audio element host, load/error/end callbacks, and progress bridge so the source stays mounted across screen changes.
- `src/engine/DSPManager.ts`: JS biquad EQ coefficient/sample-processing helpers and preset definitions.
- `src/store/playerStore.ts`: Zustand store and bridge between screens and `AudioEngine`.
- `src/store/playerPreferences.ts`: validation and atomic persistence for volume, repeat/shuffle, EQ bands/preset, pan, and surround settings.
- `src/LocalMusicLibrary.ts`: Files picker import and app-private persistent library index/files.
- `src/theme/colors.ts`: shared palette.
- `app.json`: Expo app identity and Expo Audio native plugin configuration.

## Implemented behavior

- Pick one or more `audio/*` files with iOS's system document picker; cancel is treated as no change.
- Copy picked files into the app's `Documents/Music` folder and persist track metadata in `music-library.json`.
- On load, validate saved index shape and exclude entries whose referenced file is missing. Invalid index data produces an error instead of silently replacing it.
- Search tracks by title, artist, and album; tap a row to start a playlist from the filtered result.
- Play/pause, next/previous, seek, volume, repeat-one/repeat-all, and shuffle.
- Background playback is enabled in the native config. The audio graph uses PlaybackNotificationManager for lock-screen/system controls and track metadata.
- Optional ambient looping player and volume control.
- Sleep timer uses a deadline, clears on expiry, and updates UI state.
- EQ presets update seven live peaking filters in the native audio graph. The DSP helper also computes biquad coefficients and has an independent stereo sample-processing implementation for future parity work.
- Main file playback is routed through a native graph. Seven EQ gains, stereo panning, master volume, and a stereo room/spatial effect update the graph in real time. The spatial effect combines asymmetric early reflections with a low-level diffuse room tail under the direct signal. Its slider updates during touch-drag. The result is a speaker-style stereo space/depth approximation, not binaural HRTF rendering, and has not been matched against the Android DSP implementation.
- Lock-screen/system notification play, pause, next, previous, skip, seek, and stop events are connected to engine commands. Progress metadata updates about once per second.
- Player preferences are loaded at app startup and saved atomically after changes with a short debounce.

## Known incomplete areas and limitations

- **Native audio path has source-level integration only.** The native graph is now wired in app code but still needs an iOS development build and device validation for actual file playback, background continuity, lock-screen artwork/commands, route changes, and audio interruptions. React Native Audio API docs/issues report that iOS 26 can reject `allowBluetoothA2DP`/`allowAirPlay` flags for the `playback` category; this project omits those redundant options so default iOS routing is used.
- The surround effect is a procedural stereo room impulse approximation, not verified to match the Android app's 3D surround DSP. It is not headphone-personalized binaural HRTF processing.
- This prototype does not establish parity with the Android app's native audio engine, DSP behavior, full metadata handling, artwork, or every Android feature. The Android reverse-engineering report is evidence/reference, not proof of iOS behavior.
- Library metadata is currently inferred from the filename (`artist - title`); album is `Unknown Album`, duration is learned from playback and persisted. Embedded tags/artwork are not parsed.
- Android's ambient thread/input behavior is not replicated: the current ambience feature loops an imported audio file. Microphone capture and its permission/UX are not implemented.
- Paywall/registration, StoreKit 2 products, Firebase services, WidgetKit, and Android tester-registration flows are not implemented. Product IDs, Firebase configuration, and the exact runtime behavior are not present in the supplied static report.
- Library imports are app-private copies; this is not a full scan of Apple Music or the device media library.
- No simulator/device runtime playback, native iOS build, App Store packaging, or real-device verification has been recorded. Expo config/type checks do not establish those. The generated bundle identifier `com.anonymous.MusicPlayerExpo` is only a placeholder and must be replaced with the owner's chosen identifier before distribution.
- The app has been configured in `app.json` to enable background playback and disable background recording/microphone permission.

## Current validation and working-tree note

The latest source checks succeeded:

- `npx tsc --noEmit`
- `npx expo lint`
- GitHub Actions iOS Simulator workflow YAML parses successfully; the workflow itself has not run because this checkout has no GitHub remote.
- The audio-graph update uses the installed React Native Audio API `AudioContext`/`ConvolverNode` graph; Expo SDK 58 docs recommend React Native Audio API for real-time effects and filters.
- `git diff --check`
- `npx expo config --type public`
- `npx expo export --platform ios --output-dir /tmp/musicplayer-ios-export` (Metro produced an iOS JS bundle with the native audio package included)
- `npx expo prebuild --platform ios --no-install` (generated an ignored iOS project; generated `Info.plist` contains the `audio` background mode and no microphone usage string)

No test suite, iOS simulator, native Xcode build, or device playback was run. The working tree has modifications to `App.tsx`, `app.json`, `package.json`, and `package-lock.json`, plus untracked `context.md`, `eslint.config.js`, and `src/`. The generated `ios/` project is ignored by Git. Preserve the tracked/untracked app changes; they are the in-progress implementation and should not be reset or overwritten without review.

The latest changes added `react-native-audio-api` (`^0.13.6`) with its Expo plugin, wired it into main playback, corrected stereo DSP state, added player preference persistence, persisted durations learned at playback, and replaced the sparse room impulse with a stereo early-reflection/diffuse-tail response. The effects UI now explains the room-simulation limit and supports continuous slider dragging. A manual GitHub Actions workflow at `.github/workflows/ios-simulator.yml` now generates the iOS project on a GitHub macOS runner, installs pods, builds a Release simulator app, boots an available iPhone simulator, launches the app, checks that its process remains alive, and uploads the screenshot plus simulator app archive. The checkout has no GitHub remote, so the workflow has not run. Expo public config, TypeScript, lint, whitespace, and workflow YAML parsing have succeeded locally. The workflow needs this project pushed to a GitHub repository and a manual Actions run; macOS runner minutes count against the GitHub Actions allowance and are billed at the macOS rate for private repositories. The native module requires a native build; Expo Go is not sufficient to verify its audio graph or lock-screen behavior.

## Suggested next work

1. Push the project to a GitHub repository, run the manual `Build and launch iOS Simulator` workflow, inspect its screenshot and app artifact, and fix any native build/launch failures. Then validate audio audibility and routing on an iPhone or simulator with audio output. Tune or replace the procedural spatial response after listening tests and comparison with Android behavior; binaural HRTF remains a separate capability.
2. Improve metadata extraction and artwork through an iOS-compatible approach.
3. Reconstruct ambient microphone processing, StoreKit paywall, Firebase services, and WidgetKit after gathering the missing behavior/product/backend details.
4. Compare feature-by-feature against the Android reference and record which behavior is implemented, approximated, or still unknown.
