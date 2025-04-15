//TODO

//optimize images

// deno-lint-ignore-file no-unused-vars
import { ensureDir, walk } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { dirname, join, relative } from "https://deno.land/std@0.224.0/path/mod.ts";
import { Application, send } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { transformAssets } from "./transformAssets.ts";
import { transformTS } from "./transformJS.ts";
import { transformSCSS } from "./transformSCSS.ts";
import { route, type Route } from "@std/http/unstable-route";
import { open } from "https://deno.land/x/open@v1.0.0/index.ts";
import * as path from 'npm:path';
import posthtml from "npm:posthtml";
import include from "npm:posthtml-include";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { acceptWebSocket, isWebSocketCloseEvent } from "https://deno.land/std@0.65.0/ws/mod.ts?s=WebSocketEvent";
import { debounce } from "https://deno.land/std@0.224.0/async/debounce.ts";
import { encoder } from 'https://deno.land/std@0.65.0/encoding/utf8.ts';
import { startDinoAnimation } from "./utils/dino.ts";
import { runBenches } from './utils/performance-test.ts';
const { stopAnimation, updateStatus } = startDinoAnimation(true);
import { transformHTML } from "./transformHTML.ts";
//globals
const srcPath = "./src";
const distPath = "./prod";


async function mirrorDirectoryStructure(sourcePath: string, targetPath: string): Promise<void>  {
  try {
    await Deno.mkdir(targetPath, { recursive: true });

    for await (const entry of Deno.readDir(sourcePath)) {
      if (entry.isDirectory) {
        const newDirName = targetPath.startsWith("./prod")
          ? entry.name === "scss" ? "css" 
          : entry.name === "ts" ? "js" 
          : entry.name
          : entry.name;
          await mirrorDirectoryStructure(
            `${sourcePath}/${entry.name}`,
            `${targetPath}/${newDirName}`
          );
      }
    }
  } catch (error) {
    console.error(`Error processing ${sourcePath}:`, error);
  }
}

async function build(changedFiles: Set<string> | null = null, isProd: boolean = true) {
    await mirrorDirectoryStructure(srcPath, distPath);

    try {
      // updateStatus("🔧 building prod HTML...");
      await transformHTML(changedFiles, isProd);
      updateStatus("HTML");
      // updateStatus("⚙️  transpiling prod TypeScript...");
      await transformTS(changedFiles, isProd);
      updateStatus("JS");
      // updateStatus("🎨 compiling prod SCSS...");
      await transformSCSS(changedFiles, isProd);
      updateStatus("CSS");
      // updateStatus("📦 processing Assets...");
      await transformAssets(changedFiles, isProd);
      updateStatus("assets");
      await runBiome();
      updateStatus("biome");
      stopAnimation();
      await runBenches().catch((err) => console.error("Error:", err));
    } catch (error) {
      stopAnimation();
      console.error("❌ Error during prod build process:", error);
    }
}
///we should start biome daemon first, make sure it is running, then walk into deno cmd
// async function runBiome() {
//   const process = Deno.command({
//     //added unknown flag so biome skips files it does not recognize. 
//     cmd: ["biome", "check", "prod/", "--files-ignore-uknown", "--write"],
//     stdout: "inherit",
//     stderr: "inherit",
//   });

async function runBiome() {
  const logFilePath = "./biome_errors.log";
  // await Deno.writeTextFile(logFilePath, "🚨 Biome Linting Errors:\n\n"); 

  let errorCount = 0;

  try {
    for await (const entry of walk("prod", { includeFiles: true, followSymlinks: true })) {
      if (entry.isFile && entry.path.endsWith(".js")) {  
        console.log(`🔍 Checking: ${entry.path}`);

        const lintCommand = new Deno.Command("biome", {
          args: ["check", entry.path, "--write"],
          stdout: "piped",  // capture output instead of logging
          stderr: "piped",
        });

        const lintProcess = lintCommand.spawn();
        const { stdout, stderr, success } = await lintProcess.output();

        if (!success) {
          errorCount++;
          const errorMessage = `❌ Issues found in: ${entry.path}\n${new TextDecoder().decode(stderr)}\n`;
          await Deno.writeTextFile(logFilePath, errorMessage, { append: true });
          //add stopper here
          lintProcess.kill();
        }
      }
    }

    if (errorCount > 0) {
      console.log(`⚠️  Biome found ${errorCount} file(s) with issues. Check "prod/biome_errors.log" for details.`);
    } else {
      console.log("✅ All files passed!");
    }

  } catch (error) {
    if (error instanceof Error) {
        console.error(`❌ Error during linting: ${error.message}`);
      } else {
        console.error(`❌ Error during linting: ${String(error)}`);
      }

  }
}


const debouncedBuild = debounce(async (changedFiles: Set<string>) => {
  console.log("Debounced build triggered with changes:", Array.from(changedFiles));    
  await build(changedFiles);
}, 300);


// async function transformHTML(changedFiles: Set<string> | null = null) {
//   console.log("Starting HTML file copying...");
//   for await (const entry of walk(srcPath, { exts: [".html"] })) {
//     const srcFile = entry.path;
//     if (changedFiles && !changedFiles.has(srcFile)) continue;
//     const relativePath = relative(srcPath, srcFile);
//     const distFile = join(distPath, relativePath);
//     const srcStat = await Deno.stat(srcFile);
//     const shouldCopy = await (async () => {
//       try {
//         const distStat = await Deno.stat(distFile);
//         return !distStat.mtime || (srcStat.mtime && srcStat.mtime > distStat.mtime);
//       } catch (err) {
//         return err instanceof Deno.errors.NotFound;
//       }
//     })();

//     if (!shouldCopy) continue;
//     await Deno.mkdir(join(distPath, relativePath, ".."), { recursive: true });
//     let content = await Deno.readTextFile(srcFile);
    
//     const result = await posthtml([
//       include({
//         root: srcPath,
//         onError: (error: Error) => console.error(`Error including partial: ${error.message}`),
//       })
//     ]).process(content);
        
//         content = result.html;
//         content = content.replace(/<!--[\s\S]*?-->/g, ""); // rm comments
//         content = content.replace(/^\s*[\r\n]/gm, ""); // rm empty lines
//         // replace paths
//         const transformedContent = content
//           .replace(/(?<=href="|src=")(.+\/)?scss\/(.+?)\.scss/g, "$1css/$2.css")
//           .replace(/(?<=href="|src=")(.+\/)?ts\/(.+?)\.ts/g, "$1js/$2.js")
//           .replace(/(?<=href="|src=")\.\.\/assets\//g, "./assets/")
//           .replace(/(?<=href="|src=")(.+\/)scss\//g, "$1css/")
//           .replace(/(?<=href="|src=")(.+\/)ts\//g, "$1js/");
//         // write the transformed content
//         await Deno.writeTextFile(distFile, transformedContent);
//         console.log(`Processed and copied ${srcFile} to ${distFile}`);
//       }
//     }

async function main(): Promise<void> {
  await build();
}

main().catch(console.error);