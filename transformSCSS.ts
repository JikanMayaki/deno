import { ensureDir, walk, ensureDirSync, walkSync } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join, basename, relative, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import * as sass from "npm:sass";
import postcss from "npm:postcss";
// import * as path from 'npm:path';
import postcssImport from "npm:postcss-import";
import { transform, browserslistToTargets, Features } from 'lightningcss';
// import { Buffer } from 'jsr:@std/io@0.223/buffer'
import { debounce } from "https://deno.land/std@0.224.0/async/debounce.ts";
// import { transform, browserslistToTargets, Features } from 'lightningcss';


const processedFiles = new Set<string>();

async function processFile(file: string, srcPath: string, distPath: string): Promise<void> {
  try {
    const relativePath = relative(srcPath, file);
    const outputFilename = basename(file).replace(/\.(scss|css)$/, '.css');
    const outputDir = join(distPath, dirname(relativePath));
    const distFile = join(outputDir, outputFilename);

    await ensureDir(outputDir);

    let cssContent: string;

    if (file.endsWith(".scss")) {
      const result = await sass.compileAsync(file, {
        style: "expanded",
        loadPaths: [dirname(file), './src/scss'],
      });
      cssContent = result.css;
    } else {
      cssContent = await Deno.readTextFile(file);
    }

    const postCssResult = await postcss([postcssImport()]).process(cssContent, { 
      from: file, 
      to: distFile 
    });

    const { code } = transform({
      filename: basename(file),
      code: new TextEncoder().encode(postCssResult.css),
      minify: true,
    });

    await Deno.writeTextFile(distFile, new TextDecoder().decode(code));
    processedFiles.add(file);
    
    console.log(`Processed: ${file} -> ${distFile}`);
  } catch (error) {
    console.error(`Error processing ${file}:`, error);
  }
}

export async function transformSCSS(changedFiles: Set<string> | null = null): Promise<void> {
  console.log("Starting SCSS to CSS conversion...");
  const srcPath = "./src/scss";
  const distPath = "./dist/css";
  
  await ensureDir(distPath);
  
  if (!changedFiles) {
    console.log("Processing all files (initial run)...");
    const processPromises: Promise<void>[] = [];
    for await (const entry of walk(srcPath, { exts: [".scss", ".css"] })) {
      console.log(`Found file to process: ${entry.path}`);
      processPromises.push(processFile(entry.path, srcPath, distPath));
    }
    await Promise.all(processPromises);
  } else {
    console.log("Processing changed files:", Array.from(changedFiles));
    const processPromises: Promise<void>[] = [];
    for (const file of changedFiles) {
      if (file.endsWith(".scss") || file.endsWith(".css")) {
        console.log(`Queuing file to process: ${file}`);
        processPromises.push(processFile(file, srcPath, distPath));
      } else {
        console.log(`Skipping non-SCSS/CSS file: ${file}`);
      }
    }
    await Promise.all(processPromises);
  }
  
  console.log("SCSS to CSS conversion completed 🦖");
}
    // await Deno.mkdir(distPath, { recursive: true });
  
  //   for await (const entry of walk(srcPath, { exts: [".scss"] })) {
  //     const srcFile = entry.path;
  //     const filename = basename(srcFile);
  //     const filenameWithCssExt = filename.replace('.scss', '.css');
  //     const distFile = join(distPath, filenameWithCssExt);

  //   try {
  //     const srcStat = await Deno.stat(srcFile);
  //     let shouldConvert = true;
  //     let reason = "file does not exist in dist";

  //     try {
  //       const distStat = await Deno.stat(distFile);
  //       shouldConvert = srcStat.mtime > distStat.mtime;
  //       reason = shouldConvert ? "source is newer" : "not modified";
  //     } catch (err) {
  //       if (err instanceof Deno.errors.NotFound) {
  //         shouldConvert = true;
  //       } else {
  //         throw err;
  //       }
  //     }

  //     if (shouldConvert) {
  //       const result = sass.compile(srcFile);
  //       await Deno.writeTextFile(distFile, result.css);
  //       // console.log(`Converted ${srcFile} to ${distFile} (Reason: ${reason})`);
  //     } else {
  //       // console.log(`Skipped ${srcFile} (Reason: ${reason})`);
  //     }
  //   } catch (err) {
  //     console.error(`Error processing ${srcFile}:`, err);
  //   }
  // }
  // console.log("SCSS to CSS conversion complete.");
// }


