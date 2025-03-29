export function startDinoAnimation(isProd: boolean = false) { 
    const dinoRight = [
      "               __",
      "              / _)",
      "     _.----._/ /",
      "    /         /",
      " __/ (  | (  |",
      "/__.-'|_|--|_|",
    ];
  
    const dinoLeft = [
      " __",
      "(_ \\",
      "  \\ \\_.----._",
      "   \\         \\",
      "    |  ) |  ) \\__",
      "    |_|--|_|'-.__\\",
    ];
  
    let offset = 0;
    let movingRight = true;
    let statusMessage = "prod:";
    let isRunning = true;
    let completedTasks: string[] = [];
    const buildLabel = isProd ? "prod:" : "dist:";

    const interval = setInterval(() => {
      if (!isRunning) return;

      console.clear();

      // Print stationary build status on the left
      process.stdout.write(`   ${buildLabel}   ${completedTasks.join(" ")}\n`);

      // Draw Dino with movement
      const dino = movingRight ? dinoRight : dinoLeft;
      dino.forEach(line => console.log(" ".repeat(offset) + line));

      // Dino Movement Logic
      if (movingRight) {
          offset++;
          if (offset > 30) movingRight = false;
      } else {
          offset--;
          if (offset <= 0) movingRight = true;
      }
  }, 100);

  function updateStatusMessage(newMessage: string) {
      completedTasks.push(`  ✔️  ${newMessage}`);
  }

  function stopAnimation() {
      isRunning = false;
      clearInterval(interval);
      console.clear();

      // Keep the dino visible and display final build message
      process.stdout.write(`   ${buildLabel}   ${completedTasks.join(" ")}\n`);
      const dino = movingRight ? dinoRight : dinoLeft;
      dino.forEach(line => console.log(" ".repeat(offset) + line));
      console.log(`\n✅  ${buildLabel}  build complete!`);
  }

  return { stopAnimation, updateStatus: updateStatusMessage };
}
