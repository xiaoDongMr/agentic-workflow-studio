from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class RunCreateRequest(BaseModel):
    assistant_id: str | None = Field(default=None, description="要使用的 agent / assistant")
    input: dict[str, Any] | None = Field(default=None, description="图运行输入，例如 {messages: [...]}")
    command: dict[str, Any] | None = Field(default=None, description="LangGraph Command")
    metadata: dict[str, Any] | None = Field(default=None, description="Run 元数据")
    config: dict[str, Any] | None = Field(default=None, description="RunnableConfig 覆盖项")
    context: dict[str, Any] | None = Field(default=None, description="DeerFlow 上下文覆盖项")
    webhook: str | None = Field(default=None, description="完成回调 URL")
    checkpoint_id: str | None = Field(default=None, description="从指定 checkpoint 恢复")
    checkpoint: dict[str, Any] | None = Field(default=None, description="完整 checkpoint 对象")
    interrupt_before: list[str] | Literal["*"] | None = Field(default=None, description="运行前中断节点")
    interrupt_after: list[str] | Literal["*"] | None = Field(default=None, description="运行后中断节点")
    stream_mode: list[str] | str | None = Field(default=None, description="流式模式")
    stream_subgraphs: bool = Field(default=False, description="是否包含子图事件")
    stream_resumable: bool | None = Field(default=None, description="是否开启 SSE resumable")
    on_disconnect: Literal["cancel", "continue"] = Field(default="cancel", description="客户端断开后的处理方式")
    on_completion: Literal["delete", "keep"] = Field(default="keep", description="完成后是否删除临时线程")
    multitask_strategy: Literal["reject", "rollback", "interrupt", "enqueue"] = Field(
        default="reject",
        description="同线程并发运行策略",
    )
    after_seconds: float | None = Field(default=None, description="延迟执行秒数")
    if_not_exists: Literal["reject", "create"] = Field(default="create", description="线程不存在时的策略")
    feedback_keys: list[str] | None = Field(default=None, description="LangSmith feedback keys")
