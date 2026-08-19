from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.agents.workflow_agent.node_skill_scripts import (
    build_node,
    list_input_sources,
    validate_node_io,
)
from app.agents.workflow_agent.node_skill_registry import (
    NODE_SKILL_NAMES,
    NodeSkillRegistry,
    render_node_skills_prompt,
)
from app.agents.workflow_agent.node_skill_runner import NodeSkillScriptRunner
from app.agents.workflow_agent.tools.read_node_skill_file import (
    make_read_node_skill_file_tool,
)
from app.agents.workflow_agent.tools.execute_node_skill_script import (
    make_execute_node_skill_script_tool,
)
from app.agents.workflow_agent.tools.run_node_skill import run_node_skill_tool
from app.schemas.workflow import WorkflowNode


def _node(
    node_id: str,
    title: str,
    outputs: list[tuple[str, str]],
) -> SimpleNamespace:
    return SimpleNamespace(
        id=node_id,
        title=title,
        type="start" if node_id == "start" else "llm",
        outputs=[
            SimpleNamespace(
                name=name,
                type=value_type,
                description="",
            )
            for name, value_type in outputs
        ],
    )


class NodeSkillRegistryTest(unittest.TestCase):
    def test_loads_all_builtin_node_skills(self) -> None:
        registry = NodeSkillRegistry()

        skills = registry.load_many(set(NODE_SKILL_NAMES))

        self.assertEqual(
            [skill.node_type for skill in skills],
            list(NODE_SKILL_NAMES),
        )
        for skill in skills:
            self.assertTrue((skill.skill_dir / "scripts" / "node.py").is_file())
        self.assertTrue(
            registry.resolve_script("llm", "scripts/node.py").is_file()
        )

    def test_renders_only_selected_node_skills(self) -> None:
        registry = NodeSkillRegistry()

        prompt = render_node_skills_prompt(
            registry.load_many({"llm", "selector"})
        )

        self.assertIn("workflow-node-llm", prompt)
        self.assertIn("workflow-node-selector", prompt)
        self.assertNotIn("workflow-node-code", prompt)


class NodeSkillScriptRunnerTest(unittest.IsolatedAsyncioTestCase):
    async def run_node_script(
        self,
        *,
        node_type: str,
        entry_function: str,
        arguments: dict,
        runtime_context: dict | None = None,
    ) -> dict:
        runner = NodeSkillScriptRunner(NodeSkillRegistry())
        return await runner.run(
            node_type=node_type,
            relative_path="scripts/node.py",
            entry_function=entry_function,
            arguments=arguments,
            runtime_context=runtime_context or {},
        )

    def test_builds_llm_node_with_frontend_defaults_and_dynamic_id(self) -> None:
        result = build_node(
            "llm",
            {"id": "llm-manual"},
            {"graph": SimpleNamespace(nodes=[])},
        )

        node = result["node"]
        self.assertRegex(
            node["id"],
            r"^llm-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        )
        self.assertEqual(node["title"], "大模型")
        self.assertEqual(
            node["description"],
            "调用大语言模型，基于输入变量和提示词生成回复。",
        )
        self.assertEqual(
            node["inputs"],
            [{"name": "input", "type": "String", "description": ""}],
        )
        self.assertEqual(
            node["outputs"],
            [{"name": "result", "type": "String", "description": ""}],
        )
        self.assertEqual(node["config"]["userPrompt"], "{{input}}")
        self.assertEqual(node["config"]["temperature"], 0.7)
        self.assertEqual(node["config"]["maxTokens"], 4096)
        self.assertEqual(node["config"]["outputKey"], "")
        self.assertEqual(
            node["config"]["inputMappings"],
            [
                {
                    "field": "input",
                    "sourceType": "node",
                    "source": "start.input",
                    "valueType": "String",
                }
            ],
        )
        self.assertNotIn("position", node)
        self.assertNotIn("status", node)

    def test_builds_code_node_with_frontend_defaults_and_dynamic_id(self) -> None:
        result = build_node(
            "code",
            {"id": "code-manual"},
            {"graph": SimpleNamespace(nodes=[])},
        )

        node = result["node"]
        self.assertRegex(
            node["id"],
            r"^code-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        )
        self.assertEqual(node["title"], "编码节点")
        self.assertEqual(
            node["description"],
            "在调试沙箱中执行 Python 代码，转换并返回结构化结果。",
        )
        self.assertEqual(
            node["inputs"],
            [
                {
                    "name": "input",
                    "type": "String",
                    "description": "传入代码的上下文对象",
                }
            ],
        )
        self.assertEqual(
            node["outputs"],
            [
                {
                    "name": "code_result",
                    "type": "Object",
                    "description": "代码执行结果",
                }
            ],
        )
        self.assertIn("async def main(args: Args) -> Output:", node["config"]["prompt"])
        self.assertIn('"code_result": {', node["config"]["prompt"])
        self.assertEqual(node["config"]["model"], "Python")
        self.assertEqual(node["config"]["maxTokens"], 600)
        self.assertEqual(node["config"]["responseMode"], "json")
        self.assertEqual(node["config"]["outputKey"], "code_result")
        self.assertEqual(node["config"]["errorStrategy"], "interrupt")
        self.assertNotIn("systemPrompt", node["config"])
        self.assertNotIn("reasoningKey", node["config"])
        self.assertEqual(
            node["config"]["inputMappings"],
            [
                {
                    "field": "input",
                    "sourceType": "node",
                    "source": "start.input",
                    "valueType": "String",
                }
            ],
        )
        self.assertNotIn("position", node)
        self.assertNotIn("status", node)

    def test_lists_only_upstream_node_outputs_as_input_sources(self) -> None:
        graph = SimpleNamespace(
            nodes=[
                _node("start", "开始节点", [("input", "String")]),
                _node("llm-1", "摘要", [("summary", "String")]),
                _node("unrelated", "无关节点", [("value", "Object")]),
                _node("code-1", "编码节点", [("result", "Object")]),
            ],
            edges=[
                SimpleNamespace(source="start", target="llm-1"),
                SimpleNamespace(source="llm-1", target="code-1"),
            ],
        )

        result = list_input_sources(
            {"graph": graph},
            node_id="code-1",
        )

        self.assertEqual(
            result["allowed_source_values"],
            ["llm-1.summary", "start.input"],
        )

    def test_rejects_legacy_context_and_unavailable_node_sources(self) -> None:
        graph = SimpleNamespace(
            nodes=[
                _node("start", "开始节点", [("input", "String")]),
                _node("unrelated", "无关节点", [("value", "String")]),
            ],
            edges=[],
        )
        base_node = {
            "inputs": [{"name": "input", "type": "String", "description": ""}],
            "outputs": [{"name": "result", "type": "String", "description": ""}],
            "config": {"outputKey": "result"},
        }

        context_node = {
            **base_node,
            "config": {
                **base_node["config"],
                "inputMappings": [{
                    "field": "input",
                    "sourceType": "context",
                    "source": "input",
                    "valueType": "String",
                }],
            },
        }
        with self.assertRaisesRegex(ValueError, "literal.*node"):
            validate_node_io(
                context_node,
                {"graph": graph},
                upstream_node_ids=["start"],
            )

        unrelated_node = {
            **base_node,
            "config": {
                **base_node["config"],
                "inputMappings": [{
                    "field": "input",
                    "sourceType": "node",
                    "source": "unrelated.value",
                    "valueType": "String",
                }],
            },
        }
        with self.assertRaisesRegex(ValueError, "unavailable source"):
            validate_node_io(
                unrelated_node,
                {"graph": graph},
                upstream_node_ids=["start"],
            )

    def test_rejects_invalid_output_contracts(self) -> None:
        graph = SimpleNamespace(
            nodes=[_node("start", "开始节点", [("input", "String")])],
            edges=[],
        )
        invalid_output_key = {
            "type": "code",
            "inputs": [],
            "outputs": [
                {"name": "result", "type": "Object", "description": ""}
            ],
            "config": {
                "inputMappings": [],
                "outputKey": "missing",
            },
        }
        with self.assertRaisesRegex(ValueError, "outputKey"):
            validate_node_io(invalid_output_key, {"graph": graph})

        invalid_text_outputs = {
            "type": "llm",
            "inputs": [],
            "outputs": [
                {"name": "first", "type": "String", "description": ""},
                {"name": "second", "type": "String", "description": ""},
            ],
            "config": {
                "inputMappings": [],
                "responseMode": "text",
                "outputKey": "",
                "reasoningKey": "reasoning_content",
            },
        }
        with self.assertRaisesRegex(ValueError, "exactly one primary output"):
            validate_node_io(invalid_text_outputs, {"graph": graph})

    async def test_llm_skill_builds_with_filtered_start_input(self) -> None:
        graph = SimpleNamespace(
            nodes=[_node("start", "开始节点", [("input", "String")])],
            edges=[],
        )

        result = await self.run_node_script(
            node_type="llm",
            entry_function="build_node",
            arguments={
                "data": {},
                "upstream_node_ids": ["start"],
            },
            runtime_context={"graph": graph, "models": []},
        )

        self.assertEqual(
            result["node"]["config"]["inputMappings"][0]["source"],
            "start.input",
        )

    async def test_runs_build_node_with_structured_output(self) -> None:
        graph = SimpleNamespace(
            nodes=[_node("start", "开始节点", [("input", "String")])],
            edges=[],
        )
        result = await self.run_node_script(
            node_type="selector",
            entry_function="build_node",
            arguments={
                "data": {
                    "rules": [
                        {
                            "label": "命中",
                            "conditions": [
                                {
                                    "left": {"source": "start.input"},
                                    "operator": "equals",
                                    "right": {
                                        "value": "input",
                                        "valueType": "String",
                                    },
                                }
                            ],
                        }
                    ]
                },
                "upstream_node_ids": ["start"],
            },
            runtime_context={"graph": graph},
        )

        node = result["node"]
        self.assertEqual(node["type"], "selector")
        self.assertEqual(node["title"], "选择器节点")
        self.assertEqual(node["inputs"], [])
        self.assertEqual(node["outputs"], [])
        self.assertEqual(node["config"]["inputMappings"], [])
        self.assertEqual(node["config"]["selectorElseBranch"], "else")
        self.assertEqual(
            node["config"]["prompt"],
            "{{开始节点.input}} 等于 input=>命中",
        )
        condition = node["config"]["selectorBranches"][0]["conditions"][0]
        self.assertEqual(
            condition["left"],
            {
                "sourceType": "node",
                "source": "start.input",
                "valueType": "String",
                "literalValue": None,
                "contextPath": "",
                "nodeId": "start",
                "fieldPath": "input",
                "displayLabel": "开始节点.input",
            },
        )
        self.assertEqual(condition["right"]["sourceType"], "literal")
        self.assertEqual(condition["right"]["literalValue"], "input")

    async def test_selector_rejects_unavailable_rule_source(self) -> None:
        graph = SimpleNamespace(
            nodes=[_node("start", "开始节点", [("input", "String")])],
            edges=[],
        )

        with self.assertRaisesRegex(ValueError, "use list_input_sources"):
            await self.run_node_script(
                node_type="selector",
                entry_function="build_node",
                arguments={
                    "data": {
                        "rules": [
                            {
                                "label": "命中",
                                "conditions": [
                                    {
                                        "left": {"source": "missing.value"},
                                        "operator": "equals",
                                        "right": {"value": "input"},
                                    }
                                ],
                            }
                        ]
                    },
                    "upstream_node_ids": ["start"],
                },
                runtime_context={"graph": graph},
            )

    async def test_selector_update_preserves_branch_and_condition_ids(
        self,
    ) -> None:
        graph = SimpleNamespace(
            nodes=[_node("start", "开始节点", [("input", "String")])],
            edges=[],
        )
        built = await self.run_node_script(
            node_type="selector",
            entry_function="build_node",
            arguments={
                "data": {
                    "rules": [
                        {
                            "label": "命中",
                            "conditions": [
                                {
                                    "left": {"source": "start.input"},
                                    "operator": "equals",
                                    "right": {"value": "input"},
                                }
                            ],
                        }
                    ]
                },
                "upstream_node_ids": ["start"],
            },
            runtime_context={"graph": graph},
        )
        selector = WorkflowNode.model_validate(built["node"])
        graph.nodes.append(selector)
        graph.edges.append(
            SimpleNamespace(source="start", target=selector.id)
        )
        existing_branch = selector.config.selectorBranches[0]
        existing_condition = existing_branch.conditions[0]

        updated = await self.run_node_script(
            node_type="selector",
            entry_function="update_node",
            arguments={
                "node_id": selector.id,
                "changes": {
                    "rules": [
                        {
                            "label": "命中",
                            "conditions": [
                                {
                                    "left": {"source": "start.input"},
                                    "operator": "equals",
                                    "right": {"value": "updated"},
                                }
                            ],
                        }
                    ]
                },
            },
            runtime_context={"graph": graph},
        )

        next_branch = updated["node"]["config"]["selectorBranches"][0]
        self.assertEqual(next_branch["id"], existing_branch.id)
        self.assertEqual(
            next_branch["conditions"][0]["id"],
            existing_condition.id,
        )
        self.assertEqual(
            next_branch["conditions"][0]["right"]["literalValue"],
            "updated",
        )

    async def test_end_skill_returns_fixed_default_node(self) -> None:
        result = await self.run_node_script(
            node_type="end",
            entry_function="build_node",
            arguments={},
        )

        node = result["node"]
        self.assertRegex(
            node.pop("id"),
            r"^end-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        )
        self.assertEqual(
            node,
            {
                "title": "结束节点",
                "type": "end",
                "description": "返回工作流最终输出。",
                "inputs": [],
                "outputs": [],
                "config": {
                    "prompt": "输出最终结果。",
                    "model": "System",
                    "temperature": 0,
                    "maxTokens": 1200,
                    "enabled": True,
                    "fallbackToHuman": False,
                    "responseMode": "text",
                    "outputKey": "final",
                    "inputMappings": [],
                },
            },
        )

    async def test_filters_models_by_dynamic_capabilities(self) -> None:
        result = await self.run_node_script(
            node_type="llm",
            entry_function="list_models",
            arguments={
                "requirements": {"requires_vision": True},
            },
            runtime_context={
                "models": [
                    {"name": "text-only"},
                    {"name": "vision", "supports_vision": True},
                ],
            },
        )

        self.assertEqual(
            [model["name"] for model in result["models"]],
            ["vision"],
        )
        self.assertEqual(result["recommended_model"], "vision")

    async def test_selector_lists_valid_condition_sources(self) -> None:
        graph = SimpleNamespace(
            nodes=[
                _node("start", "开始节点", [("input", "String")]),
                _node("llm-1", "分类结果", [("category", "String")]),
            ],
            edges=[SimpleNamespace(source="start", target="llm-1")],
        )

        result = await self.run_node_script(
            node_type="selector",
            entry_function="list_input_sources",
            arguments={"upstream_node_ids": ["llm-1"]},
            runtime_context={"graph": graph},
        )

        self.assertEqual(
            result["allowed_source_values"],
            ["llm-1.category", "start.input"],
        )

    async def test_resolves_llm_config_from_model_capabilities(self) -> None:
        result = await self.run_node_script(
            node_type="llm",
            entry_function="resolve_model_config",
            arguments={
                "request": {
                    "requires_vision": True,
                    "enable_thinking": True,
                },
            },
            runtime_context={
                "models": [
                    {
                        "name": "vision-thinking",
                        "supports_vision": True,
                        "supports_thinking": True,
                        "supports_reasoning_effort": True,
                    }
                ],
            },
        )

        self.assertEqual(result["model"], "vision-thinking")
        self.assertTrue(result["thinkingEnabled"])
        self.assertTrue(result["includeReasoningOutput"])
        self.assertEqual(result["reasoningKey"], "reasoning_content")

    async def test_tool_rejects_unloaded_node_type(self) -> None:
        registry = NodeSkillRegistry()
        runner = NodeSkillScriptRunner(registry)
        tool = make_execute_node_skill_script_tool(
            runner,
            skills=registry.load_many({"llm"}),
            read_node_types={"llm"},
            runtime_context={"models": []},
        )

        with self.assertRaisesRegex(ValueError, "is not available"):
            await tool.coroutine(
                path="workflow-node-selector/scripts/node.py",
                function_name="build_node",
                arguments={},
            )

    async def test_tool_caches_node_and_returns_only_its_reference(self) -> None:
        registry = NodeSkillRegistry()
        cached_nodes: list[dict] = []
        tool = make_execute_node_skill_script_tool(
            NodeSkillScriptRunner(registry),
            skills=registry.load_many({"end"}),
            read_node_types={"end"},
            runtime_context={},
            on_node_result=cached_nodes.append,
        )

        result = json.loads(
            await tool.coroutine(
                path="workflow-node-end/scripts/node.py",
                function_name="build_node",
                arguments={},
            )
        )

        self.assertEqual(result["nodeId"], cached_nodes[0]["id"])
        self.assertEqual(result["nodeType"], "end")
        self.assertTrue(result["cached"])
        self.assertNotIn("node", result)

    async def test_tool_reuses_identical_static_model_queries(self) -> None:
        registry = NodeSkillRegistry()
        tool = make_execute_node_skill_script_tool(
            NodeSkillScriptRunner(registry),
            skills=registry.load_many({"llm"}),
            read_node_types={"llm"},
            runtime_context={
                "models": [
                    {
                        "name": "model-1",
                        "supports_vision": False,
                        "supports_thinking": False,
                    }
                ]
            },
        )
        arguments = {
            "requirements": {
                "requires_vision": False,
                "requires_thinking": False,
            }
        }

        first = json.loads(
            await tool.coroutine(
                path="workflow-node-llm/scripts/node.py",
                function_name="list_models",
                arguments=arguments,
            )
        )
        second = json.loads(
            await tool.coroutine(
                path="workflow-node-llm/scripts/node.py",
                function_name="list_models",
                arguments=arguments,
            )
        )

        self.assertEqual(first["recommended_model"], "model-1")
        self.assertTrue(second["reused"])
        self.assertIn("Reuse the previous result", second["instruction"])

    async def test_read_file_reads_loaded_node_skill_text(self) -> None:
        registry = NodeSkillRegistry()
        tool = make_read_node_skill_file_tool(
            registry,
            loaded_skills=registry.load_many({"llm"}),
        )

        content = await tool.ainvoke(
            {"path": "workflow-node-llm/SKILL.md"}
        )

        self.assertIn("# Workflow LLM Node", content)

    async def test_read_file_returns_compact_message_when_repeated(self) -> None:
        registry = NodeSkillRegistry()
        tool = make_read_node_skill_file_tool(
            registry,
            loaded_skills=registry.load_many({"llm"}),
        )

        first = await tool.ainvoke({"path": "workflow-node-llm/SKILL.md"})
        second = await tool.ainvoke({"path": "workflow-node-llm/SKILL.md"})

        self.assertIn("# Workflow LLM Node", first)
        self.assertIn("already loaded", second)
        self.assertNotIn("# Workflow LLM Node", second)

    async def test_read_file_rejects_unloaded_node_skill(self) -> None:
        registry = NodeSkillRegistry()
        tool = make_read_node_skill_file_tool(
            registry,
            loaded_skills=registry.load_many({"llm"}),
        )

        with self.assertRaisesRegex(ValueError, "is not available"):
            await tool.ainvoke(
                {"path": "workflow-node-selector/SKILL.md"}
            )

    async def test_read_file_rejects_python_scripts(self) -> None:
        registry = NodeSkillRegistry()
        tool = make_read_node_skill_file_tool(
            registry,
            loaded_skills=registry.load_many({"llm"}),
        )

        with self.assertRaisesRegex(ValueError, "text reference files"):
            await tool.ainvoke(
                {
                    "path": "workflow-node-llm/scripts/node.py",
                }
            )

    def test_run_node_skill_uses_workflow_id_from_runtime_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir)
            (skill_dir / "scripts").mkdir()
            (skill_dir / "scripts" / "mapping.py").write_text(
                "async def main(args): return args\n",
                encoding="utf-8",
            )
            skill = SimpleNamespace(
                name="workflow-mapping",
                skill_dir=skill_dir,
                get_container_path=lambda base: f"{base}/workflow-mapping",
            )
            storage = SimpleNamespace(load_skills=lambda enabled_only: [skill])
            app_config = SimpleNamespace(
                workflow_agent=SimpleNamespace(
                    skills_container_path_template="/workflows/{workflow_id}/skills",
                    max_tool_output_chars=8000,
                ),
                skills=SimpleNamespace(container_path="/skills"),
            )
            runtime = SimpleNamespace(
                context={"app_config": app_config},
                state={
                    "workflowAssistant": {
                        "workflowId": "workflow-authoritative",
                        "workflow": {"id": "workflow-authoritative"},
                    }
                },
            )
            execute = MagicMock(return_value={"ok": True})

            with (
                patch(
                    "app.agents.workflow_agent.tools.run_node_skill."
                    "get_or_new_skill_storage",
                    return_value=storage,
                ),
                patch(
                    "app.agents.workflow_agent.tools.run_node_skill."
                    "ensure_sandbox_initialized",
                    return_value=object(),
                ),
                patch(
                    "app.agents.workflow_agent.tools.run_node_skill."
                    "execute_sandbox_file",
                    execute,
                ),
            ):
                run_node_skill_tool.func(
                    runtime=runtime,
                    skill_name="workflow-mapping",
                    script_name="mapping.py",
                    payload={"workflowId": "workflow-forged", "value": 1},
                )

        call = execute.call_args.kwargs
        self.assertEqual(
            call["file_path"],
            "/workflows/workflow-authoritative/skills/"
            "workflow-mapping/scripts/mapping.py",
        )
        self.assertEqual(
            call["node_input"],
            {"workflowId": "workflow-authoritative", "value": 1},
        )


if __name__ == "__main__":
    unittest.main()
