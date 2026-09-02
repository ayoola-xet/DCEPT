import { FetchRequest, JsonRpcProvider } from "ethers";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createPublicClient, http } from "viem";

const input = await readInput(process.argv.slice(2));
validate(input);

const response = await runAdapter(input);
process.stdout.write(`${JSON.stringify({ adapter: input.adapter, response }, jsonReplacer)}\n`);

async function readInput(args) {
  const index = args.indexOf("--input");
  if (index >= 0 && args[index + 1]) return JSON.parse(await readFile(args[index + 1], "utf8"));
  const [encoded] = args;
  if (!encoded) throw new Error("Pass an adapter JSON file with --input <path>.");
  return JSON.parse(encoded);
}

function validate(input) {
  if (!["ethers", "viem", "foundry", "hardhat"].includes(input.adapter)) throw new Error("Adapter must be ethers, viem, foundry, or hardhat.");
  if (!input.target?.url?.startsWith("http")) throw new Error("target.url must be an HTTP URL.");
  if (!input.request?.method) throw new Error("request.method is required.");
  if (!Array.isArray(input.request.params)) throw new Error("request.params must be an array.");
}

async function runAdapter(input) {
  switch (input.adapter) {
    case "ethers": return ethersRequest(input);
    case "viem": return viemRequest(input);
    case "foundry": return foundryRequest(input);
    case "hardhat": return hardhatRequest(input);
  }
}

async function ethersRequest(input) {
  const request = new FetchRequest(input.target.url);
  for (const [name, value] of Object.entries(input.target.headers ?? {})) request.setHeader(name, value);
  const provider = new JsonRpcProvider(request, undefined, { staticNetwork: true, batchMaxCount: 1 });
  try {
    return await provider.send(input.request.method, input.request.params);
  } finally {
    provider.destroy();
  }
}

async function viemRequest(input) {
  const client = createPublicClient({
    transport: http(input.target.url, { fetchOptions: { headers: input.target.headers ?? {} }, retryCount: 0 }),
  });
  return client.request({ method: input.request.method, params: input.request.params });
}

async function foundryRequest(input) {
  const args = ["rpc", input.request.method, JSON.stringify(input.request.params), "--raw", "--rpc-url", input.target.url];
  for (const [name, value] of Object.entries(input.target.headers ?? {})) args.push("--rpc-headers", `${name}: ${value}`);
  const result = await command("cast", args, process.cwd(), {});
  if (result.code !== 0) throw new Error(`Foundry cast failed: ${result.stderr || result.stdout}`);
  try { return JSON.parse(result.stdout); } catch { return result.stdout.trim(); }
}

async function hardhatRequest(input) {
  const hardhat = input.hardhat;
  if (!hardhat?.projectDirectory || !hardhat.script || !hardhat.network) {
    throw new Error("hardhat.projectDirectory, hardhat.script, and hardhat.network are required for the Hardhat adapter.");
  }
  const result = await command("npx", ["hardhat", "run", "--network", hardhat.network, hardhat.script], hardhat.projectDirectory, {
    GLAMPROBE_TARGET_URL: input.target.url,
    GLAMPROBE_TARGET_HEADERS: JSON.stringify(input.target.headers ?? {}),
    GLAMPROBE_RPC_METHOD: input.request.method,
    GLAMPROBE_RPC_PARAMS: JSON.stringify(input.request.params),
  });
  if (result.code !== 0) throw new Error(`Hardhat command failed: ${result.stderr || result.stdout}`);
  try { return JSON.parse(result.stdout); } catch { return result.stdout.trim(); }
}

function command(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function jsonReplacer(_, value) {
  return typeof value === "bigint" ? value.toString() : value;
}
