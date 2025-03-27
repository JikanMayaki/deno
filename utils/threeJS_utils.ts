import { walk } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { denoLoaderPlugin } from "https://deno.land/x/esbuild_deno_loader/mod.ts";
import { basename, join, relative } from "https://deno.land/std@0.224.0/path/mod.ts";
import * as esbuild from "https://deno.land/x/esbuild@v0.25.1/mod.js";
import { isAbsolute, resolve } from "https://deno.land/std@0.224.0/path/mod.ts";
// async function checkNodeModules() {
//     const node_modules_path = join(Deno.cwd(), "node_modules");
//     try {
//       const stats = await Deno.stat(node_modules_path);
//       if (!stats.isDirectory()) {
//         console.error("node_modules is not a directory.");
//       }
//     } catch (error) {
//       if (error.code === "ENOENT") {
//         console.error("node_modules directory not found. Please install dependencies.");
//       } else {
//         console.error("Error checking node_modules:", error);
//       }
//     }
//   }
// Custom esbuild plugin for shader files
export const shaderPlugin = {
  name: 'shader-loader',
  setup(build) {
    // Handle .shader, .vert, and .glsl files
    build.onLoad({ filter: /\.(shader|vert|glsl)$/ }, async (args) => {
      try {
        // Read the shader file content
        const source = await Deno.readTextFile(args.path);
        
        // Export the shader as a string
        const contents = `export default ${JSON.stringify(source)};`;
        
        return {
          contents,
          loader: 'js' // Treat it as JavaScript module
        };
      } catch (error) {
        return {
          errors: [{
            text: `Failed to load shader file: ${error.message}`
          }]
        };
      }
    });
  }
};

// export async function transformVariousFiles(changedFiles: Set<string> | null = null) {
//     if (import.meta.main) {
//       await checkNodeModules();
//     }
//     console.log("Starting miscellanous bundling...");
//     const srcPath = "./src/ts";
//     const distPath = "./dist/js";
  
//     await Deno.mkdir(distPath, { recursive: true });
//     const entryPoints = [];
    
//     // Add shader files to entry points along with .ts files
//     for await (const entry of walk(srcPath, { 
//       exts: [".shader", ".vert", ".glsl", ".frag"], 
//       skip: [/\.d\.ts$/] 
//     })) {
//       const relativePath = relative(Deno.cwd(), entry.path);
//       entryPoints.push(relativePath);
//     }
  
//     try {
//       console.log(`Bundling ${entryPoints.length} files into ${distPath}...`);
//       const result = await esbuild.build({
//         entryPoints,
//         outdir: distPath,
//         bundle: true,
//         format: "esm",
//         splitting: true,
//         treeShaking: true,
//         plugins: [
//           shaderPlugin, 
//           denoLoaderPlugin({
//             nodeModulesDir: true
//           })
//         ]
//       });
  
//       if (result.errors.length > 0) {
//         console.error("Transform failed:", result.errors);
//         result.errors.forEach((error: { text: string }) => {
//           if (error.text.includes("Could not resolve")) {
//             const match = error.text.match(/Could not resolve "([^"]+)"/);
//             if (match) {
//               console.error(`Missing dependency: "${match[1]}". Run \`npm install ${match[1]}\`.`);
//             }
//           }
//         });
//       } else if (result.warnings.length > 0) {
//         console.warn("Transform warnings:", result.warnings);
//       } else {
//         console.log("Files transformed successfully.");
//       }
//     } catch (err) {
//       console.error("Error during bundling:", err);
//     } finally {
//       esbuild.stop();
//     }
  
//     console.log("Bundling complete.🎉");
//   }

//other three shader use
// import vertexShader from './shaders/myShader.vert';
// import fragmentShader from './shaders/myShader.frag';

// // Use in Three.js
// const material = new THREE.ShaderMaterial({
//   vertexShader: vertexShader,
//   fragmentShader: fragmentShader
// });