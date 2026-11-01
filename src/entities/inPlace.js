/** Remove the forward root motion baked into Mixamo clips; game movement owns world position. */
export function makeInPlace(clip) {
  for (const track of clip.tracks) {
    if (!/Hips\.position$/i.test(track.name)) continue;
    const values = track.values, times = track.times;
    if (times.length < 2 || values.length !== times.length * 3) continue;
    const start = values[1], end = values[values.length - 2];
    const duration = times[times.length - 1] - times[0];
    if (duration <= 0) continue;
    for (let i = 0; i < times.length; i++) {
      values[i * 3 + 1] -= (end - start) * (times[i] - times[0]) / duration;
    }
  }
  return clip;
}

