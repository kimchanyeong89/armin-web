// dark preview of a black-ink mask: white ink on #080808 (negate and flatten in separate pipelines)
import sharp from 'sharp';
export async function darkPreview(maskPath, outPath) {
  const white = await sharp(maskPath).negate({ alpha: false }).png().toBuffer();
  await sharp(white).flatten({ background: '#080808' }).png().toFile(outPath);
}
if (process.argv[1]?.endsWith('preview.mjs')) for (let i = 2; i < process.argv.length; i += 2) await darkPreview(process.argv[i], process.argv[i + 1]);
