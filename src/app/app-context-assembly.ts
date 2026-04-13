import { createModelGateway, type ModelGateway } from "../infra/model-gateway";

type ConfigLike = {
  dataDir: string;
  checkpointConnString: string;
  workspaceRoot: string;
  projectId: string;
  model: {
    apiKey?: string;
    baseURL?: string;
    name?: string;
  };
};

type ScopeLike = {
  workspaceRoot: string;
  projectId: string;
};

type ClosableLike = {
  close?: () => void | Promise<void>;
};

type PersistenceLayer<TSqlite, TStores, TCheckpointer> = {
  sqlite: TSqlite;
  stores: TStores;
  checkpointer: TCheckpointer;
};

type ServiceLayer<TNarrativeService, TScratchPolicy, TMemoryConsolidator, TControlPlane, TWorkerManager, TKernel> = {
  narrativeService: TNarrativeService;
  scratchPolicy: TScratchPolicy;
  memoryConsolidator: TMemoryConsolidator;
  controlPlane: TControlPlane;
  workerManager: TWorkerManager;
  kernel: TKernel;
};

// 装配根辅助层：
// 只负责把 createAppContext 拆成“持久化、服务装配、事件桥接、资源关闭”几步。
// 它不承载业务状态机，也不决定 control-plane 行为。
export async function createAppPersistenceLayer<TSqlite, TStores, TCheckpointer>(input: {
  config: ConfigLike;
  openSqlite: (dataDir: string) => TSqlite;
  migrate: (sqlite: TSqlite) => void;
  createStores: (sqlite: TSqlite) => TStores;
  recoverUncertainExecutions: (stores: TStores, scope: ScopeLike) => Promise<void>;
  createCheckpointer: (checkpointConnString: string) => TCheckpointer;
}): Promise<PersistenceLayer<TSqlite, TStores, TCheckpointer>> {
  const sqlite = input.openSqlite(input.config.dataDir);
  input.migrate(sqlite);

  const stores = input.createStores(sqlite);
  await input.recoverUncertainExecutions(stores, {
    workspaceRoot: input.config.workspaceRoot,
    projectId: input.config.projectId,
  });

  const checkpointer = input.createCheckpointer(input.config.checkpointConnString);
  return {
    sqlite,
    stores,
    checkpointer,
  };
}

export function resolveAppModelGateway(input: {
  config: ConfigLike;
  modelGateway?: ModelGateway;
}): ModelGateway {
  if (input.modelGateway) {
    return input.modelGateway;
  }

  return createModelGateway({
    apiKey: input.config.model.apiKey,
    baseURL: input.config.model.baseURL,
    modelName: input.config.model.name,
  });
}

export async function createAppServiceLayer<
  TStores,
  TCheckpointer,
  TNarrativeService,
  TScratchPolicy,
  TMemoryConsolidator,
  TControlPlane,
  TWorkerManager,
  TKernel,
>(input: {
  config: ConfigLike;
  stores: TStores;
  checkpointer: TCheckpointer;
  modelGateway: ModelGateway;
  createNarrativeService: (stores: TStores) => TNarrativeService;
  createScratchPolicy: () => TScratchPolicy;
  createMemoryConsolidator: (stores: TStores, modelGateway: ModelGateway) => TMemoryConsolidator;
  createControlPlane: (input: {
    config: ConfigLike;
    stores: TStores;
    checkpointer: TCheckpointer;
    modelGateway: ModelGateway;
  }) => Promise<TControlPlane>;
  createWorkerManager: (stores: TStores) => TWorkerManager;
  createKernel: (input: {
    stores: TStores;
    controlPlane: TControlPlane;
    narrativeService: TNarrativeService;
    workspaceRoot: string;
    projectId: string;
  }) => TKernel;
}): Promise<ServiceLayer<
  TNarrativeService,
  TScratchPolicy,
  TMemoryConsolidator,
  TControlPlane,
  TWorkerManager,
  TKernel
>> {
  const narrativeService = input.createNarrativeService(input.stores);
  const scratchPolicy = input.createScratchPolicy();
  const memoryConsolidator = input.createMemoryConsolidator(input.stores, input.modelGateway);
  const controlPlane = await input.createControlPlane({
    config: input.config,
    stores: input.stores,
    checkpointer: input.checkpointer,
    modelGateway: input.modelGateway,
  });
  const workerManager = input.createWorkerManager(input.stores);
  const kernel = input.createKernel({
    stores: input.stores,
    controlPlane,
    narrativeService,
    workspaceRoot: input.config.workspaceRoot,
    projectId: input.config.projectId,
  });

  return {
    narrativeService,
    scratchPolicy,
    memoryConsolidator,
    controlPlane,
    workerManager,
    kernel,
  };
}

export function bridgeModelGatewayEvents<TEvent>(modelGateway: ModelGateway, kernel: {
  events: {
    publish: (event: TEvent) => void;
  };
}) {
  modelGateway.onStatusChange((status) => {
    kernel.events.publish({
      type: "model.status",
      payload: { status },
    } as TEvent);
  });

  modelGateway.onEvent((event) => {
    kernel.events.publish(event as TEvent);
  });
}

export async function closeAppContextResources(input: {
  stores: Record<string, ClosableLike | undefined>;
  checkpointer?: ClosableLike;
  sqlite: ClosableLike;
}) {
  await Promise.all([
    ...Object.values(input.stores).map((store) => store?.close?.()),
    input.checkpointer?.close?.(),
  ]);
  input.sqlite.close?.();
}
