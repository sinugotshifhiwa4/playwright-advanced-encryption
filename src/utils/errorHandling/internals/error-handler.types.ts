export interface ErrorDetails {
  source: string;
  context: string;
  message: string;
  url?: string;
  details?: Record<string, unknown>;
  timestamp: string;
  environment: string;
  stack?: string;
  errorType?: string;
}

export type MatcherResult = {
  expected?: unknown;
  actual?: unknown;
  received?: unknown;
  message: string;
  pass: boolean;
};

export type MatcherError = {
  matcherResult: MatcherResult;
};
