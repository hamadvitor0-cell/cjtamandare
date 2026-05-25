function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }

  return [h * 360, s, l];
}

function hueDistance(a, b) {
  const diff = Math.abs(a - b);
  return Math.min(diff, 360 - diff);
}

function toCss(color) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function applyColorVars(primary, secondary, accent) {
  const root = document.documentElement;
  [
    ["primary", primary],
    ["secondary", secondary],
    ["accent", accent]
  ].forEach(([name, color]) => {
    root.style.setProperty(`--color-${name}`, toCss(color));
    root.style.setProperty(`--color-${name}-rgb`, `${color.r}, ${color.g}, ${color.b}`);
  });
}

export function applyLogoPalette(src = "/img/LOGO_CJ.png") {
  const image = new Image();
  image.src = src;

  image.onload = () => {
    const canvas = document.createElement("canvas");
    const size = 96;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    const buckets = new Map();

    for (let index = 0; index < pixels.length; index += 16) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const alpha = pixels[index + 3];
      if (alpha < 180) continue;
      const [h, s, l] = rgbToHsl(r, g, b);
      if (s < 0.28 || l < 0.18 || l > 0.86) continue;
      const key = `${Math.round(r / 24) * 24},${Math.round(g / 24) * 24},${Math.round(b / 24) * 24}`;
      const current = buckets.get(key) || { r, g, b, h, count: 0 };
      current.count += 1;
      buckets.set(key, current);
    }

    const colors = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
    if (colors.length < 3) return;

    const primary = colors[0];
    const secondary = colors.find((color) => hueDistance(color.h, primary.h) > 55) || colors[1];
    const accent = colors.find((color) => (
      hueDistance(color.h, primary.h) > 35
      && hueDistance(color.h, secondary.h) > 35
    )) || colors[2];

    applyColorVars(primary, secondary, accent);
  };
}
