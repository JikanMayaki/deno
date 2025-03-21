// deno-lint-ignore-file no-unused-vars
import { walk } from "https://deno.land/std/fs/mod.ts";
import { join, dirname, relative } from "https://deno.land/std/path/mod.ts";
import { transformAssets } from "./transformAssets.ts";
import { transformTS } from "./transformJS.ts";
import { transformSCSS } from "./transformSCSS.ts";
import { route, type Route } from "@std/http/unstable-route";
import { serveDir } from "@std/http/file-server";
import { open } from "https://deno.land/x/open/index.ts";

import { acceptWebSocket, isWebSocketCloseEvent } from "https://deno.land/std@0.65.0/ws/mod.ts?s=WebSocketEvent";

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
        listener.close();
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
async function copyStaticFiles(sourcePath: string, targetPath: string) {
    await Deno.mkdir("dist", { recursive: true });
    await Deno.copyFile("src/index.html", "dist/index.html");
    const maxRetries = 5;
    const retryDelay = 100; // milliseconds
    //search and traverse dir
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
            await copyStaticFiles(newSourcePath, newTargetPath);
          }
        }
      } catch (error) {
        console.error(`Error processing ${sourcePath}:`, error);
      }

      //attempt the write
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await Deno.copyFile("src/index.html", "dist/index.html");
      break; // Success, exit the loop
    } catch (error) {
      if (error instanceof Deno.errors.PermissionDenied && error.code === 32 && attempt < maxRetries) {
        console.log(`File locked, retrying (${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        throw error; // Re-throw if not a lock error or retries exhausted
      }
    }
  }
}
  async function build() {
    // await runBiome();
    // await compileSCSS();
    // await optimizeAssets();
    // await bundleJS();
    await copyStaticFiles(srcPath, distPath);
    console.log("Build successful. dinos have landed.");
  }

  build();

  async function serveStatic(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const filePath = `dist${url.pathname}`.replace(/\.\./g, "");
    
    try {
      const file = await Deno.open(filePath, { read: true });
      return new Response(file.readable);
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }
  async function createServer() {
    const availablePort = await findAvailablePort(port);
    Deno.serve(
      { port: availablePort,
        onListen({ port, hostname }) {
          console.log(`Server running from http://${hostname}:${port}`);
          open(`http://localhost:${port}`);
        },
      },
      async (req) => {
        const url = new URL(req.url);
        const pathname = url.pathname;
  
        // Check if the request is a WebSocket upgrade
        if (pathname === "/ws" && req.headers.get("upgrade") === "websocket") {
          const { socket, response } = Deno.upgradeWebSocket(req);
          socket.onopen = () => {
            wss.add(socket);
            console.log("WebSocket connected");
          };
          socket.onclose = () => wss.delete(socket);
          socket.onerror = () => wss.delete(socket);
          return response;
        }
  
        // Serve static files (including index.html for "/")
        return serveDir(req, { fsRoot: "dist" });
      }
    );
  }
  await build();
  await createServer();


  async function transformHTML() {
    console.log("Starting HTML file copying...");
    // console.log("Searching for HTML files in:", srcPath);
    for await (const entry of walk(srcPath, { exts: [".html"] })) {
      const srcFile = entry.path;
      const relativePath = relative(srcPath, srcFile);
      const distFile = join(distPath, relativePath);
      try {
        const srcStat = await Deno.stat(srcFile);
        let shouldCopy = true;
        let reason = "file does not exist in dist";
  
        try {
          const distStat = await Deno.stat(distFile);
          shouldCopy = srcStat.mtime > distStat.mtime; // if the file is in dist, check which is newer
          reason = shouldCopy ? "source is newer" : "not modified";
        } catch (err) {
          if (err instanceof Deno.errors.NotFound) {
            // console.log(`File not found in dist: ${distFile}`);
            shouldCopy = true;
          } else {
            throw err;
          }
        }
  
        if (shouldCopy) {
          await Deno.copyFile(srcFile, distFile);
          // console.log(`Copied ${srcFile} to ${distFile} (Reason: ${reason})`);
        } else {
          // console.log(`Skipped ${srcFile} (Reason: ${reason})`);
        }
      } catch (err) {
        console.error(`Error processing ${srcFile}:`, err);
      }
    }
    console.log("HTML file copying complete.");
  }
const watcher = Deno.watchFs(["src", "assets"], { recursive: true });
for await (const event of watcher) {
  console.log("Change detected, rebuilding...");
  await build();
  
  wss.forEach(ws => {

    if (ws.readyState === WebSocket.OPEN) {
    //   ws.send(encoder.encode("reload"));
    ws.send("reload");
    }
  });
}

