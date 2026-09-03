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
  fixture_release: tests-glamsterdam-devnet@v7.2.1
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
  fixture_release: tests-glamsterdam-devnet@v7.2.1
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
  fixture_release: tests-glamsterdam-devnet@v7.2.1
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
    expect:
      baseline:
        - path: /result/0
          has_keys: [blockAccessList]
      candidate:
        - path: /result/0
          has_keys: [blockAccessList]
`,
  },
  {
    id: "glamsterdam/gloas-builder-status",
    title: "Gloas Builder API status",
    detail: "EIP-7732. Checks that both Builder API targets return HTTP 200 from the Gloas builder status route.",
    yaml: `version: 1
name: glamsterdam-gloas-builder-status
description: Verify that both Gloas builder endpoints are available through the Builder API status route.
probe:
  upgrade: glamsterdam
  eips: ["EIP-7732"]
  category: builder_api
  risk: high
  fixture_release: tests-glamsterdam-devnet@v7.2.1
  sources: ["https://github.com/ethereum/builder-specs/blob/main/builder-oapi.yaml"]
actions:
  - kind: http
    id: builder-status
    method: GET
    path: /eth/v1/builder/status
    expect:
      baseline:
        - path: /status
          equals: 200
      candidate:
        - path: /status
          equals: 200
`,
  },
  {
    id: "glamsterdam/gloas-execution-payload-bid",
    title: "Gloas execution payload bid",
    detail: "EIP-7732. Compare ePBS bid responses from two Builder API targets for one proposal context.",
    yaml: `version: 1
name: glamsterdam-gloas-execution-payload-bid
description: Compare Gloas ePBS execution payload bid responses from two Builder API targets for the same proposal context.
probe:
  upgrade: glamsterdam
  eips: ["EIP-7732"]
  category: builder_api
  risk: critical
  fixture_release: tests-glamsterdam-devnet@v7.2.1
  sources: ["https://github.com/ethereum/builder-specs/blob/main/apis/builder/execution_payload_bid.yaml"]
inputs:
  slot:
    description: The decimal Gloas slot to query.
    required: true
  parent_hash:
    description: The execution parent hash for the proposed block.
    required: true
  parent_root:
    description: The beacon parent root for the proposed block.
    required: true
  proposer_pubkey:
    description: The BLS public key of the proposer.
    required: true
actions:
  - kind: http
    id: execution-payload-bid
    method: GET
    path: /eth/v1/builder/execution_payload_bid/{{slot}}/{{parent_hash}}/{{parent_root}}/{{proposer_pubkey}}
    headers:
      Accept: application/json
      Eth-Consensus-Version: gloas
    expect:
      baseline:
        - path: /status
          equals: 200
      candidate:
        - path: /status
          equals: 200
`,
  },
] as const;

export const defaultGlamsterdamProbe = glamsterdamProbes[0];
