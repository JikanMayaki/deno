import { ensureDir, walk, ensureDirSync, walkSync } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join, basename, relative, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import * as sass from "npm:sass";
import postcss from "npm:postcss";
import postcssImport from "npm:postcss-import";
import autoprefixer from "npm:autoprefixer"; // Add autoprefixer
import postcssUtilities from "npm:postcss-utilities"; // Add postcss-utilities
import { transform, browserslistToTargets, Features } from 'lightningcss';
import { debounce } from "https://deno.land/std@0.224.0/async/debounce.ts";

const processedFiles = new Set<string>();

async function processFile(file: string, srcPath: string, distPath: string, isProd: boolean = false): Promise<void> {
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
    //with plugins
    const postCssResult = await postcss([
      postcssImport(),
      postcssUtilities({
        clearfix: true, // Example utility
        center: true,   // Example utility
      }),
      autoprefixer({
        overrideBrowserslist: ["last 2 versions", "> 1%"],
      }),
    ]).process(cssContent, {
      from: file,
      to: distFile,
    });
    //trying to make this a bit more robust with optional plugins, this is all u need tho
    // const postCssResult = await postcss([postcssImport()]).process(cssContent, { 
    //   from: file, 
    //   to: distFile 
    // });

    const { code } = transform({
      filename: basename(file),
      code: new TextEncoder().encode(postCssResult.css),
      minify: isProd,
    });

    await Deno.writeTextFile(distFile, new TextDecoder().decode(code));
    processedFiles.add(file);
    
    // console.log(`Processed: ${file} -> ${distFile}`);
  } catch (error) {
    console.error(`Error processing ${file}:`, error);
  }
}

export async function transformSCSS(changedFiles: Set<string> | null = null, isProd: boolean = false): Promise<void> {
  const srcPath = "./src/scss";
  const distPath = isProd ? "./prod/css" : "./dist/css";
  
  await ensureDir(distPath);
  
  if (!changedFiles) {
    const processPromises: Promise<void>[] = [];
    for await (const entry of walk(srcPath, { exts: [".scss", ".css"] })) {
      processPromises.push(processFile(entry.path, srcPath, distPath, isProd));

      // console.log(`Found file to process: ${entry.path}`);
      // processPromises.push(processFile(entry.path, srcPath, distPath));
    }
    await Promise.all(processPromises);
  } else {
    // console.log("Processing changed files:", Array.from(changedFiles));
    const processPromises: Promise<void>[] = [];
    for (const file of changedFiles) {
      if (file.endsWith(".scss") || file.endsWith(".css")) {
        // console.log(`Queuing file to process: ${file}`);
        processPromises.push(processFile(file, srcPath, distPath, isProd));

        // processPromises.push(processFile(file, srcPath, distPath));
      } else {
        // console.log(`Skipping non-SCSS/CSS file: ${file}`);
      }
    }
    await Promise.all(processPromises);
  }
  
  // console.log("SCSS to CSS conversion completed 🦖");
}


