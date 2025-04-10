import { walkSync } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join, relative, extname, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
// import { tmpdir } from "https://deno.land/std@0.224.0/os/mod.ts";
import { basename } from "https://deno.land/std@0.224.0/path/mod.ts";
import "./utils/processVideo_utils.ts"
import { transformVideos } from './utils/processVideo_utils.ts'
// import { toBytes } from "https://deno.land/std/streams/conversion.ts";
import sharp from "npm:sharp";


// Utility to check if a path is an image
function isImage(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".avif", ".tiff", ".svg", ".gif"].includes(ext);
}
async function copyFile(src: string, dest: string) {
  const destDir = dirname(dest);
  await Deno.mkdir(destDir, { recursive: true });
  await Deno.copyFile(src, dest);
}

async function optimizeImage(inputPath: string, outputPath: string) {
  const ext = extname(inputPath).toLowerCase();
  const tempFileDir = join(outputPath, ext);
  let image = sharp(inputPath);

  switch (ext) {
    case ".jpg":
    case ".jpeg":
      image = image.jpeg({ quality: 80 });
      break;
    case ".png":
      image = image.png({ compressionLevel: 9 });
      break;
    case ".webP":
      image = image.webp({ quality: 80 });
      break;
    case ".avif":
      image = image.avif({ quality: 80 });
      break;
    case ".gif":
      return;
    default:
      return;
  }
  const outputDir = dirname(outputPath);
  await Deno.mkdir(outputDir, { recursive: true });
  const tempFilePath = join(outputDir, `${basename(outputPath, ext)}.tmp${ext}`);
  try {
    await image.toFile(tempFilePath);
    await Deno.remove(outputPath).catch(() => {});
    await Deno.rename(tempFilePath, outputPath);
  } catch (error) {
    console.error(`Error optimizing ${inputPath}: ${error}`);
  }
}
// Initial full copy and optimization of assets
async function initialAssetSync(src: string, dest: string) {
  // console.log("Performing initial asset sync...");
  await Deno.remove(dest, { recursive: true }).catch(() => {});
  await Deno.mkdir(dest, { recursive: true });

  for (const entry of walkSync(src)) {
    if (entry.isFile) {
      const relPath = relative(src, entry.path);
      const destPath = join(dest, relPath);
      await copyFile(entry.path, destPath);
      if (isImage(entry.path)) { // Use full source path
        await optimizeImage(entry.path, destPath); // Pass full paths
      }
    }
  }
  // console.log("Initial asset sync completed.");
}
// Process a single file event (add/modify)
async function processFileEvent(srcPath: string, destBase: string) {
  const relPath = relative("./assets", srcPath);
  const destPath = join(destBase, relPath);

  await copyFile(srcPath, destPath);
  if (isImage(srcPath)) {
    await optimizeImage(srcPath, destPath); // Use full paths
  }
}

// Debounce function to limit rapid successive calls
function debounce(fn: (...args: any[]) => void, delay: number) {
  let timeout: number | null = null;
  return (...args: any[]) => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Main watcher logic
export async function transformAssets(changedFiles: Set<string> | null = null, isProd: boolean = false) {
  const srcDir = "./assets";
  const destDir = isProd ? "./prod/assets" : "./dist/assets";

  if (changedFiles && changedFiles.size > 0) {
    // Process only changed files
    for (const file of changedFiles) {
      await processFileEvent(file, destDir);
    }
  } else {
    // Perform initial sync
    await initialAssetSync(srcDir, destDir);
  }
  
  await transformVideos();
}

// Run the watcher
// if (import.meta.main) {
//   transformAssets().catch(console.error);
// }