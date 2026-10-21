/**
 * Generate a GitHub-style, standalone SVG summary of public repository languages.
 * Inspired by J1angJJ's Profile README language card layout.
 * Run with: node .github/scripts/generate-language-card.mjs
 * Needs GITHUB_REPOSITORY_OWNER; optionally GITHUB_TOKEN for API rate limits.
 */
import { mkdir, writeFile } from 'node:fs/promises';

const owner = process.env.GITHUB_REPOSITORY_OWNER || 'Mplus0';
const token = process.env.GITHUB_TOKEN;
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'mplus0-profile-language-card',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const colors = {
  Python: '#3572A5',
  'C++': '#f34b7d',
  C: '#555555',
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Java: '#b07219',
  HTML: '#e34c26',
  CSS: '#663399',
  Shell: '#89e051',
  Dockerfile: '#384d54',
  CMake: '#DA3434',
  Makefile: '#427819',
  TeX: '#3D6117',
  Jupyter: '#DA5B0B',
  Go: '#00ADD8',
  Rust: '#dea584',
  Verilog: '#6e7781',
  Assembly: '#6e7781',
};

const xml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}): ${url}`);
  }
  return response.json();
}

async function listSourceRepositories() {
  const repos = [];
  for (let page = 1; page <= 10; page++) {
    const api = new URL(`https://api.github.com/users/${encodeURIComponent(owner)}/repos`);
    api.searchParams.set('type', 'owner');
    api.searchParams.set('sort', 'updated');
    api.searchParams.set('per_page', '100');
    api.searchParams.set('page', String(page));
    const batch = await getJson(api.toString());
    if (!Array.isArray(batch)) throw new Error('Unexpected GitHub repository response');
    repos.push(...batch.filter(repo =>
      !repo.fork && !repo.archived && !repo.disabled &&
      repo.name.toLowerCase() !== owner.toLowerCase()
    ));
    if (batch.length < 100) break;
  }
  return repos;
}

async function collectLanguageBytes(repos) {
  const totals = new Map();
  // Limit concurrent API requests to avoid overloading GitHub or the runner.
  for (let index = 0; index < repos.length; index += 5) {
    const batch = await Promise.all(repos.slice(index, index + 5)
      .map(repo => getJson(repo.languages_url)));
    for (const result of batch) {
      for (const [language, bytes] of Object.entries(result)) {
        if (Number.isFinite(bytes) && bytes > 0) {
          totals.set(language, (totals.get(language) || 0) + bytes);
        }
      }
    }
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function makeSvg(languages, dark) {
  const theme = dark
    ? { bg: '#0d1117', border: '#30363d', mutedBg: '#161b22', title: '#e6edf3', text: '#c9d1d9', muted: '#8b949e', track: '#21262d' }
    : { bg: '#ffffff', border: '#d0d7de', mutedBg: '#f6f8fa', title: '#24292f', text: '#57606a', muted: '#6e7781', track: '#eaeef2' };
  const top = languages.slice(0, 6);
  const total = languages.reduce((sum, [, bytes]) => sum + bytes, 0);
  const width = 520;
  const rowHeight = 48;
  const rowStartY = 126;
  const barX = 28;
  const barWidth = 464;
  const height = top.length ? rowStartY + top.length * rowHeight + 18 : 206;
  const defaultColor = '#6e7781';

  let currentX = 0;
  const segments = top.map(([language, bytes]) => {
    const segmentWidth = total ? (bytes / total) * barWidth : 0;
    const segment = `<rect x="${currentX.toFixed(2)}" y="0" width="${segmentWidth.toFixed(2)}" height="14" fill="${colors[language] || defaultColor}" stroke="${theme.bg}" stroke-width="1"/>`;
    currentX += segmentWidth;
    return segment;
  }).join('');

  const rows = top.map(([language, bytes], index) => {
    const percent = total ? (bytes / total) * 100 : 0;
    const y = rowStartY + index * rowHeight;
    const fillWidth = Math.min(barWidth, Math.max(percent > 0 ? 3 : 0, barWidth * percent / 100));
    const color = colors[language] || defaultColor;
    return `
    <circle cx="34" cy="${y - 13}" r="5.5" fill="${color}"/>
    <text x="48" y="${y - 8}" fill="${theme.text}" font-size="14" font-weight="600">${xml(language)}</text>
    <text x="492" y="${y - 8}" fill="${theme.muted}" font-size="13" text-anchor="end">${percent.toFixed(1)}%</text>
    <rect x="28" y="${y + 5}" width="${barWidth}" height="12" rx="6" fill="${theme.track}"/>
    <rect x="28" y="${y + 5}" width="${fillWidth.toFixed(1)}" height="12" rx="6" fill="${color}"/>`;
  }).join('');

  const empty = !top.length ? `<text x="28" y="145" fill="${theme.muted}" font-size="14">No public source language data available yet.</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="card-title card-desc">
  <title id="card-title">Most Used Languages</title>
  <desc id="card-desc">Language bytes across public, non-fork, non-archived repositories belonging to ${xml(owner)}</desc>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="${theme.bg}" stroke="${theme.border}"/>
  <rect x="16" y="16" width="488" height="86" rx="6" fill="${theme.mutedBg}"/>
  <g font-family="Segoe UI, Arial, sans-serif">
    <text x="28" y="34" fill="${theme.title}" font-size="18" font-weight="700">Most Used Languages</text>
    <text x="28" y="56" fill="${theme.muted}" font-size="12">Public source repositories, sorted by total bytes</text>
    <g transform="translate(${barX} 76)">
      <clipPath id="language-bar-clip"><rect width="${barWidth}" height="14" rx="7"/></clipPath>
      <rect width="${barWidth}" height="14" rx="7" fill="${theme.track}"/>
      <g clip-path="url(#language-bar-clip)">${segments}</g>
    </g>
    ${rows}
    ${empty}
  </g>
</svg>\n`;
}

const repos = await listSourceRepositories();
const languages = await collectLanguageBytes(repos);
await mkdir('readme/resources', { recursive: true });
await Promise.all([
  writeFile('readme/resources/languages.svg', makeSvg(languages, false), 'utf8'),
  writeFile('readme/resources/languages-dark.svg', makeSvg(languages, true), 'utf8'),
]);
console.log(`Generated language cards for ${owner} from ${repos.length} public source repositories.`);
