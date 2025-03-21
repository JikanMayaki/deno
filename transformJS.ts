import { walk } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { basename, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { bundle } from "jsr:@deno/emit";

export async function transformTS() {
  console.log("Starting TS bundling...");
  const srcPath = "./src/ts";
  const distPath = "./dist/js";

  await Deno.mkdir(distPath, { recursive: true });

  for await (const entry of walk(srcPath, { exts: [".ts"] })) {
    const srcFile = entry.path;
    const filename = basename(srcFile);
    const filenameWithJsExt = filename.replace(".ts", ".js");
    const distFile = join(distPath, filenameWithJsExt);

    try {
      console.log(`Bundling ${srcFile} into ${distFile}...`);
      
      const result = await bundle(srcFile);
      await Deno.writeTextFile(distFile, result.code);
      
      console.log(`Successfully bundled ${srcFile} into ${distFile}`);
    } catch (err) {
      console.error(`Error processing ${srcFile}:`, err);
    }
  }
  console.log("TS bundling complete.");
}
