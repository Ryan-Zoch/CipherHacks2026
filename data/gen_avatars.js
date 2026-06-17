const fs = require('fs');
const path = require('path');

const people = fs.readFileSync(path.join(__dirname, 'people.csv'), 'utf8')
  .split('\n').slice(1).filter(Boolean);

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { fields.push(cur); cur = ''; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

const colors = [
  '#2c3e50', '#34495e', '#1f4e5f', '#3b5249', '#5b3a29',
  '#4a3b5c', '#1c4d4d', '#5c3a3a', '#2e4d2e', '#3a3a5c'
];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const outDir = path.join(__dirname, '..', 'images');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const line of people) {
  const f = parseCsvLine(line);
  const id = f[0];
  const name = f[1];
  const initials = name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const color = colors[hashStr(name) % colors.length];
  const pfp = f[7] || `p${id}.svg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <rect width="500" height="500" fill="${color}"/>
  <circle cx="250" cy="195" r="95" fill="#ffffff" opacity="0.18"/>
  <rect x="90" y="320" width="320" height="230" rx="160" fill="#ffffff" opacity="0.18"/>
  <text x="250" y="290" font-family="Verdana, Arial, sans-serif" font-size="150" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text>
</svg>`;
  fs.writeFileSync(path.join(outDir, pfp), svg);
}

console.log(`Generated ${people.length} avatar SVGs in ${outDir}`);
