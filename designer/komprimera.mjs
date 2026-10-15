// Gör en bild lagom stor innan den sparas i kundens mapp, med sharp från fabrikens
// beroenden. Vrider den rätt efter kamerans EXIF och tar bort all metadata, även
// platsen där bilden togs. Foton blir JPEG; bilder med genomskinlighet, som en
// logga, förblir PNG. Får fältet inte vara JPEG behålls bildens eget format.
//
//   node komprimera.mjs <in> <ut utan ändelse> <största sida i pixlar> <tillåtna format> <bildens format>
//
// HJERDAL_MODULER pekar på node_modules där sharp finns. Skriver resultatet som JSON.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { statSync } from 'node:fs';

const require = createRequire(join(process.env.HJERDAL_MODULER, 'komprimera.cjs'));
const sharp = require('sharp');

const [, , inFil, utBas, storstaText, tillatnaText = 'jpg,png,webp', ursprung = 'jpg'] = process.argv;
const storsta = Number(storstaText) || 2560;
const tillatna = tillatnaText.split(',');
const forsta = (...format) => format.find((f) => tillatna.includes(f));

const meta = await sharp(inFil, { failOn: 'none' }).metadata();
const genomskinlig = Boolean(meta.hasAlpha) && !(await sharp(inFil, { failOn: 'none' }).stats()).isOpaque;
const format = (genomskinlig ? forsta('png', 'webp') : forsta('jpg', ursprung, 'png', 'webp')) ?? (genomskinlig ? 'png' : 'jpg');
const ut = `${utBas}.${format}`;
let bild = sharp(inFil, { failOn: 'none' })
  .rotate()
  .resize({ width: storsta, height: storsta, fit: 'inside', withoutEnlargement: true });
if (format === 'jpg') bild = bild.flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true });
else if (format === 'webp') bild = bild.webp({ quality: genomskinlig ? 90 : 82, alphaQuality: 100 });
else bild = bild.png({ compressionLevel: 9, effort: 8 });
const info = await bild.toFile(ut);
console.log(JSON.stringify({ fil: ut, bredd: info.width, hojd: info.height, storlek: statSync(ut).size, fore: statSync(inFil).size }));
