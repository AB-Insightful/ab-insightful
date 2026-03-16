#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const env = { ...process.env };

// place Sqlite3 database on volume
const database_url = process.env.DATABASE_URL ?? "file:./dev.sqlite";

const source = path.resolve(database_url.replace("file:./", ""));
const target = "/data/" + path.basename(source);
if (!fs.existsSync(source) && fs.existsSync("/data"))
  fs.symlinkSync(target, source);


// prepare database
await exec("npx prisma migrate deploy");

// launch application
await exec(process.argv.slice(2).join(" "));

function exec(command) {
  const child = spawn(command, { shell: true, stdio: "inherit", env });
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} failed rc=${code}`));
      }
    });
  });
}
