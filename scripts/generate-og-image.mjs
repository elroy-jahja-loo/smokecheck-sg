import sharp from "sharp";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b2a5b"/>
      <stop offset="1" stop-color="#005baa"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1000" cy="110" r="260" fill="#ffffff" opacity="0.04"/>
  <circle cx="150" cy="560" r="220" fill="#ffffff" opacity="0.04"/>
  <g transform="translate(88 150)">
    <rect x="0" y="0" width="330" height="330" rx="28" fill="#eef6ff"/>
    <path d="M165 20 74 62v74c0 78 51 128 91 154 40-26 91-76 91-154V62L165 20Z" fill="#005baa"/>
    <path d="M165 82c-28 0-51 23-51 51 0 35 51 89 51 89s51-54 51-89c0-28-23-51-51-51Zm0 73a22 22 0 1 1 0-44 22 22 0 0 1 0 44Z" fill="#cfe4ff"/>
    <path d="m128 166 24 24 50-58" stroke="#ffffff" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="480" y="240" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="bold" fill="#ffffff">SmokeCheck SG</text>
  <text x="480" y="330" font-family="Arial, Helvetica, sans-serif" font-size="44" fill="#bfe3ff">Clean city. Clear conscience. Check first.</text>
  <text x="480" y="420" font-family="Arial, Helvetica, sans-serif" font-size="36" fill="#ffffff" opacity="0.92">Smoking areas &amp; no-smoking zones map for Singapore</text>
  <text x="480" y="500" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#8cc8ff">Official NEA DSAs · Orchard Road yellow boxes · fines · community spots</text>
  <text x="480" y="570" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#dbeafe">smokecheck-sg.vercel.app</text>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile("public/og-image.png")
  .then((info) => console.log("og-image.png written", info.width, "x", info.height))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
