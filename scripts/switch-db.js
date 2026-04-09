
import fs from "fs";
import path from "path";

const envFilePath = path.resolve(process.cwd(), ".env");
const configPath = path.resolve(process.cwd(), "db.environment.config.json");

//parse passed args
function parseArgs() {
  const envArg = process.argv.find((arg) => arg.startsWith("--environment="));
  if (!envArg) {
    console.error("Missing --environment argument. Use --environment=dev|test|prod");
    process.exit(1);
  }

  return envArg.split("=")[1];
}

//check config file
function loadConfig() {
  if (!fs.existsSync(configPath)) {
    console.error(`Missing config file: ${configPath}`);
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

//update .env file, only touches DATABASE_URL
function updateEnvFile(databaseUrl) {
  let envContent = "";

  if (fs.existsSync(envFilePath)) {
    envContent = fs.readFileSync(envFilePath, "utf8");
  }

  const dbLine = `DATABASE_URL="${databaseUrl}"`;

  if (/^DATABASE_URL=.*$/m.test(envContent)) {
    envContent = envContent.replace(/^DATABASE_URL=.*$/m, dbLine);
  } else {
    envContent = envContent.trim()
      ? `${envContent.trim()}\n${dbLine}\n`
      : `${dbLine}\n`;
  }

  fs.writeFileSync(envFilePath, envContent, "utf8");
}

function main() {
  const environment = parseArgs();
  const config = loadConfig();

  if (!config[environment]) {
    console.error(`Invalid environment: ${environment}`);
    console.error(`Valid environments: ${Object.keys(config).join(", ")}`);
    process.exit(1);
  }

  updateEnvFile(config[environment]);

  console.log(`DATABASE_URL switched to ${environment}`);
}

main();