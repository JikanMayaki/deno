
import { walkSync } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join, relative, extname, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import {
  ImageMagick,
  initializeImageMagick,
} from "https://deno.land/x/imagemagick_deno@0.0.14/mod.ts";

function isImage(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);
}
//this may needfix
async function optimizeImage(inputPath: string, outputPath: string) {
  await initializeImageMagick();
  const ext = extname(inputPath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    await ImageMagick(inputPath, "-quality", "80", outputPath);
  } else if (ext === ".png") {
    await ImageMagick(inputPath, "-strip", "-define", "png:compression-level=9", outputPath);
  } else if (ext === ".gif") {
    await ImageMagick(inputPath, "-strip", outputPath);
  } else {
    await Deno.copyFile(inputPath, outputPath);
  }
}

export async function transformAssets() {
  const assetsDir = "assets";
  const distAssetsDir = "dist/assets";
  await Deno.mkdir(distAssetsDir, { recursive: true });

  for (const entry of walkSync(assetsDir)) {
    if (entry.isFile) {
      const relPath = relative(assetsDir, entry.path);
      const outputPath = join(distAssetsDir, relPath);
      await Deno.mkdir(join(distAssetsDir, dirname(relPath)), { recursive: true });
      if (isImage(entry.path)) {
        await optimizeImage(entry.path, outputPath);
      } else {
        await Deno.copyFile(entry.path, outputPath);
      }
    }
  }
}
