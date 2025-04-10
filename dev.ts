// deno-lint-ignore-file no-unused-vars
import { ensureDir, walk } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { dirname, join, relative , resolve} from "https://deno.land/std@0.224.0/path/mod.ts";
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
import { transformHTML } from "./transformHTML.ts";

const { stopAnimation, updateStatus } = startDinoAnimation(false);
let currentWatcher: Deno.FsWatcher | null = null;
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
    await transformHTML( changedFiles);
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
  wss.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send("reload");
    }
  });
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
  setTimeout(() => {
    console.log(`Dinos have landed.🐱‍🐉 http://localhost:${availablePort}`);
  }, 50);
}


// async function startWatching() {
//   // clean up watch. if it already exists. swapped instead of truthy/falsy, just looking for a watcher to exist. 
//   if (currentWatcher) {
//     try {
//       currentWatcher.close();
//     } catch (e) {
//       console.error("Error closing watcher:", e);
//     }
//   }

//   // new watcher
//   // added timer, clear timer, call back watching func,trying to group it into a set buff, so we can group the items. add pending changes to buff
//   currentWatcher = Deno.watchFs(["src"], { recursive: true });
//   console.log("Started watching for changes in src directory...");
//   const pendingChanges = new Set<string>();
//   let debounceTimer: number | null = null;

//   for await (const event of currentWatcher) {
//     event.paths.forEach(path => pendingChanges.add(resolve(path))); // changed , normalize paths
//     if (debounceTimer !== null) {
//       clearTimeout(debounceTimer);
//     }

//     debounceTimer = setTimeout(async () => {
//       if (pendingChanges.size > 0) {
//         console.log("Change detected:" + `${event.kind}`);
//         await debouncedBuild(pendingChanges);
//         wss.forEach(ws => {
//           if (ws.readyState === WebSocket.OPEN) {
//             ws.send("reload");
//           }
//         });
//         pendingChanges.clear();
//         await startWatching();
//         return; 
//       }
//     }, 100); 
//   }
// }
// added timer, clear timer, call back watching func,trying to group it into a set buff, so we can group the items. add pending changes to buff
// clean up watch. if it already exists. swapped instead of truthy/falsy, just looking for a watcher to exist. 
// changed , got rid of one recursive call, was redundant and causing duplicates. 
async function startWatching() {
  if (currentWatcher) {
    try {
      currentWatcher.close();
    } catch (e) {
      console.error("Error closing watcher:", e);
    }
  }

  currentWatcher = Deno.watchFs(["src"], { recursive: true });
  console.log("Started watching for changes in src directory...");
  const pendingChanges = new Set<string>();

  for await (const event of currentWatcher) {
    // console.log("Raw event paths:", event.paths);
    event.paths.forEach(path => {
      const resolvedPath = resolve(path);
      console.log(`Adding path to pendingChanges: ${resolvedPath}`);
      pendingChanges.add(resolvedPath);
    });

    // console.log("Pending changes before debounce:", Array.from(pendingChanges));
    // Pass a copy of pendingChanges to debouncedBuild
    const changesToProcess = new Set(pendingChanges);
    debouncedBuild(changesToProcess);
    // Do not clear pendingChanges here; let it accumulate
  }
}

async function main(): Promise<void> {
  await build();
  await createServer();
  console.log("Watching for changes in src directory...");
  await startWatching();
  // await runBenches().catch((err) => console.error("Error:", err));
  //working watcher. old tho
  // const watcher = Deno.watchFs(["src"], { recursive: true });

  // for await (const event of watcher) {
  //   console.log(`Change detected: ${event.kind}`, event.paths);
  //   const changedFiles = new Set<string>(event.paths);
  //   await debouncedBuild(changedFiles);
  //   wss.forEach(ws => {
  //     if (ws.readyState === WebSocket.OPEN) {
  //       ws.send("reload");
  //     }
  //   });
  // }
}

main().catch(console.error);