Etched Booth sound files (all optional; the audio code silently does nothing when a file is missing).
Drop these files in this folder:

  shutter.mp3       camera shutter at capture
  countdown.mp3     one tick per countdown number (3, 2, 1)
  press.mp3         plate press, played when the etch starts (progress 0)
  engrave-loop.mp3  loops while the etch runs (progress 0.1 to 0.9)
  clank.mp3         plate released, played when the etch finishes (progress 1)

Paths are configured in src/booths/etched/config.ts.
