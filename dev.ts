// deno-lint-ignore-file no-unused-vars
import { walk } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join, relative } from "https://deno.land/std@0.224.0/path/mod.ts";
import { Application, send } from "https://deno.land/x/oak/mod.ts";
import { transformAssets } from "./transformAssets.ts";
import { transformTS } from "./transformJS.ts";
import { transformSCSS } from "./transformSCSS.ts";
import { route, type Route } from "@std/http/unstable-route";
import { open } from "https://deno.land/x/open@v1.0.0/index.ts";
import * as path from 'npm:path';
import posthtml from "npm:posthtml";
import include from "npm:posthtml-include";

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

async function copyStaticFiles(sourcePath: string, targetPath: string) {
  await Deno.mkdir(targetPath, { recursive: true });
  try {
  for await (const entry of Deno.readDir(sourcePath)) {
    const srcPath = `${sourcePath}/${entry.name}`;
    let newDirName = entry.name;
    
    if (targetPath.startsWith("./dist")) {
      if (newDirName === "scss") newDirName = "css";
      if (newDirName === "ts") newDirName = "js";
    }
    
    const newTargetPath = `${targetPath}/${newDirName}`;
    
    if (entry.isDirectory) {
      await copyStaticFiles(srcPath, newTargetPath);
    } else if (entry.name === "index.html") {
      await Deno.copyFile(srcPath, newTargetPath);
    }
  }
    } catch (error) {
    console.error(`Error processing ${sourcePath}:`, error);
  }
}

async function build() {
  await Deno.mkdir(distPath, { recursive: true });
  await transformHTML();
  await copyStaticFiles(srcPath, distPath);
  console.log("Build successful. dinos have landed.");
}

async function createServer() {
  const availablePort = await findAvailablePort(port);
  const app = new Application();
  app.use(async (ctx: { request: { url: { pathname: string } }; isUpgradable: any; upgrade: () => any }, next: () => any) => {
    if (ctx.request.url.pathname === "/ws") {
      if (ctx.isUpgradable) {
        const socket = await ctx.upgrade();
        socket.onopen = () => {
          wss.add(socket);
          console.log("WebSocket connected");
        };
        socket.onclose = () => wss.delete(socket);
        socket.onerror = () => wss.delete(socket);
        return; 
      }
    }
    await next();
  });
  app.use(async (ctx: { request: { url: { pathname: any } } }) => {
    await send(ctx, ctx.request.url.pathname, {
      root: distPath,
      index: "index.html", // Serve index.html by default
    });
  });
  app.addEventListener("listen", ({ hostname, port }) => {
    console.log(`Dinos have landed. http://${hostname}:${port}`);
  });

  await app.listen({ port: availablePort });
//   Deno.serve({
//     port: availablePort,
//     onListen({ hostname, port }) {
//       console.log(`Dinos have landed. http://${hostname}:${port}`);
//     }
//   }, async (req) => {
//     const url = new URL(req.url);
    
//     if (url.pathname === "/ws") {
//       const { socket, response } = Deno.upgradeWebSocket(req);
//       socket.onopen = () => {
//         wss.add(socket);
//         console.log("WebSocket connected");
//       };
//       socket.onclose = () => wss.delete(socket);
//       socket.onerror = () => wss.delete(socket);
//       return response;
//     }
    
//     return await serveDir(req, { fsRoot: distPath });
//   });
}

async function transformHTML() {
  console.log("Starting HTML file copying...");
  for await (const entry of walk(srcPath, { exts: [".html"] })) {
    const srcFile = entry.path;
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
        let htmlContent = await Deno.readTextFile(srcFile);
        // partial handling
        const result = await posthtml([
          include({
            root: join(srcPath, './partials'), // Where partials are stored
            onError: (error: Error) => {
              console.error(`Error including partial: ${error.message}`);
            }
          })
        ]).process(htmlContent);
        
        htmlContent = result.html;
        // Replace file extensions and paths
        htmlContent = htmlContent
          .replace(/\.scss/g, ".css")
          .replace(/\.\/scss\//g, "./css/")
          .replace(/\.ts/g, ".js")
          .replace(/\.\/ts\//g, "./js/");
        
        // Write the transformed content
        await Deno.writeTextFile(distFile, htmlContent);
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
  for await (const _event of watcher) {
    console.log("Change detected, rebuilding...");
    await build();
    wss.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("reload");
      }
    });
  }
}

main().catch(console.error);
