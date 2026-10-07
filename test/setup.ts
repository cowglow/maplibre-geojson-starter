import { fc } from '@fast-check/vitest';

// Default 100 runs per property. Hunt harder locally with: FC_RUNS=2000 npm test
// Replay a failure exactly with: FC_SEED=<seed from the failure message> npm test
fc.configureGlobal({
  numRuns: Number(process.env.FC_RUNS ?? 100),
  ...(process.env.FC_SEED ? { seed: Number(process.env.FC_SEED) } : {}),
});
