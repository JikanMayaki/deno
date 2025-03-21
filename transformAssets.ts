import { walkSync } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join, relative, extname, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { existsSync } from "https://deno.land/std@0.224.0/fs/mod.ts";

// Function to execute shell commands
async function copyAssets(src: string, dest: string) {
  for (const entry of walkSync(src)) {
    if (entry.isFile) {
      const relPath = relative(src, entry.path);
      const destPath = join(dest, relPath);
      const destDir = dirname(destPath);
      
      await Deno.mkdir(destDir, { recursive: true });
      await Deno.copyFile(entry.path, destPath);
    }
  }
}

// Ensure Node.js and npm are installed
async function optimizeImage(inputPath: string, outputPath: string) {
  const ext = extname(inputPath).toLowerCase();
  const args = ["sharp", "-i", inputPath, "-o", outputPath];

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
      // GIF optimization might require special handling
      break;
    default:
      // For unsupported formats, simply copy the file
      await Deno.copyFile(inputPath, outputPath);
      return;
  }

  const cmd = new Deno.Command("npx", { args });
  await cmd.output();
}
export async function transformAssets() {
  const assetsDir = "./assets";
  const distDir = "./dist/assets";

  try {
    // Clear and recreate directory
    await Deno.remove(distDir, { recursive: true }).catch(() => {});
    await Deno.mkdir(distDir, { recursive: true });

    // Copy all assets first
    await copyAssets(assetsDir, distDir);

    // Optimize images in-place
    for (const entry of walkSync(distDir)) {
      if (entry.isFile && isImage(entry.path)) {
        await optimizeImage(entry.path, entry.path); // Overwrite original
      }
    }

    console.log("Assets processed successfully");
  } catch (error) {
    console.error(`Error processing assets: ${error}`);
  }
}


function isImage(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".avif", ".tiff", ".svg", ".gif"].includes(ext);
}

if (import.meta.main) {
  await transformAssets();
}