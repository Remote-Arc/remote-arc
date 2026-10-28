/** Studio owns its domain. Account, vault, billing and inference are host adapters. */
export type StudioIdentity = { id: string; email: string; name: string | null };
export type StudioSkill = {
  id: string;
  name: string;
  description: string;
  content: string;
};
export type StudioModel = { id: string; label: string; configured: boolean };
export type StudioModelRequest = {
  ownerId: string;
  projectId: string;
  jobId: string;
  modelId: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  timeoutMs: number;
};
export type StudioAccountLinks = {
  login: string;
  account: string | null;
  home: string | null;
};
export type StudioServices = {
  identity(request: Request): Promise<StudioIdentity | null>;
  links: StudioAccountLinks;
  vault: {
    seal(value: unknown, context: string): Promise<string>;
    unseal<T>(ciphertext: string, context: string): Promise<T>;
  };
  skills: {
    defaultIds?: string[];
    list(ownerId: string): Promise<Omit<StudioSkill, "content">[]>;
    read(ownerId: string, id: string): Promise<StudioSkill>;
  };
  storyboard: {
    catalog(): { models: StudioModel[]; available: boolean };
    generate<T>(
      request: StudioModelRequest,
      validate: (value: unknown) => T,
    ): Promise<T>;
  };
  /** Host-owned workload registration shares the project's atomic transaction. */
  lifecycle?: {
    created(
      ownerId: string,
      projectId: string,
      at: string,
    ): D1PreparedStatement[];
    deleted(
      ownerId: string,
      projectId: string,
      at: string,
    ): D1PreparedStatement[];
  };
};
export type StudioBindings = {
  DB: D1Database;
  STUDIO_MEDIA?: R2Bucket;
  STUDIO_RUNTIME?: DurableObjectNamespace;
  STUDIO_ORIGIN?: string;
};
export type StudioEnvironment = StudioBindings & {
  STUDIO_ALLOWED_ORIGINS?: string[];
  STUDIO_SERVICES: StudioServices;
};
