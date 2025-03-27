import { emptyDir } from "https://deno.land/std@0.224.0/fs/mod.ts";


export async function clear() {
    await emptyDir("./dist");
    await emptyDir("./prod");
    console.log("Cleared dist and prod directories.");
}
clear();