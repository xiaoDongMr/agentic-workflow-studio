from __future__ import annotations

import unittest

from app.agent_platform.registry import AgentRegistry
from app.services.runs import _build_run_config


class AgentRegistryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.registry = AgentRegistry()

    def test_resolves_builtin_agents_and_aliases(self) -> None:
        lead = self.registry.resolve(None)
        workflow = self.registry.resolve("workflow_agent")

        self.assertEqual(lead.id, "lead_agent")
        self.assertEqual(workflow.id, "workflow-agent")
        self.assertTrue(lead.builtin)
        self.assertTrue(workflow.builtin)

    def test_unknown_valid_id_preserves_custom_agent_behavior(self) -> None:
        definition = self.registry.resolve("support-agent")
        config = _build_run_config(
            "thread-1",
            None,
            None,
            agent_definition=definition,
        )

        self.assertFalse(definition.builtin)
        self.assertEqual(
            config["configurable"]["agent_name"],
            "support-agent",
        )

    def test_builtin_agent_does_not_set_custom_agent_name(self) -> None:
        definition = self.registry.resolve("workflow-agent")
        config = _build_run_config(
            "thread-1",
            None,
            None,
            agent_definition=definition,
        )

        self.assertNotIn("agent_name", config["configurable"])


if __name__ == "__main__":
    unittest.main()
