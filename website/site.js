(() => {
  const audio = document.getElementById("qq-cough-audio");
  if (!audio) return;

  const events = ["pointerdown", "touchstart", "keydown"];
  const cleanup = () => {
    for (const eventName of events) {
      window.removeEventListener(eventName, tryPlay, true);
    }
  };
  const tryPlay = () => {
    const playback = audio.play();
    playback?.then(cleanup).catch(() => {});
  };

  audio.addEventListener("play", cleanup, { once: true });
  for (const eventName of events) {
    window.addEventListener(eventName, tryPlay, true);
  }
  tryPlay();
})();
