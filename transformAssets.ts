import { walkSync } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join, relative, extname, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";

// Utility to check if a path is an image
function isImage(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".avif", ".tiff", ".svg", ".gif"].includes(ext);
}

// Copy a single file from source to destination
async function copyFile(src: string, dest: string) {
  const destDir = dirname(dest);
  await Deno.mkdir(destDir, { recursive: true });
  await Deno.copyFile(src, dest);
}

// Optimize an image in-place using Sharp via npx
async function optimizeImage(inputPath: string) {
  const ext = extname(inputPath).toLowerCase();
  const args = ["sharp", "-i", inputPath, "-o", inputPath]; // Overwrite in-place

  switch (ext) {
    case ".jpg":
    case ".jpeg":
      args.push("--jpeg", "--quality", "80");
      break;
    case ".png":
      args.push("--png", "--quality", "80", "--compression", "9");
      break;
    case ".webp":
      args.push("--webp", "--quality", "80");
      break;
    case ".avif":
      args.push("--avif", "--quality", "80");
      break;
    case ".gif":
      // GIF might need special handling; for now, skip optimization
      return;
    default:
      return; // Skip unsupported formats
  }

  try {
    const cmd = new Deno.Command("npx", { args });
    await cmd.output();
  } catch (error) {
    console.error(`Failed to optimize ${inputPath}: ${error}`);
  }
}

// Initial full copy and optimization of assets
async function initialAssetSync(src: string, dest: string) {
  console.log("Performing initial asset sync...");
  await Deno.remove(dest, { recursive: true }).catch(() => {});
  await Deno.mkdir(dest, { recursive: true });

  for (const entry of walkSync(src)) {
    if (entry.isFile) {
      const relPath = relative(src, entry.path);
      const destPath = join(dest, relPath);
      await copyFile(entry.path, destPath);
      if (isImage(destPath)) {
        await optimizeImage(destPath);
      }
    }
  }
  console.log("Initial asset sync completed.");
}

// Process a single file event (add/modify)
async function processFileEvent(srcPath: string, destBase: string) {
  const relPath = relative("./assets", srcPath);
  const destPath = join(destBase, relPath);

  if (isImage(srcPath)) {
    await copyFile(srcPath, destPath);
    await optimizeImage(destPath);
  } else {
    await copyFile(srcPath, destPath);
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
export async function transformAssets(changedFiles: Set<string> | null = null) {
  const srcDir = "./assets";
  const destDir = "./dist/assets";

  // Perform initial sync
  await initialAssetSync(srcDir, destDir);

  // Set up watcher
  const watcher = Deno.watchFs([srcDir], { recursive: true });
  console.log("Watching for changes in assets directory...");

  // Debounced event handler
  const handleEvent = debounce(async (event: Deno.FsEvent) => {
    console.log(`Change detected: ${event.kind}`, event.paths);

    for (const path of event.paths) {
      const relPath = relative(srcDir, path);
      const destPath = join(destDir, relPath);

      switch (event.kind) {
        case "create":
        case "modify":
          if ((await Deno.stat(path)).isFile) {
            await processFileEvent(path, destDir);
            console.log(`Processed: ${path}`);
          }
          break;
        case "remove":
          try {
            await Deno.remove(destPath, { recursive: true });
            console.log(`Removed: ${destPath}`);
          } catch (error) {
            if (!(error instanceof Deno.errors.NotFound)) {
              console.error(`Error removing ${destPath}: ${error}`);
            }
          }
          break;
      }
    }
  }, 200); // 200ms debounce delay

  // Event loop
  for await (const event of watcher) {
    await handleEvent(event);
  }
}

// Run the watcher
if (import.meta.main) {
  watchAssets().catch(console.error);
}