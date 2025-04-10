async function runBiome() {
    // Start the Biome daemon using Deno.Command
    const startCommand = new Deno.Command("biome", {
      args: ["start"],
      stdout: "inherit",
      stderr: "inherit",
    });
    const startProcess = startCommand.spawn();
    const startStatus = await startProcess.status;
    if (!startStatus.success) {
      console.error("❌ Failed to start Biome daemon.");
      Deno.exit(1);
    }
  
    console.log("✅ Biome daemon started successfully.");
    // const status = await process.status();
    // process.close();
   ///we need to kill biome daemon, cmd is 'biome stop'
    // if (!status.success) {
    //   console.error("❌ Biome found issues in prod files.");
    //   Deno.exit(1);
    // }
    // Traverse the 'prod/' directory and lint files
    try {
      for await (const entry of walk("prod", { includeFiles: true, followSymlinks: true })) {
        if (entry.isFile) {
          const lintCommand = new Deno.Command("biome", {
            args: ["check", entry.path, "--files-ignore-unknown=true", "--write"],
            stdout: "inherit",
            stderr: "inherit",
          });
  
          const lintProcess = lintCommand.spawn();
          const lintStatus = await lintProcess.status;
  
          if (!lintStatus.success) {
            console.error(`❌ Biome found issues in file: ${entry.path}`);
            // Optionally, you can choose to exit or continue processing other files
            Deno.exit(1);
          } else {
            console.log(`✅ File passed: ${entry.path}`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error while traversing directory: ${error.message}`);
      Deno.exit(1);
    }
    // Stop the Biome daemon
    const stopProcess = stopCommand.spawn();
    const stopStatus = await stopProcess.status;
  
    if (!stopStatus.success) {
      console.error("❌ Failed to stop Biome daemon.");
      Deno.exit(1);
    }
    // const stopCommand = new Deno.Command("biome", {
    //   args: ["stop"],
    //   stdout: "inherit",
    //   stderr: "inherit",
    // });
    console.log("✅ Biome daemon stopped successfully.");
  }
  
  const debouncedBuild = debounce(async (changedFiles: Set<string>) => {
    console.log("Debounced build triggered with changes:", Array.from(changedFiles));    
    await build(changedFiles);
  }, 300);
  