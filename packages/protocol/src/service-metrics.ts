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

export type BusinessHealthMetrics = {
  checkedAt: string;
  from: string;
  days: number;
  registrations: number;
  payments: number;
  flows: {
    id: "login" | "devices" | "payment" | "tasks";
    total: number;
    completed: number;
    pending: number;
    failed: number;
    incompleteEvidence: number;
    rate: number | null;
    steps: { key: string; count: number }[];
  }[];
};

export type ServiceMetrics = {
  checkedAt: string;
  from: string;
  hours: number;
  domain: string;
  bucketSeconds: number;
  coverage: "recorded_events" | "recorded_business_errors";
  modules: { domain: string; failures: number; attention: number }[];
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
