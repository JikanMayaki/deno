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
import { encoder } from 'https://deno.land/std@0.65.0/encoding/utf8.ts'

const port = 1234;
const wss = new Set<WebSocket>();
const srcPath = "./src";
const distPath = "./dist";

async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  while (true) {
    try {
      const listener = Deno.listen({ port });
      await listener.close();
      return port;
    } catch (error) {
      if (error instanceof Deno.errors.AddrInUse) {
        port++;
      } else {
        throw error;
      }
    }
  }
}

async function mirrorDirectoryStructure(sourcePath: string, targetPath: string) {
  try {
    // Ensure the target directory exists
    await Deno.mkdir(targetPath, { recursive: true });

    for await (const entry of Deno.readDir(sourcePath)) {
      if (entry.isDirectory) {
        let newDirName = entry.name;
        
        // Change directory names for dist
        if (targetPath.startsWith("./dist")) {
          if (newDirName === "scss") newDirName = "css";
          if (newDirName === "ts") newDirName = "js";
        }

        const newSourcePath = `${sourcePath}/${entry.name}`;
        const newTargetPath = `${targetPath}/${newDirName}`;
        await mirrorDirectoryStructure(newSourcePath, newTargetPath);
      }
    }
  } catch (error) {
    console.error(`Error processing ${sourcePath}:`, error);
  }
}

async function build(changedFiles: Set<string> | null = null) {
  await mirrorDirectoryStructure(srcPath, distPath);

  try {
    await transformHTML(changedFiles);
    await transformAssets(changedFiles);
    await transformTS(changedFiles);
    await transformSCSS(changedFiles);
    console.log("_______________________________  build complete");
  } catch (error) {
    console.error("Error during build process:", error);
  }
}

const debouncedBuild = debounce(async (changedFiles: Set<string>) => {
  console.log("Debounced build triggered with changes:", Array.from(changedFiles));
  await build(changedFiles);
}, 300);

async function createServer() {
  const availablePort = await findAvailablePort(port);

  const wss = new Set<WebSocket>(); // Assuming this is defined globally in your script

  const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Handle WebSocket upgrade
    if (pathname === "/ws") {
      const { socket, response } = Deno.upgradeWebSocket(req);
      socket.onopen = () => {
        wss.add(socket);
        console.log("WebSocket connected");
      };
      socket.onclose = () => {
        wss.delete(socket);
        console.log("WebSocket disconnected");
      };
      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        wss.delete(socket);
      };
      return response;
    }

    // Serve static files from distPath
    try {
      return await serveDir(req, {
        fsRoot: distPath,
        showDirListing: false,
        quiet: true, // Suppresses default logging; remove if you want file serving logs
      });
    } catch (error) {
      console.error(`Error serving ${pathname}:`, error);
      return new Response("Not Found", { status: 404 });
    }
  };

  // Start the server
  Deno.serve({ port: availablePort, handler }, (info) => {
    console.log(`Dinos have landed. http://${info.hostname}:${info.port}`);
  });

  return wss; // Return wss so it can be used elsewhere (optional)
}


async function transformHTML(changedFiles: Set<string> | null = null) {
  console.log("Starting HTML file copying...");
  for await (const entry of walk(srcPath, { exts: [".html"] })) {
    const srcFile = entry.path;
    if (changedFiles && !changedFiles.has(srcFile)) continue;
    const relativePath = relative(srcPath, srcFile);
    const distFile = join(distPath, relativePath);
    
    try {
      const srcStat = await Deno.stat(srcFile);
      let shouldCopy = true;
      
      try {
        const distStat = await Deno.stat(distFile);
        shouldCopy = srcStat.mtime! > distStat.mtime!;
      } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) throw err;
      }
      
      if (shouldCopy) {
        await Deno.mkdir(join(distPath, relativePath, ".."), { recursive: true });
        // read dir
       let content = await Deno.readTextFile(srcFile);
        // partial handling
        const result = await posthtml([
          include({
            root: './src', // Where partials are stored
            onError: (error: Error) => {
              console.error(`Error including partial: ${error.message}`);
            }
          })
        ]).process(content);
        content = result.html;
        // replace paths
        const transformedContent = content
        .replace(/(?<=href="|src=")\.?\/(scss|ts)\//g, "./$1/")
        .replace(/(?<=href="|src=")\.\/(scss)\//g, "./css/")
        .replace(/(?<=href="|src=")\.\/(ts)\//g, "./js/")
        .replace(/(?<=href="|src=")(.+)\.scss/g, "$1.css")
        .replace(/(?<=href="|src=")(.+)\.ts/g, "$1.js")
        .replace(/(?<=href="|src=")\.\.\/assets\//g, "./assets/");
        // Write the transformed content
        await Deno.writeTextFile(distFile, transformedContent);
        console.log(`Processed and copied ${srcFile} to ${distFile}`);
      }
    } catch (err) {
      console.error(`Error processing ${srcFile}:`, err);
    }
  }
  console.log("HTML file copying complete.");
}


async function main() {
  await build();
  await createServer();
  
  const watcher = Deno.watchFs(["src"], { recursive: true });
  console.log("Watching for changes in src directory...");
  for await (const event of watcher) {
    console.log(`Change detected: ${event.kind}`, event.paths);
    const changedFiles = new Set<string>(event.paths);
    await debouncedBuild(changedFiles);
    wss.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("reload");
      }
    });
  }
}

main().catch(console.error);
