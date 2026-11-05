export type ServiceMetricsPoint = {
  at: string;
  requests: number;
  serverErrors: number;
  clientErrors: number;
  slowRequests: number;
  failures: number;
  attention: number;
  affectedUsers: number;
  affectedDevices: number;
  p50Ms: number | null;
  p95Ms: number | null;
};

export type ServiceMetrics = {
  checkedAt: string;
  from: string;
  hours: number;
  domain: string;
  bucketSeconds: number;
  coverage: "recorded_events";
  totals: {
    requests: number;
    serverErrors: number;
    clientErrors: number;
    slowRequests: number;
    failures: number;
    attention: number;
    p50Ms: number | null;
    p95Ms: number | null;
  };
  points: ServiceMetricsPoint[];
};
