// Minimal SVG path reader for the content pipeline: turns a path `d` string
// into polylines (one per subpath), sampling curves. Enough for the
// Inkscape/WMF-exported reference drawings; not a general SVG library.

function tokenize(d) {
  const tokens = [];
  const re = /([MLHVCSQTAZmlhvcsqtaz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let m;
  while ((m = re.exec(d))) tokens.push(m[1] ?? Number(m[2]));
  return tokens;
}

function cubic(p0, p1, p2, p3, steps, out) {
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
}

/** Polylines in the SVG's own user units (y down). Arcs are drawn as chords. */
export function pathToPolylines(d, curveSteps = 8) {
  const tokens = tokenize(d);
  const lines = [];
  let current = null;
  let pos = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let lastControl = null;
  let cmd = null;
  let i = 0;
  const num = () => tokens[i++];
  while (i < tokens.length) {
    if (typeof tokens[i] === "string") cmd = tokens[i++];
    else if (cmd === null) throw new Error("Path data starts with a number.");
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    if (upper === "Z") {
      if (current) {
        current.push({ ...start });
        lines.push(current);
        current = null;
      }
      pos = { ...start };
      lastControl = null;
      continue;
    }
    if (typeof tokens[i] !== "number") break;
    const at = (x, y) => (rel ? { x: pos.x + x, y: pos.y + y } : { x, y });
    switch (upper) {
      case "M": {
        if (current && current.length > 1) lines.push(current);
        pos = at(num(), num());
        start = { ...pos };
        current = [{ ...pos }];
        cmd = rel ? "l" : "L";
        lastControl = null;
        break;
      }
      case "L":
        pos = at(num(), num());
        current.push({ ...pos });
        lastControl = null;
        break;
      case "H": {
        const x = num();
        pos = { x: rel ? pos.x + x : x, y: pos.y };
        current.push({ ...pos });
        lastControl = null;
        break;
      }
      case "V": {
        const y = num();
        pos = { x: pos.x, y: rel ? pos.y + y : y };
        current.push({ ...pos });
        lastControl = null;
        break;
      }
      case "C": {
        const c1 = at(num(), num());
        const c2 = at(num(), num());
        const end = at(num(), num());
        cubic(pos, c1, c2, end, curveSteps, current);
        lastControl = c2;
        pos = end;
        break;
      }
      case "S": {
        const c1 = lastControl ? { x: 2 * pos.x - lastControl.x, y: 2 * pos.y - lastControl.y } : { ...pos };
        const c2 = at(num(), num());
        const end = at(num(), num());
        cubic(pos, c1, c2, end, curveSteps, current);
        lastControl = c2;
        pos = end;
        break;
      }
      case "Q": {
        const q = at(num(), num());
        const end = at(num(), num());
        const c1 = { x: pos.x + (2 / 3) * (q.x - pos.x), y: pos.y + (2 / 3) * (q.y - pos.y) };
        const c2 = { x: end.x + (2 / 3) * (q.x - end.x), y: end.y + (2 / 3) * (q.y - end.y) };
        cubic(pos, c1, c2, end, curveSteps, current);
        lastControl = null;
        pos = end;
        break;
      }
      case "T": {
        pos = at(num(), num());
        current.push({ ...pos });
        lastControl = null;
        break;
      }
      case "A": {
        num(); num(); num(); num(); num();
        pos = at(num(), num());
        current.push({ ...pos });
        lastControl = null;
        break;
      }
      default:
        throw new Error(`Unsupported path command ${cmd}`);
    }
  }
  if (current && current.length > 1) lines.push(current);
  return lines;
}

/** `{id: d}` for every <path> with an id in an SVG document string. */
export function pathsById(svg) {
  const out = {};
  for (const m of svg.matchAll(/<path\b([^>]*)>/gs)) {
    const id = /\sid="([^"]*)"/.exec(m[1]);
    const d = /\sd="([^"]*)"/.exec(m[1]);
    if (id && d) out[id[1]] = d[1];
  }
  return out;
}
