# GlamProbe downstream adapters

This package tests a JSON-RPC operation through the client or tool that downstream software uses.

It supports `ethers`, `viem`, `foundry`, and `hardhat`.

## Input

```json
{
  "adapter": "ethers",
  "target": {
    "url": "https://rpc.example",
    "headers": { "Authorization": "Bearer token" }
  },
  "request": {
    "method": "eth_chainId",
    "params": []
  }
}
```

Run it with:

```sh
npm install
npm run run -- --input request.json
```

The command writes one JSON document to standard output.

## Hardhat

For `hardhat`, add a `hardhat` object with `projectDirectory`, `script`, and `network`. The adapter runs the supplied project script through `npx hardhat run --network`.

The script receives these environment variables:

- `GLAMPROBE_TARGET_URL`
- `GLAMPROBE_TARGET_HEADERS`
- `GLAMPROBE_RPC_METHOD`
- `GLAMPROBE_RPC_PARAMS`

Write one JSON result to standard output.

## Foundry

The Foundry adapter calls `cast rpc`. Install Foundry and make `cast` available on `PATH` before you run the adapter.

These adapters run local commands. Use them in a controlled CI runner. Do not run untrusted Hardhat projects.
