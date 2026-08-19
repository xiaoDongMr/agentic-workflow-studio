from __future__ import annotations

import unittest

from langchain_core.messages import AIMessage, AIMessageChunk

from app.agents.workflow_agent.model_output import (
    model_output_delta_text,
    model_output_event,
    model_tool_decision_text,
)


class ModelOutputTest(unittest.TestCase):
    def test_extracts_visible_text_and_preserves_whitespace(self) -> None:
        message = AIMessageChunk(
            content=[
                {"type": "reasoning", "text": "hidden"},
                {"type": "text", "text": " 正在规划节点结构 "},
            ],
        )

        content = model_output_delta_text(message)

        self.assertEqual(content, " 正在规划节点结构 ")

    def test_ignores_hidden_reasoning(self) -> None:
        message = AIMessageChunk(
            content=[{"type": "reasoning", "text": "hidden"}],
        )

        content = model_output_delta_text(message)

        self.assertEqual(content, "")

    def test_builds_graph_builder_delta_event(self) -> None:
        event = model_output_event(
            thread_id="thread-1",
            actor="graph-builder",
            actor_label="画布生成器",
            output_id="message-1",
            content="正在生成节点",
        )

        self.assertEqual(
            event,
            {
                "type": "workflow.modelOutput",
                "threadId": "thread-1",
                "actor": "graph-builder",
                "actorLabel": "画布生成器",
                "outputId": "message-1",
                "content": "正在生成节点",
            },
        )

    def test_builds_sanitized_tool_decision_without_arguments(self) -> None:
        message = AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "execute_node_skill_script",
                    "args": {
                        "function_name": "list_input_sources",
                        "arguments": {"secret": "hidden"},
                    },
                    "id": "call-1",
                }
            ],
        )

        content = model_tool_decision_text(message)

        self.assertEqual(content, "正在确认节点可用的上游变量")
        self.assertNotIn("secret", content)

    def test_describes_combined_final_graph_update(self) -> None:
        message = AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "update_current_graph",
                    "args": {"done": True},
                    "id": "call-1",
                }
            ],
        )

        self.assertEqual(
            model_tool_decision_text(message),
            "正在写入并发布最终工作流",
        )


if __name__ == "__main__":
    unittest.main()
