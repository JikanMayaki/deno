// deno-lint-ignore-file
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { writeAll } from "https://deno.land/std@0.184.0/streams/write_all.ts";
import lighthouse from "npm:lighthouse";
import * as chromeLauncher from "npm:chrome-launcher";


const SITE_URL = "http://localhost:1234"; //might actually need our port stuff here
const REPORTS_DIR = "reports"; //reports dir can be anything


namespace lighthouse {
    export type Flags = {} & any;
}
// Function to run Lighthouse and get results
async function runLighthouse(url: string) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless"] });
  const options: lighthouse.Flags =  {
    logLevel: "info",
    output: "json",
    onlyCategories: ["performance"],
    port: chrome.port,
  };

  const runnerResult = await lighthouse(url, options );
 // chrome dont like to b bothered error catch block
 let attempts = 0;
 const maxAttempts = 5;
 while (attempts < maxAttempts) {
   try {
     await chrome.kill();
     break;
   } catch (err) {
     if (err.code === "EBUSY") {
       console.warn(`Chrome cleanup failed (attempt ${attempts + 1}/${maxAttempts}), retrying...`);
       await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s
       attempts++;
     } else {
       throw err; // Rethrow non-EBUSY errors
     }
   }
 }
 if (attempts === maxAttempts) {
   console.error("Failed to clean up Chrome after max attempts.");
 }

 return runnerResult!.lhr; 
}
// deno bench
async function runDenoBench() {
  const benchCommand = new Deno.Command("deno", {
    args: ["bench", "--allow-all", "benchmarks/example_bench.ts"],
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout, stderr } = await benchCommand.output();
  const decoder = new TextDecoder();
  return {
    output: decoder.decode(stdout),
    error: decoder.decode(stderr),
  };
}

// html report for dev. the values are in seconds not mins
function generateHtmlReport(lighthouseResult: any, benchResult: any): string {
  const performanceScore = lighthouseResult.categories.performance.score * 100;
  const fcp = lighthouseResult.audits["first-contentful-paint"].numericValue / 1000; 
  const tti = lighthouseResult.audits["interactive"].numericValue / 1000;
  const lcp = lighthouseResult.audits["largest-contentful-paint"].numericValue / 1000; 

  // color in code 
  const scoreColor = performanceScore >= 90 ? "green" : performanceScore >= 50 ? "orange" : "red";
  const fcpColor = fcp <= 1.8 ? "green" : fcp <= 3 ? "orange" : "red";
  const ttiColor = tti <= 5 ? "green" : tti <= 10 ? "orange" : "red";
  const lcpColor = lcp <= 2.5 ? "green" : lcp <= 4 ? "orange" : "red";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Performance Test Report - ${new Date().toLocaleString()}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .metric { margin: 10px 0; }
        .score { font-weight: bold; }
        .green { color: green; }
        .orange { color: orange; }
        .red { color: red; }
        pre { background: #f4f4f4; padding: 10px; }
      </style>
    </head>
    <body>
      <h1>Performance Test Report</h1>
      <h2>Lighthouse Results</h2>
      <div class="metric">
        <span class="score ${scoreColor}">Performance Score: ${performanceScore}</span>
        <span> (0-100)</span>
      </div>
      <div class="metric">
        <span class="score ${fcpColor}">First Contentful Paint: ${fcp.toFixed(2)}s</span>
      </div>
      <div class="metric">
        <span class="score ${ttiColor}">Time to Interactive: ${tti.toFixed(2)}s</span>
      </div>
      <div class="metric">
        <span class="score ${lcpColor}">Largest Contentful Paint: ${lcp.toFixed(2)}s</span>
      </div>
      <h2>Deno Bench Results</h2>
      <pre>${benchResult.output || "No benchmark output available"}</pre>
      ${benchResult.error ? `<h2>Errors</h2><pre>${benchResult.error}</pre>` : ""}
    </body>
    </html>
  `;
}

// Main execution
export async function runBenches() {
  await ensureDir(REPORTS_DIR);
  console.log("Running Lighthouse performance tests...");
  const lighthouseResult = await runLighthouse(SITE_URL);

  console.log("Running Deno benchmarks...");
  const benchResult = await runDenoBench();

  console.log("Generating HTML report...");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-"); // e.g., 2025-04-03T12-00-00Z
  const reportFile = `${REPORTS_DIR}/performance-report-${timestamp}.html`;
  const htmlReport = generateHtmlReport(lighthouseResult, benchResult);
 //try catch to write the report. 
 try {
    await Deno.writeTextFile(reportFile, htmlReport);
    console.log(`Report generated: ${reportFile}`);
  } catch (err) {
    console.error(`Failed to write report to ${reportFile}:`, err);
    return;
  }

  // open in browser would be nice but this is not super important to me. 
//   try {
//     const openCommand = new Deno.Command("open", { args: [reportFile] });
//     await openCommand.output();
//   } catch (err) {
//     console.warn("Could not open report automatically:", err);
//   }
}

//use block. exported to dev or prod ts so doesnt need to be called here. 
// runBenches().catch((err) => console.error("Error:", err));