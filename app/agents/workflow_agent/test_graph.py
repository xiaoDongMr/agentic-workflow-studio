import unittest
from app.agents.workflow_agent.graph import make_workflow_agent
from app.agents.workflow_agent.react_factory import make_workflow_react_agent


class WorkflowAgentGraphTest(unittest.TestCase):
    def test_public_factory_is_top_level_react_agent(self) -> None:
        self.assertIs(make_workflow_agent, make_workflow_react_agent)


if __name__ == "__main__":
    unittest.main()
