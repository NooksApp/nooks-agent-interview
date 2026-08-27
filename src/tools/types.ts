import type { NooksClient } from '../nooksClient.mock';

/** Context passed to every tool factory. */
export interface ToolContext {
  client: NooksClient;
}
