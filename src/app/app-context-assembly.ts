import { createModelGateway, type ModelGateway } from "../infra/model-gateway";
import type { Database } from "bun:sqlite";
import { closeSqliteHandle } from "../persistence/sqlite/sqlite-client";

/** createAppContext 关心的最小配置形状 */
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

/** 持久化恢复使用的 scope 形状 */
type ScopeLike = {
  workspaceRoot: string;
  projectId: string;
};

/** 可关闭资源的统一最小接口 */
type ClosableLike = {
  close?: () => void | Promise<void>;
};

type SqliteLike = ClosableLike & Partial<Pick<Database, "run" | "close">>;

/** 持久化层装配结果：sqlite + stores + checkpointer */
type PersistenceLayer<TSqlite, TStores, TCheckpointer> = {
  sqlite: TSqlite;
  stores: TStores;
  checkpointer: TCheckpointer;
};

/** 服务层装配结果：叙事、控制面、worker 与 kernel 等运行期能力 */
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
  // 先恢复 crash 后状态不确定的工具执行，再开放 checkpointer 和上层服务，
  // 避免 kernel 启动后读到一份“看似可继续、实际已脏”的 thread 状态。
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

  // 允许测试或外部调用方注入 gateway；未注入时才根据配置创建默认实现。
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
  // 这里把 createAppContext 的“服务图”拆成稳定顺序：
  // narrative/scratch/memory -> controlPlane -> workerManager -> kernel。
  // 这样 kernel 总能拿到已经准备好的 control-plane 与 narrativeService。
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
  // 模型层事件统一汇入 kernel event bus，避免 TUI/runtime 再分别直连 gateway。
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
  sqlite: SqliteLike;
}) {
  // 关闭顺序上优先释放 stores/checkpointer，再关闭底层 sqlite 句柄，
  // 防止 store.close 期间仍访问已经被关掉的数据库连接。
  await Promise.all([
    ...Object.values(input.stores).map((store) => store?.close?.()),
    input.checkpointer?.close?.(),
  ]);
  if (typeof input.sqlite.close === "function" && typeof input.sqlite.run === "function") {
    closeSqliteHandle({
      run: input.sqlite.run.bind(input.sqlite),
      close: input.sqlite.close.bind(input.sqlite),
    });
    return;
  }

  input.sqlite.close?.();
}
