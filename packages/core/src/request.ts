import type { PlatformName } from "./types.js";
import type { CredentialLike } from "./versioning.js";

export interface RequestSpec {
  module: string;
  method: string;
  param: Record<string, unknown>;
  platform?: PlatformName;
  comm?: Record<string, unknown>;
  credential?: CredentialLike;
  sign?: boolean;
  preserveBool?: boolean;
  allowErrorCodes?: "all" | Set<number>;
  parseOnAllow?: boolean;
}

export class Request {
  constructor(
    readonly spec: RequestSpec,
    readonly execute: (spec: RequestSpec) => Promise<unknown>
  ) {}

  then<TResult = unknown, TReject = never>(
    onfulfilled?: ((value: unknown) => TResult | PromiseLike<TResult>) | null,
    onrejected?: ((reason: unknown) => TReject | PromiseLike<TReject>) | null
  ): Promise<TResult | TReject> {
    return this.execute(this.spec).then(onfulfilled, onrejected);
  }
}
