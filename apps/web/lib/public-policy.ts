import type { RequestPlan, RunPlan } from "./core-types";

const unsafeRpcMethod = /^(eth_send|eth_submit|eth_sign|personal_|wallet_|engine_|admin_|miner_|evm_|hardhat_|anvil_)/;

export function validateNoLoginPlan(plan: RunPlan): string | null {
  if (plan.actions.length > 20) return "The no-login server runner allows up to 20 actions.";
  for (const action of plan.actions) {
    for (const request of [action.baseline, action.candidate]) {
      const error = validateRequest(action.id, request);
      if (error) return error;
    }
  }
  return null;
}

function validateRequest(actionId: string, request: RequestPlan): string | null {
  if (request.kind === "rpc" && unsafeRpcMethod.test(request.method)) {
    return `RPC method '${request.method}' is not allowed in the no-login runner.`;
  }
  if (request.kind === "http" && !["GET", "HEAD"].includes(request.method.toUpperCase())) {
    return `HTTP method '${request.method}' is not allowed in the no-login runner.`;
  }
  if (request.kind === "http" && Object.keys(request.headers).some(isCredentialHeader)) {
    return `Action '${actionId}' includes a credential header. Use the local CLI or DCEPT Cloud.`;
  }
  return null;
}

function isCredentialHeader(name: string): boolean {
  return /authorization|api[-_]?key|token|secret|cookie|credential|password/i.test(name);
}
