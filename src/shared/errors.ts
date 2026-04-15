/** 
 * @module shared/errors
 * 领域错误（DomainError）定义。
 * 
 * 提供统一的领域层错误类型，用于在状态转换、ID 校验等场景中
 * 抛出具有语义的错误，而非使用通用 Error。
 */
/** 领域错误——用于状态转换违规、ID 校验失败等业务规则违反场景 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/** 创建 DomainError 的快捷工厂函数 */
export function domainError(message: string) {
  return new DomainError(message);
}
