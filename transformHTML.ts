// transformHTML.ts
import { walk } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { resolve, join, relative, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import posthtml from "npm:posthtml";
import include from "npm:posthtml-include";

const srcPath = "./src";
let distPath = "./dist";

const htmlDependencyMap: Map<string, Set<string>> = new Map();
let depMapBuilt = false;

async function getAllHTMLFiles(srcPath: string): Promise<string[]> {
  const files: string[] = [];
  try {
    for await (const entry of walk(srcPath, { exts: [".html"] })) {
      files.push(entry.path);
    }
  } catch (err) {
    console.error("Error getting all HTML files:", err);
  }
  console.log("getAllHTMLFiles found:", files);
  return files;
}

async function buildHTMLDependencyMap(srcPath: string, changedFiles: Set<string> | null = null) {
    // If changedFiles is provided, only rebuild if an HTML file (not a partial) changed
    if (changedFiles) {
      let needsRebuild = false;
      for (const file of changedFiles) {
        if (file.endsWith(".html") && !file.includes("/partials/")) {
          needsRebuild = true;
          break;
        }
      }
      if (!needsRebuild && depMapBuilt) {
        console.log("No HTML files changed, skipping dependency map rebuild.");
        return;
      }
    }
  
    htmlDependencyMap.clear(); // Clear to support rebuilding map
    try {
        for await (const entry of walk(srcPath, { exts: [".html"] })) { 
        const file = entry.path;
        let content = "";
        try {
          content = await Deno.readTextFile(file);
        } catch (err) {
          console.error(`Error reading file ${file}:`, err);
          continue;
        }
        const includeRegex = /<include\s+src=["'](.+?)["']/gi;
        let match;
        while ((match = includeRegex.exec(content)) !== null) {
          const includePath = resolve(dirname(file), match[1]);
          const normalizedFile = resolve(file);
          if (!htmlDependencyMap.has(includePath)) {
            htmlDependencyMap.set(includePath, new Set());
          }
          htmlDependencyMap.get(includePath)!.add(normalizedFile);
        //   console.log(`Mapping dependency: ${includePath} -> ${normalizedFile}`);
        }
      }
    } catch (err) {
      console.error("Error building HTML dependency map:", err);
    }
    depMapBuilt = true;
    // console.log("Dependency map built:", [...htmlDependencyMap.entries()]);
  }

// async function buildHTMLDependencyMap(srcPath: string) {
//   htmlDependencyMap.clear(); // Clear to support rebuilding map
//   try {
//     for await (const entry of walk(srcPath, { exts: [".html"] })) {
//       const file = entry.path;
//       let content = "";
//       try {
//         content = await Deno.readTextFile(file);
//       } catch (err) {
//         console.error(`Error reading file ${file}:`, err);
//         continue;
//       }
//       const includeRegex = /<include\s+src=["'](.+?)["']/gi;
//       let match;
//       while ((match = includeRegex.exec(content)) !== null) {
//         const includePath = resolve(srcPath, match[1]);
//         if (!htmlDependencyMap.has(includePath)) {
//           htmlDependencyMap.set(includePath, new Set());
//         }
//         htmlDependencyMap.get(includePath)!.add(resolve(file));
//         console.log(`Mapping dependency: ${includePath} -> ${file}`);
//       }
//     }
//   } catch (err) {
//     console.error("Error building HTML dependency map:", err);
//   }
//   depMapBuilt = true;
//   console.log("Dependency map built:", [...htmlDependencyMap.entries()]);
// }

// changed, added this function to get a partials object, then return it. because it is not reading the partials as a group. 
async function getIncludedPartials(file: string, visited: Set<string> = new Set()): Promise<Set<string>> {
    const partials = new Set<string>();
    if (visited.has(file)) return partials; // Avoid infinite loops for circular includes
    visited.add(file);
  
    let content = "";
    try {
      content = await Deno.readTextFile(file);
    } catch (err) {
      console.error(`Error reading file ${file}:`, err);
      return partials;
    }
  
    const includeRegex = /<include\s+src=["'](.+?)["']/gi;
    let match;
    while ((match = includeRegex.exec(content)) !== null) {
      const includePath = resolve(dirname(file), match[1]);
      partials.add(includePath);
      // Recursively find nested includes
      const nestedPartials = await getIncludedPartials(includePath, visited);
      nestedPartials.forEach(partial => partials.add(partial));
    }
  
    return partials;
  }


export async function transformHTML( changedFiles: Set<string> | null = null, isProd: boolean = false ) {
    distPath = isProd ? "./prod" : "./dist";
    //slight change to normalize , changed
    const normalizedChangedFiles = changedFiles
    ? new Set([...changedFiles].map(file => resolve(file)))
    : null;

    console.log("Building dependency map...");
    await buildHTMLDependencyMap(srcPath,normalizedChangedFiles);
    // console.log("Changed files received:", [...(normalizedChangedFiles ?? [])]); //changed

    const filesToRebuild = new Set<string>();
    // changed , using normalized files with map that is all that is diff. 
    if (normalizedChangedFiles) {
        for (const file of normalizedChangedFiles) {
          filesToRebuild.add(file);
          console.log(`Added changed file: ${file}`);
    
          const dependents = htmlDependencyMap.get(file);
          if (dependents) {
            for (const dep of dependents) {
              filesToRebuild.add(dep);
              console.log(`Added dependent file: ${dep} (because ${file} changed)`);
            }
          } else {
            console.log(`No dependents found for: ${file}`);
          }
        }
      }
    // if (changedFiles) {
    //     for (const file of changedFiles) {
    //     const normalizedFile = resolve(file);
    //     filesToRebuild.add(normalizedFile);
    //     console.log(`Added changed file: ${normalizedFile}`);

    //     const dependents = htmlDependencyMap.get(normalizedFile);
    //     if (dependents) {
    //         for (const dep of dependents) {
    //         filesToRebuild.add(dep);
    //         console.log(`Added dependent file: ${dep} (because ${normalizedFile} changed)`);
    //         }
    //     } else {
    //         console.log(`No dependents found for: ${normalizedFile}`);
    //     }
    //     }
    // }

    const filesToProcess = changedFiles ? [...filesToRebuild] : await getAllHTMLFiles(srcPath);
    console.log("Files to process:", filesToProcess);

    for (const srcFile of filesToProcess) {
    // changed , skip partial since it is included in posthtml func already (? might be overkill)
    if (srcFile.includes("/partials/")) {
        // console.log(`Skipping partial file: ${srcFile}`);
        continue;
    }
    const relativePath = relative(srcPath, srcFile);
    const distFile = join(distPath, relativePath);
    const srcStat = await Deno.stat(srcFile);
    const includedPartials = await getIncludedPartials(srcFile); //changed this, to look for partials included and our object
  // changed, Check if any included partials are in changedFiles
    let partialChanged = false;
    if (normalizedChangedFiles) {
        for (const partial of includedPartials) {
        if (normalizedChangedFiles.has(partial)) {
            partialChanged = true;
            break;
        }
        }
    }
//changed
    const forceRebuild = normalizedChangedFiles && (filesToRebuild.has(srcFile) || partialChanged);

    const shouldCopy =
    forceRebuild ||
    (await (async () => {
      try {
        const distStat = await Deno.stat(distFile);
        return !distStat.mtime || (srcStat.mtime && srcStat.mtime > distStat.mtime);
      } catch (err) {
        return err instanceof Deno.errors.NotFound;
      }
    })());

    if (!shouldCopy) {
      console.log(`Skipping ${srcFile} does not need copy.`);
      continue;
    }

    try {
      await Deno.mkdir(join(distPath, relativePath, ".."), { recursive: true });
    } catch (err) {
      console.error(`Error creating directory for ${distFile}:`, err);
      continue;
    }

    let content = "";
    try {
      content = await Deno.readTextFile(srcFile);
    } catch (err) {
      console.error(`Error reading ${srcFile}:`, err);
      continue;
    }

    let result;
    try {
      result = await posthtml([
        include({
          root: srcPath,
          onError: (error: Error) =>
            console.error(`Error including partial in ${srcFile}: ${error.message}`),
        }),
      ]).process(content);
    } catch (err) {
      console.error(`Error processing posthtml for ${srcFile}:`, err);
      continue;
    }

    content = result.html;

    if (isProd) {
        content = content.replace(/<!--[\s\S]*?-->/g, ""); // rm comments
        content = content.replace(/^\s*[\r\n]/gm, ""); // rm empty lines
    }

    const webSocketScript = `
        <script>
        const ws = new WebSocket(\`ws://localhost:\${location.port}/ws\`);
        
        ws.onmessage = (event) => {
            if (event.data === "reload") {
                location.reload();
            }
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        ws.onclose = () => {
            console.log('WebSocket connection closed');
        };
        
        ws.onopen = () => {
            console.log('WebSocket connection established');
        };
        </script>
        `;

    if (!isProd) {
        content = content.replace(/<\/body>/, `${webSocketScript}\n</body>`);
    }

    const transformedContent = content
      .replace(/(?<=href="|src=")(.+\/)?scss\/(.+?)\.scss/g, "$1css/$2.css")
      .replace(/(?<=href="|src=")(.+\/)?ts\/(.+?)\.ts/g, "$1js/$2.js")
      .replace(/(?<=href="|src=")\.\.\/assets\//g, "./assets/")
      .replace(/(?<=href="|src=")(.+\/)scss\//g, "$1css/")
      .replace(/(?<=href="|src=")(.+\/)ts\//g, "$1js/");

    try {
      await Deno.writeTextFile(distFile, transformedContent);
      console.log(`Processed and copied ${srcFile} to ${distFile}`);
    } catch (err) {
      console.error(`Error writing file ${distFile}:`, err);
    }
  }
}
