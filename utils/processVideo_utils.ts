//ya, it is ffmpeg. get over it. to use this utility, you must have ffmpeg installed as a system binary https://ffmpeg.org/download.html

// import { ffmpeg } from "https://deno.land/x/fast_forward@<version>/mod.ts";
import { walkSync } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join, relative, extname, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ffmpeg } from "https://deno.land/x/fast_forward@0.1.6/mod.ts";

// // Utility to check if a path is a video
// function isVideo(path: string): boolean {
//   const ext = extname(path).toLowerCase();
//   return [".mp4", ".webm", ".mov", ".mkv", ".avi"].includes(ext);
// }

// // Check if output is up-to-date
// async function isOutputCurrent(src: string, dest: string): Promise<boolean> {
//   try {
//     const srcStat = await Deno.stat(src);
//     const destStat = await Deno.stat(dest);
//     return destStat.mtime !== null && destStat.mtime >= srcStat.mtime!;
//   } catch {
//     return false; // 
//   }
// }

// // Optimize a video using deno-fast-forward
// async function optimizeVideo(srcPath: string, destPath: string, highCompression = false) {
//   const crf = highCompression ? "28" : "18"; // quality between 18-28
//   const encoder = ffmpeg(srcPath)
//     .videoCodec("libx264")
//     .audioCodec("aac")
//     .videoBitrate(highCompression ? "500k" : "1M") // bitrate, this can be adjusted
//     .audioBitrate("128k")
//     // .addOption("-crf", crf)
//     // .addOption("-movflags", "+faststart") // optimization
//     .output(destPath)
//     .override(true); // this may be overkill not sure

//   try {
//     for await (const process of encoder) {
//       process.run();
//       const status = await process.status();
//       process.close();
//       if (!status.success) {
//         throw new Error(`Encoding failed for ${srcPath}: ${new TextDecoder().decode(await process.stderrOutput())}`);
//       }
//     }
//     console.log(`Optimized ${srcPath} to ${destPath}`);
//   } catch (error) {
//     console.error(`Error optimizing ${srcPath}: ${error}`);
//   }
// }

// // Initial sync and optimization
// async function initialVideoSync(srcDir: string, destDir: string, highCompression = false) {
//   console.log("Performing initial video sync...");
//   await Deno.mkdir(destDir, { recursive: true });

//   const tasks: Promise<void>[] = [];
//   for (const entry of walkSync(srcDir)) {
//     if (entry.isFile && isVideo(entry.path)) {
//       const relPath = relative(srcDir, entry.path);
//       const destPath = join(destDir, relPath.replace(extname(relPath), ".mp4"));
//       if (await isOutputCurrent(entry.path, destPath)) {
//         console.log(`Skipping ${relPath} (already processed)`);
//         continue;
//       }
//       tasks.push(optimizeVideo(entry.path, destPath, highCompression));
//     }
//   }

//   // concurrency just setting at 2, can probably go higher just be judicious
//   await Promise.all(tasks.slice(0, 2));
//   for (let i = 2; i < tasks.length; i += 2) {
//     await Promise.all(tasks.slice(i, i + 2));
//   }

//   console.log("Initial video sync completed.");
// }

// // Process a single changed file
// async function processVideoEvent(srcPath: string, destBase: string, highCompression = false) {
//   if (!isVideo(srcPath)) return;
//   const relPath = relative("./assets/videos", srcPath);
//   const destPath = join(destBase, relPath.replace(extname(relPath), ".mp4"));
//   if (await isOutputCurrent(srcPath, destPath)) return;
//   await optimizeVideo(srcPath, destPath, highCompression);
// }

// // Main transform function
// export async function transformVideos(
//   changedFiles: Set<string> | null = null,
//   options: { highCompression?: boolean } = {},
// ) {
//   const srcDir = "./assets/videos";
//   const destDir = "./dist/assets/videos";
//   const { highCompression = false } = options;

//   try {
//     await Deno.stat(srcDir);
//   } catch {
//     console.log("No videos directory found, skipping video processing.");
//     return;
//   }

//   if (changedFiles) {
//     for (const file of changedFiles) {
//       await processVideoEvent(file, destDir, highCompression);
//     }
//   } else {
//     await initialVideoSync(srcDir, destDir, highCompression);
//   }
// }

// testing only
// if (import.meta.main) {
//   transformVideos().catch(console.error);
// }




// /this was original script.
// Utility to check if a path is a video
function isVideo(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return [".mp4", ".webm", ".mov", ".mkv", ".avi"].includes(ext);
}

// Copy a file (for fallback or unprocessed files)
async function copyFile(src: string, dest: string) {
  const destDir = dirname(dest);
  await Deno.mkdir(destDir, { recursive: true });
  await Deno.copyFile(src, dest);
}

// Check if output is up-to-date
async function isOutputCurrent(src: string, dest: string): Promise<boolean> {
  try {
    const srcStat = await Deno.stat(src);
    const destStat = await Deno.stat(dest);
    return destStat.mtime !== null && destStat.mtime >= srcStat.mtime!;
  } catch {
    return false; // If dest doesn’t exist or stat fails, process it
  }
}

// Optimize a video using FFmpeg
async function optimizeVideo(srcPath: string, destPath: string, highCompression = false) {
  const crf = highCompression ? "28" : "18"; // CRF 18 is near-lossless, 28 is smaller
  const args = [
    "-i", srcPath,           // Input file
    "-c:v", "libx264",      // H.264 video codec
    "-preset", "medium",    // Balance speed and quality
    "-crf", crf,            // Quality: lower is better, 18-28 is typical range
    "-c:a", "aac",          // AAC audio codec
    "-b:a", "128k",         // Audio bitrate
    "-movflags", "+faststart", // Optimize for web streaming
    "-y",                   // Overwrite output
    destPath,               // Output file
  ];

  try {
    const process = Deno.run({
      cmd: ["ffmpeg", ...args],
      stdout: "piped",
      stderr: "piped",
    });

    const [status, stderr] = await Promise.all([
      process.status(),
      process.stderrOutput(),
    ]);

    process.close();

    if (!status.success) {
      const errorText = new TextDecoder().decode(stderr);
      throw new Error(`FFmpeg failed for ${srcPath}: ${errorText}`);
    }
  } catch (error) {
    console.error(`Error optimizing ${srcPath}: ${error}`);
  }
}

// Initial sync and optimization of videos
async function initialVideoSync(srcDir: string, destDir: string, highCompression = false) {
  console.log("Performing initial video sync...");
  await Deno.mkdir(destDir, { recursive: true });

  const tasks: Promise<void>[] = [];
  for (const entry of walkSync(srcDir)) {
    if (entry.isFile && isVideo(entry.path)) {
      const relPath = relative(srcDir, entry.path);
      const destPath = join(destDir, relPath.replace(extname(relPath), ".mp4")); // output to mp4, ??
      if (await isOutputCurrent(entry.path, destPath)) {
        console.log(`Skipping ${relPath} (already processed)`);
        continue;
      }
      tasks.push(optimizeVideo(entry.path, destPath, highCompression));
    }
  }

  // this is just a 2 at a time limit, could maybe be increased depending on system, just to avoid a jam
  await Promise.all(tasks.slice(0, 2));
  for (let i = 2; i < tasks.length; i += 2) {
    await Promise.all(tasks.slice(i, i + 2));
  }

  console.log("Initial video sync completed.");
}

// optimize vidya
async function processVideoEvent(srcPath: string, destBase: string, highCompression = false) {
  if (!isVideo(srcPath)) return;
  const relPath = relative("./assets/videos", srcPath);
  const destPath = join(destBase, relPath.replace(extname(relPath), ".mp4"));
  if (await isOutputCurrent(srcPath, destPath)) return;
  await optimizeVideo(srcPath, destPath, highCompression);
}

// Main transform function
export async function transformVideos(
  changedFiles: Set<string> | null = null,
  options: { highCompression?: boolean } = {},
) {
  const srcDir = "./assets/videos";
  const destDir = "./dist/assets/videos";
  const { highCompression = false } = options;

  try {
    await Deno.stat(srcDir); // want to skip over dir if it is not there. 
  } catch {
    console.log("No videos directory found, skipping video processing.");
    return;
  }

  if (changedFiles) {
    for (const file of changedFiles) {
      await processVideoEvent(file, destDir, highCompression);
    }
  } else {
    await initialVideoSync(srcDir, destDir, highCompression);
  }
}

// for testing
// if (import.meta.main) {
//   transformVideos().catch(console.error);
// }