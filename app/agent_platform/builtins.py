from app.agent_platform.definition import (
    AgentDefinition,
    AgentModelConfig,
    AgentRuntimeDefinition,
    AgentToolConfig,
)


LEAD_AGENT_DEFINITION = AgentDefinition(
    id="lead_agent",
    name="通用助手",
    description="DeerFlow 通用工具调用 Agent",
    builtin=True,
    runtime=AgentRuntimeDefinition(
        kind="react_agent",
        factory="deerflow.agents.lead_agent.agent:make_lead_agent",
    ),
)

WORKFLOW_AGENT_DEFINITION = AgentDefinition(
    id="workflow-agent",
    name="工作流画布助手",
    description="生成、修改工作流画布和指定节点",
    builtin=True,
    runtime=AgentRuntimeDefinition(
        kind="react_agent",
        factory="app.agents.workflow_agent.graph:make_workflow_agent",
        max_turns=30,
        timeout_seconds=900,
    ),
    model=AgentModelConfig(thinking_enabled=False),
    skills=["workflow-canvas", "workflow-node-mapping"],
    tools=AgentToolConfig(
        allowed=[
            "describe_workflow",
            "inspect_workflow_node",
            "build_workflow_patch",
            "validate_workflow_patch",
            "run_node_skill",
            "validate_python_node_code",
        ],
        disallowed=["bash"],
    ),
)

BUILTIN_AGENT_DEFINITIONS = (
    LEAD_AGENT_DEFINITION,
    WORKFLOW_AGENT_DEFINITION,
)
