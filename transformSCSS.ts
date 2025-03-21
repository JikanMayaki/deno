import { walk } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join, basename } from "https://deno.land/std@0.224.0/path/mod.ts";
import * as sass from 'npm:sass';
import * as path from 'npm:path';


export async function transformSCSS() {
    console.log("Starting SCSS to CSS conversion...");
    const srcPath = "./src";
    const distPath = "./dist/css";
  
    // await Deno.mkdir(distPath, { recursive: true });
  
    for await (const entry of walk(srcPath, { exts: [".scss"] })) {
      const srcFile = entry.path;
      const filename = basename(srcFile);
      const filenameWithCssExt = filename.replace('.scss', '.css');
      const distFile = join(distPath, filenameWithCssExt);

    try {
      const srcStat = await Deno.stat(srcFile);
      let shouldConvert = true;
      let reason = "file does not exist in dist";

      try {
        const distStat = await Deno.stat(distFile);
        shouldConvert = srcStat.mtime > distStat.mtime;
        reason = shouldConvert ? "source is newer" : "not modified";
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
          shouldConvert = true;
        } else {
          throw err;
        }
      }

      if (shouldConvert) {
        const result = sass.compile(srcFile);
        await Deno.writeTextFile(distFile, result.css);
        // console.log(`Converted ${srcFile} to ${distFile} (Reason: ${reason})`);
      } else {
        // console.log(`Skipped ${srcFile} (Reason: ${reason})`);
      }
    } catch (err) {
      console.error(`Error processing ${srcFile}:`, err);
    }
  }
  console.log("SCSS to CSS conversion complete.");
}