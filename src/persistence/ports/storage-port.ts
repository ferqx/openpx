/** 所有持久化端口共享的最小关闭接口 */
export interface StoragePort {
  close(): Promise<void>;
}
