// Typsnittsfiler som hämtas direkt med <link rel="preload"> i Bas.astro, så att en rubrik
// eller knapp i första skärmen inte byter radbrytning när typsnittet kommer. Ett typsnitt
// som behöver det har en egen <id>.forladda.ts bredvid sin CSS; alla andra får den här,
// som är tom. Sökvägen sätts i astro.config.mjs (@typsnitt-forladda).
const filer: string[] = [];
export default filer;
