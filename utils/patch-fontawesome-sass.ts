// this script is to patch the myriad of problems with font awesome scss files without manually having to fix every repository. 


import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { resolve } from "https://deno.land/std@0.224.0/path/mod.ts";
// import sass from "https://deno.land/x/denosass@1.0.6/mod.ts";

// Configuration
const KIT_CODE = "41423f075f"; // replace with kit code
const SOURCE_DIR = resolve(`node_modules/@awesome.me/kit-${KIT_CODE}/icons/scss`);
const TARGET_DIR = resolve("src/scss/fontawesome"); // going to store migrated sass here, so if running deno update or new version of fontawesome, these can be ported over

// List of SCSS files to process 
const SCSS_FILES = ["fontawesome.scss", "solid.scss", "regular.scss", "brands.scss", "thin.scss", "_functions.scss", "_mixins.scss", "_shims.scss", "_core.scss"];

// util for shell
async function runCommand(cmd: string[]): Promise<void> {
    const command = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdout: "inherit", // Inherit stdout to see output in console
      stderr: "inherit", // Inherit stderr to see errors in console
    });
    const { success, code } = await command.output();
    if (!success) {
      throw new Error(`Command failed with code ${code}: ${cmd.join(" ")}`);
    }
  }

// ensure output and temp directories exist
async function setupDirectories(): Promise<void> {
    await ensureDir(TARGET_DIR);
  }

// deps
async function installDependencies(): Promise<void> {
  console.log("Installing npm dependencies...");
  await runCommand(["deno", "install", `npm:sass-migrator`]);
  await runCommand(["deno", "install", `npm:@awesome.me/kit-${KIT_CODE}@latest`]);
}

// patch scss files present (make sure to install first!)
async function patchScssFiles(): Promise<void> {
    console.log("Patching SCSS files...");
    for (const file of SCSS_FILES) {
      const sourcePath = resolve(SOURCE_DIR, file);
      const targetPath = resolve(TARGET_DIR, file);
      try {
        // Copy the original SCSS file to the target directory
        await Deno.copyFile(sourcePath, targetPath);
        console.log(`Copied ${file} to ${TARGET_DIR}`);
  
        // Run sass-migrator on the copied file in place
        await runCommand([
          "npx",
          "sass-migrator",
          "module", // Adjust migration type as needed (e.g., "division", "color")
          "--migrate-deps",
          targetPath,
        ]);
        console.log(`Migrated ${file} to remove deprecations`);
      } catch (error) {
        console.warn(`Skipping ${file} - ${error.message}`);
      }
    }
  }
  

// main func
export async function patchfontAwesome(): Promise<void> {
    try {
      await setupDirectories();
      await installDependencies();
      await patchScssFiles();
      console.log("FontAwesome SCSS patching completed successfully!");
      console.log(`Patched SCSS files are now in ${TARGET_DIR}`);
    } catch (error) {
      console.error("Patching failed:", error.message);
      Deno.exit(1);
    }
  }

  if (import.meta.main) {
    await patchfontAwesome();
  }