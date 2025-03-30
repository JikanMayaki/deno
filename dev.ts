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
const { stopAnimation, updateStatus } = startDinoAnimation(false);
//defs
interface Server {
  finished: Promise<void>;
  shutdown(): Promise<void>;  // changed from close() to shutdown()
  addr: Deno.NetAddr;     
}
//globals
const port = 1234;
const srcPath = "./src";
const distPath = "./dist";

//state
const wss = new Set<WebSocket>();
// let server: typeof Deno.serve | null = null;
let server: Server | null = null;
async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  while (true) {
    try {
      const listener = Deno.listen({ port });
      await listener.close();
      return port; //moved return here instead of lower
    } catch (error) {
      if (error instanceof Deno.errors.AddrInUse) {
        port++;
        continue; //added continue
    
      } else {
        throw error;
      }
    }
  }
}

async function mirrorDirectoryStructure(sourcePath: string, targetPath: string): Promise<void>  {
  try {
    // lets check if dir is there. 
    await Deno.mkdir(targetPath, { recursive: true });

    for await (const entry of Deno.readDir(sourcePath)) {
      //just cleaned up syntax, shouldnt change func
      if (entry.isDirectory) {
        const newDirName = targetPath.startsWith("./dist")
          ? entry.name === "scss" ? "css" 
          : entry.name === "ts" ? "js" 
          : entry.name
          : entry.name;
          await mirrorDirectoryStructure(
            `${sourcePath}/${entry.name}`,
            `${targetPath}/${newDirName}`
          );
      // if (entry.isDirectory) {
      //   let newDirName = entry.name;
        
      //   // Change directory names for dist
      //   if (targetPath.startsWith("./dist")) {
      //     if (newDirName === "scss") newDirName = "css";
      //     if (newDirName === "ts") newDirName = "js";
      //   }
        // const newSourcePath = `${sourcePath}/${entry.name}`;
        // const newTargetPath = `${targetPath}/${newDirName}`;
        // await mirrorDirectoryStructure(newSourcePath, newTargetPath);
      }
    }
  } catch (error) {
    console.error(`Error processing ${sourcePath}:`, error);
  }
}


async function build(changedFiles: Set<string> | null = null) {
  await mirrorDirectoryStructure(srcPath, distPath);
  
  try {
    // updateStatus("🔧 building dist HTML...");
    await transformHTML(changedFiles);
    updateStatus("HTML");

    // updateStatus("⚙️  transpiling dist TypeScript...");
    await transformTS(changedFiles);
    updateStatus("JS");

    // updateStatus("🎨 compiling dist SCSS...");
    await transformSCSS(changedFiles);
    updateStatus("CSS");

    // updateStatus("📦 processing dist Assets...");
    await transformAssets(changedFiles);
    updateStatus("assets");

    stopAnimation();
  } catch (error) {
    stopAnimation();
    console.error("❌ error during dist build process:", error);
  }
}


const debouncedBuild = debounce(async (changedFiles: Set<string>) => {
  console.log("Debounced build triggered with changes:", Array.from(changedFiles));    
  await build(changedFiles);
}, 300);

async function createServer() : Promise<void> {
  if (server) {
    await server.shutdown(); 
    await server.finished;
  }
 const availablePort = await findAvailablePort(port);
//  server = Deno.serve({ port: availablePort }, async (req) => {
    server = Deno.serve({
      port: availablePort,
      onListen: ({ hostname, port }) => {
        // console.log(`Dinos have landed. http://${hostname}:${port}`);
      },
    }, async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const pathname = url.pathname;
  
    if (pathname === "/ws") {
      if (req.headers.get("upgrade") !== "websocket") {
        return new Response("Expected websocket", { status: 400 });
      }
      
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
  
    try {
      return await serveDir(req, {
        fsRoot: distPath,
        showDirListing: false,
        quiet: true,
      });
    } catch (error) {
      console.error(`Error serving ${pathname}:`, error);
      return new Response("Not Found", { status: 404 });
    }
  });
  console.log(`Dinos have landed.🐱‍🐉 http://localhost:${availablePort}`);
}

async function transformHTML(changedFiles: Set<string> | null = null) {
  for await (const entry of walk(srcPath, { exts: [".html"] })) {
    const srcFile = entry.path;
    if (changedFiles && !changedFiles.has(srcFile)) continue;
    const relativePath = relative(srcPath, srcFile);
    const distFile = join(distPath, relativePath);

    const srcStat = await Deno.stat(srcFile);
    const shouldCopy = await (async () => {
      try {
        const distStat = await Deno.stat(distFile);
        return !distStat.mtime || (srcStat.mtime && srcStat.mtime > distStat.mtime);
      } catch (err) {
        return err instanceof Deno.errors.NotFound;
      }
    })();

    if (!shouldCopy) continue;
    await Deno.mkdir(join(distPath, relativePath, ".."), { recursive: true });
    let content = await Deno.readTextFile(srcFile);

    const result = await posthtml([
      include({
        root: srcPath,
        onError: (error: Error) => console.error(`Error including partial: ${error.message}`),
      }),
    ]).process(content);

    content = result.html;

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
    
    content = content.replace(/<\/body>/, `${webSocketScript}\n</body>`);

    const transformedContent = content
      .replace(/(?<=href="|src=")(.+\/)?scss\/(.+?)\.scss/g, "$1css/$2.css")
      .replace(/(?<=href="|src=")(.+\/)?ts\/(.+?)\.ts/g, "$1js/$2.js")
      .replace(/(?<=href="|src=")\.\.\/assets\//g, "./assets/")
      .replace(/(?<=href="|src=")(.+\/)scss\//g, "$1css/")
      .replace(/(?<=href="|src=")(.+\/)ts\//g, "$1js/");

    await Deno.writeTextFile(distFile, transformedContent);
    console.log(`Processed and copied ${srcFile} to ${distFile}`);
  }
}


async function main(): Promise<void> {
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