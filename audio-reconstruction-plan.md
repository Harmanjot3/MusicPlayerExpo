# Android audio and app parity plan

Updated 2026-10-18. This is the working checklist for rebuilding `com.tamalbasak.musicplayer` v1.7.01 as an iOS app. Checked items mean the source or static evidence has been inspected; they do not mean the behavior has passed an iPhone listening test.

## Reference and evidence

- APK: `/home/harman/Downloads/com-tamalbasak-musicplayer-1701-28782223-27248d484f89ae0e4dc3e1b6cf05d720.apk`
- APK SHA-256: `57db4a2797448430184c70d5a20495e0896d4185b36672acd8b3a9f2deb4dc1f`
- Package/version: `com.tamalbasak.musicplayer`, `1.7.01` (version code `1701`).
- JADX MCP JAR: `/home/harman/.local/share/rea/android/jadx-headless-mcp-0.7.1-all.jar`
- JADX output: `/tmp/musicplayer-jadx-all` and `/tmp/musicplayer-v1701-decompiled`.
- REA APK Evidence: `ev_7614bc00f99b18bd7bae3008ce988492e512903c6291ff1d475117c3b6dc05a6`.
- REA Java DSP evidence: `DSPManager` `ev_9cc69546155a6bd47745ccb4b7af5e0776336f3811cd9d77844a9971bfc06a71`; reset method `ev_4c83eee9fd89ce26c8cdc0f6ba47996a25c6a1d33131f0732d237b32eb305710`.
- REA `libdsp.so` evidence: `ev_d34e6915bc73d8f0912302c6ccb42265249d1f25ba230f38028f059c532995bb` (x86_64 disassembly). Additional Ghidra pseudocode was produced read-only in `/tmp/musicplayer-ghidra-address-pseudocode.txt`; it is analysis output, not an REA Evidence record.
- REA class records include `Engine` `ev_9665f6f1f5bd5f77a960104869dc9499825325276b73535fae52be904fe9947c`, `PanelV3dSurround` `ev_f5600c9e8324e4763d8cdec14f3736a0c6cb7ab4a1db945982021625d454a277`, and `PanelSoundEffects` `ev_f0ea72a138d27f1b61bf5e6481e27001cadd0b80732045cc676ca72d97d275b8`.

The Java `DSPManager.processData` entry is native. Static inspection shows `Virtual3D::processData` maintains a sample FIFO for a millisecond delay; the engine calls it on the right high-frequency buffer for stereo playback. The `7.1` control enables a stereo `revmodel` Freeverb path, not eight physical output channels. In the native processing path the reverb return is combined with the original signal. A byte-for-byte output match is not established: the full filter-bank ordering, format conversions, state transitions, and output were not compared against a running Android device.

The native reverb reset sets room size `0.9`, damping `0.02`, and dry `0.001`. Freeverb maps room size to comb feedback `0.9 * 0.28 + 0.7 = 0.952`, and damping to `0.02 * 0.4 = 0.008`; the UI's Reverb Level is passed to `setwet`, whose internal wet scale is `3`. The stereo return is filtered by `BandPassFilter` at `1000 Hz`, `Q=0.25` before it is added back to the original high-frequency signal. The iOS reverb impulse response now uses those room/damping values and includes the native biquad on its wet return. It still applies its complete EQ chain before spatial processing, while Android separates low/high buffers and applies part of the EQ after reverb; that ordering is an explicit parity gap.

## User-reported device behavior

These are reports from the installed IPA, not locally reproduced results:

- Disabling Surround 7.1 can silence the current song; enabling it again restores sound.
- A following track can load with no audible output after the previous track ends.
- Surround/reverb sounds compressed or distant; the current Virtual 3D effect is weaker than the Android app.
- The desired spatial control should behave as a channel delay (for example, one side at 0 ms and the other at 30 ms), while remaining adjustable without dropouts.

## Implementation checklist

### Playback and graph lifecycle

- [x] Prevent duplicate `MediaElementAudioSourceNode` creation for the same native audio handle.
- [x] Scope source disconnection to the handle that owns it; deduplicate concurrent `onLoad` attachment for a track request.
- [x] Reset delay history and discard the previous track's convolver tail on attachment.
- [x] Keep the direct signal audible when Surround is switched off or on; smooth wet-level changes.
- [x] Smooth EQ, gain, bass, treble, pan, and output-volume automation to reduce slider zipper noise.
- [ ] Verify repeat, next, and automatic advance after end-of-track on a physical iPhone with imported files.
- [ ] Verify pause/resume and route changes with the iPhone speaker, wired/USB audio, and Bluetooth.

### DSP parity

- [x] Record Android's EQ, boost, gain, pan, and preset contracts from the APK/assets in `src/engine/DSPManager.ts`.
- [x] Replace the iOS parallel stereo echo with a real-time right-channel sample delay and keep it out of the dry path.
- [ ] Match Android's Virtual 3D high-frequency-only input path and exact sample-rate/channel handling. The current iOS worklet delays the full right channel; it is a useful first correction, not the exact band-limited Android port.
- [x] Preserve the dry signal with the current stereo reverb so enabling Surround cannot remove the song.
- [x] Port native reset room feedback (`0.952`), damping (`0.008`), wet/width mapping, and 1 kHz/Q 0.25 biquad on the reverb return.
- [ ] Match the native LF/HF crossover, effect routing, and EQ ordering around the reverb branch.
- [ ] Compare reverb output against a reference signal on Android and iPhone. Static native inspection establishes the structure, not identical rendered output.
- [ ] Port or reconcile the remaining native compressor, low/high split, filters, and output clipping/quantization where they affect audible behavior.
- [ ] Compare every bundled preset's exact serialized values and enable flags against `assets/sound_effects/`; distinguish Android aliases and custom presets.
- [ ] Check slider step/range/labels and speaker-position interaction against the original app on a physical iPhone/iPad.

### Whole-app feature parity

- [x] Current implementation has imported-file library, search, queue playback, player controls, repeat/shuffle, lock-screen controls, and saved effect preferences.
- [x] Current implementation has 10-band EQ, system presets, bass/treble/gain/pan, Virtual 3D and Surround controls, sleep timer, and imported ambient loops.
- [ ] Compare each screen and navigation flow against the Android screenshots and original app.
- [ ] Parse embedded tags and artwork rather than relying on filenames; validate unknown/missing metadata behavior.
- [ ] Review every original Android screen, setting, widget, service, and permission. Add a feature mapping with the appropriate iOS equivalent or an explicit platform limitation.
- [ ] Implement the remaining user-facing features where the iOS platform permits them. Microphone ambience remains deferred as requested.
- [ ] Map Android-only services (Firebase, billing, widgets, device-wide media scan) to iOS equivalents or document why iOS does not expose an equivalent.

## Device acceptance checklist

- [ ] Install a fresh IPA built from the current branch using the available signing/sideloading method.
- [ ] Start a newly imported track after a cold app launch; confirm output on speaker and Bluetooth.
- [ ] Play at least three tracks through automatic end-of-track advance and repeat/shuffle transitions.
- [ ] Toggle Surround both ways during playback; confirm dry audio continues without a transient mute.
- [ ] Sweep level/spread/3D delay while audio plays; confirm stable level, no persistent clipping, and no playback dropouts.
- [ ] Compare the same source file and preset against Android at matched output volume; record the iOS model, route, OS, file format, and settings.
- [ ] Recheck background playback, lock-screen commands, interruptions, and route changes.

## Limits and release path

An iOS implementation can reproduce the user-facing features and DSP behavior where the source algorithm is understood. It cannot reuse Android's JNI `.so`, its Android storage scan, Firebase wiring, or widgets directly; those need iOS implementations. The `7.1` label describes the app's stereo effect; iPhone playback remains stereo and this app does not implement personalized binaural/HRTF rendering.

The current workflow creates an **unsigned** device IPA. A successful artifact proves build/package completion only; signing and real-device audio validation remain separate steps. The first push for this pass, run `39122478118`, failed at `npm ci` because the GitHub API upload truncated the lockfile; the full file is being republished before retry. The user does not have a paid Apple Developer account, so preserve an unsigned IPA workflow and report compatible sideloading requirements clearly.
