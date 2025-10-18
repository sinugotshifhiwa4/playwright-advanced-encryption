import * as os from "os";
import { AllocatorType } from "./workerAllocator.type";
import ErrorHandler from "../../utils/errorHandling/errorHandler";

export default class WorkerAllocator {
  private static readonly totalCores = os.cpus().length;
  private static readonly MIN_WORKERS = 1;

  /**
   * Optimal worker count for the current environment.
   * Uses sharding in CI or the provided local strategy otherwise.
   */
  public static getOptimalWorkerCount(localStrategy: AllocatorType): number {
    return this.shardingEnabled
      ? this.getWorkersForCIShard()
      : this.getWorkersForLocalStrategy(localStrategy);
  }

  /**
   * Whether sharding is enabled for the current test run.
   */
  private static get shardingEnabled(): boolean {
    return !!(process.env.SHARD_INDEX && process.env.SHARD_TOTAL);
  }

  /**
   * Worker count for CI environments with sharding enabled.
   * Distributes cores evenly across shards, with remainder cores
   * allocated to the first shards.
   */
  private static getWorkersForCIShard(): number {
    const shardTotal = parseInt(process.env.SHARD_TOTAL || "1", 10);
    const shardIndex = parseInt(process.env.SHARD_INDEX || "0", 10);

    // Validate shard configuration
    if (shardIndex >= shardTotal) {
      return ErrorHandler.logAndThrow(
        "WorkerAllocator",
        `Invalid shard config: SHARD_INDEX (${shardIndex}) must be less than SHARD_TOTAL (${shardTotal}).`,
      );
    }

    if (shardTotal < 1) {
      return ErrorHandler.logAndThrow(
        "WorkerAllocator",
        `Invalid shard config: SHARD_TOTAL must be at least 1, got ${shardTotal}.`,
      );
    }

    // Calculate base workers per shard
    const baseWorkersPerShard = Math.floor(this.totalCores / shardTotal);
    const remainingCores = this.totalCores % shardTotal;

    // Distribute remaining cores to first shards
    const workersForThisShard =
      shardIndex < remainingCores ? baseWorkersPerShard + 1 : baseWorkersPerShard;

    return Math.max(this.MIN_WORKERS, workersForThisShard);
  }

  /**
   * Worker count for local development based on the given allocation strategy.
   */
  private static getWorkersForLocalStrategy(strategy: AllocatorType): number {
    switch (strategy) {
      case "all-cores":
        return this.totalCores;
      case "75-percent":
        return Math.max(this.MIN_WORKERS, Math.ceil(this.totalCores * 0.75));
      case "50-percent":
        return Math.max(this.MIN_WORKERS, Math.ceil(this.totalCores * 0.5));
      case "25-percent":
        return Math.max(this.MIN_WORKERS, Math.ceil(this.totalCores * 0.25));
      case "10-percent":
        return Math.max(this.MIN_WORKERS, Math.ceil(this.totalCores * 0.1));
      default:
        // Exhaustive check - this should never be reached
        const _exhaustive: never = strategy;
        return ErrorHandler.logAndThrow(
          "WorkerAllocator",
          `Unknown allocation strategy: ${strategy}. Valid strategies: all-cores, 75-percent, 50-percent, 25-percent, 10-percent.`,
        );
    }
  }
}
