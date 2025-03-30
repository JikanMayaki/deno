import { walk } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { denoLoaderPlugin } from "https://deno.land/x/esbuild_deno_loader/mod.ts";
import { basename, join,relative } from "https://deno.land/std@0.224.0/path/mod.ts";
// import { bundle } from "jsr:@deno/emit";
import * as esbuild from "https://deno.land/x/esbuild@v0.25.1/mod.js";
import { isAbsolute, resolve } from "https://deno.land/std@0.224.0/path/mod.ts";

//optional for utils
import { shaderPlugin } from './utils/threeJS_utils.ts';
// import { transformVariousFiles } from './utils/threeJS_utils.ts';
async function checkNodeModules() {
  const node_modules_path = join(Deno.cwd(), "node_modules");
  try {
    const stats = await Deno.stat(node_modules_path);
    if (!stats.isDirectory()) {
      console.error("node_modules is not a directory.");
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error("node_modules directory not found. Please install dependencies.");
    } else {
      console.error("Error checking node_modules:", error);
    }
  }
}

export async function transformTS(changedFiles: Set<string> | null = null, isProd: boolean = false) {
  if (import.meta.main) {
    await checkNodeModules();
  }
  // console.log(`Starting TS ${isProd ? "production" : "development"} bundling...`);
  const srcPath = "./src/ts";
  const distPath = isProd ? "./prod/js" : "./dist/js";

  await Deno.mkdir(distPath, { recursive: true });
  const entryPoints = [];
  for await (const entry of walk(srcPath, { 
    exts: [".ts", ".shader", ".vert", ".glsl", ".frag"], 
    skip: [/\.d\.ts$/] 
  })) {
    const relativePath = relative(Deno.cwd(), entry.path);
    entryPoints.push(relativePath);
  }

  try {
    // console.log(`Bundling ${entryPoints.length} TS files into ${distPath}...`);
    const result = await esbuild.build({
      entryPoints,                          // not sure if i need to add glob here, hoping it traverses/walks dir
      outdir: distPath,                     // dist/js
      bundle: true,                         // bundling hopefully work better
      format: "esm",                        // i didnt like there being empty space here
      splitting: true,                      // optional, may or may not work shaky results
      treeShaking: true,                    // optional,remove unused code
      minify: isProd,                       // minification for production
      plugins: [ shaderPlugin ],            // i didnt like there being empty space here
      pure: isProd ? ["console.log"] : []   // drop console.logs 
    });

    if (result.errors.length > 0) {
      console.error("TS transform failed:", result.errors);
      result.errors.forEach((error: { text: string }) => {
        if (error.text.includes("Could not resolve")) {
          const match = error.text.match(/Could not resolve "([^"]+)"/);
          if (match) {
            console.error(`Missing dependency: "${match[1]}". Run \`npm install ${match[1]}\`.`);
          }
        }
      });
    } else if (result.warnings.length > 0) {
      // console.warn("TS transform warnings:", result.warnings);
    } else {
      // console.log(`TS files transformed successfully in ${isProd ? "production" : "development"} mode.`);
    }
  } catch (err) {
    console.error("Error during TS bundling:", err);
  } finally {
    esbuild.stop();
  }

  // console.log(`TS ${isProd ? "production" : "development"} bundling complete.🎉`);
}


// export async function transformTS(changedFiles: Set<string> | null = null) {
//   if (import.meta.main) {
//   await checkNodeModules();
//   }
//   console.log("Starting TS bundling...");
//   const srcPath = "./src/ts";
//   const distPath = "./dist/js";

//   await Deno.mkdir(distPath, { recursive: true });
//   const entryPoints = [];
//   for await (const entry of walk(srcPath, { 
//     exts: [".ts", ".shader", ".vert", ".glsl", ".frag"], 
//     // exts: [".ts"], 
//     skip: [/\.d\.ts$/] 
//   })) 
//   {
//     const relativePath = relative(Deno.cwd(), entry.path);
//     entryPoints.push(relativePath);
//   }
//     try {
//       console.log(`Bundling ${entryPoints.length} TS files into ${distPath}...`);
//       //changed result to resolve with esbuild, better than deno's native bundling
//       const result = await esbuild.build({
//         entryPoints,           // not sure if i need to add glob here, hoping it traverses/walks dir
//         outdir: distPath,      // dist/js
//         bundle: true,          // bundling hopefully work better
//         format: "esm",       
//         splitting: true,       // optional, may or may not work shaky results
//         treeShaking: true,     // optional,remove unused code
//         plugins: [  shaderPlugin,]
//       });
//       // transformVariousFiles();
//       if (result.errors.length > 0) {
//         console.error("TS transform failed:", result.errors);
//         result.errors.forEach((error: { text: string }) => {
//           if (error.text.includes("Could not resolve")) {
//             const match = error.text.match(/Could not resolve "([^"]+)"/);
//             if (match) {
//               console.error(`Missing dependency: "${match[1]}". Run \`npm install ${match[1]}\`.`);
//             }
//           }
//         });
//       } else if (result.warnings.length > 0) {
//         console.warn("TS transform warnings:", result.warnings);
//       } else {
//         console.log("TS files transformed successfully.");
//       }
//     } catch (err) {
//       console.error("Error during TS bundling:", err);
//     } finally {
//       esbuild.stop(); // Clean up esbuild resources once
//     }
  
//     console.log("TS bundling complete.🎉");
//   }