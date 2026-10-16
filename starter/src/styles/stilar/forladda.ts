// Typsnittsfiler som hämtas direkt med <link rel="preload"> i Bas.astro, så att en rubrik
// i första skärmen inte byter radbrytning när typsnittet kommer. En stil som behöver det
// har en egen <stil>.forladda.ts bredvid sin CSS; alla andra får den här, som är tom.
// Sökvägen sätts i astro.config.mjs (@stil-forladda).
const filer: string[] = [];
export default filer;
