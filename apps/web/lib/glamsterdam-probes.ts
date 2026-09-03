export const glamsterdamProbes = [
  {
    id: "glamsterdam/gas-repricing-estimate",
    title: "Gas repricing estimates",
    detail: "EIP-2780, EIP-7981, EIP-8037, and EIP-8038. Use state-aligned public RPC targets.",
    yaml: `version: 1
name: glamsterdam-gas-repricing-estimate
description: Compare estimation of a minimal value transfer and an access-list transfer on two targets at the same post-fork block context.
probe:
  upgrade: glamsterdam
  eips: ["EIP-2780", "EIP-7981", "EIP-8037", "EIP-8038"]
  category: gas_repricing
  risk: high
  sources: ["https://eips.ethereum.org/EIPS/eip-8007"]
inputs:
  sender:
    description: A funded disposable account on both targets.
    kind: address
    required: true
  recipient:
    description: An account with the same state on both targets.
    kind: address
    required: true
  block:
    description: A post-Glamsterdam block number or stable block tag shared by both targets.
    kind: block_tag
    default: latest
actions:
  - kind: rpc
    id: minimal-value-transfer
    method: eth_estimateGas
    params:
      - from: "{{sender}}"
        to: "{{recipient}}"
        value: "0x1"
      - "{{block}}"
  - kind: rpc
    id: access-list-transfer
    method: eth_estimateGas
    params:
      - from: "{{sender}}"
        to: "{{recipient}}"
        value: "0x1"
        accessList:
          - address: "{{recipient}}"
            storageKeys: []
      - "{{block}}"
`,
  },
  {
    id: "glamsterdam/engine-api-surface",
    title: "Amsterdam Engine API surface",
    detail: "EIP-7928. Use authenticated Engine API targets. Run this probe with the CLI when a JWT header is required.",
    yaml: `version: 1
name: glamsterdam-engine-api-surface
description: Check that two authenticated execution endpoints advertise the Amsterdam Engine API methods required for Glamsterdam block access lists.
probe:
  upgrade: glamsterdam
  eips: ["EIP-7928"]
  category: engine_api
  risk: critical
  sources:
    - https://eips.ethereum.org/EIPS/eip-7928
    - https://github.com/ethereum/execution-apis/blob/main/src/engine/amsterdam.md
actions:
  - kind: rpc
    id: advertised-amsterdam-engine-methods
    method: engine_exchangeCapabilities
    params:
      - - engine_newPayloadV5
        - engine_getPayloadV6
        - engine_forkchoiceUpdatedV4
        - engine_getPayloadBodiesByHashV2
        - engine_getPayloadBodiesByRangeV2
        - engine_getBlobsV4
    expect:
      baseline:
        - path: /result
          contains_all:
            - engine_newPayloadV5
            - engine_getPayloadV6
            - engine_forkchoiceUpdatedV4
            - engine_getPayloadBodiesByHashV2
            - engine_getPayloadBodiesByRangeV2
            - engine_getBlobsV4
      candidate:
        - path: /result
          contains_all:
            - engine_newPayloadV5
            - engine_getPayloadV6
            - engine_forkchoiceUpdatedV4
            - engine_getPayloadBodiesByHashV2
            - engine_getPayloadBodiesByRangeV2
            - engine_getBlobsV4
`,
  },
  {
    id: "glamsterdam/block-access-list-retrieval",
    title: "Block access list retrieval",
    detail: "EIP-7928. Compare a post-fork Engine API payload body with the blockAccessList field.",
    yaml: `version: 1
name: glamsterdam-block-access-list-retrieval
description: Compare retrieval of a post-fork payload body, including the EIP-7928 blockAccessList field.
probe:
  upgrade: glamsterdam
  eips: ["EIP-7928"]
  category: block_access_list
  risk: critical
  sources:
    - https://eips.ethereum.org/EIPS/eip-7928
inputs:
  first_block:
    description: A known post-Glamsterdam execution block number in hexadecimal quantity form.
    kind: quantity
    required: true
  count:
    description: The number of payload bodies to retrieve. Keep this value small.
    kind: quantity
    default: "0x1"
actions:
  - kind: rpc
    id: payload-body-with-block-access-list
    method: engine_getPayloadBodiesByRangeV2
    params: ["{{first_block}}", "{{count}}"]
`,
  },
] as const;

export const defaultGlamsterdamProbe = glamsterdamProbes[0];
