import {
  Bot,
  Braces,
  CheckCircle2,
  Circle,
  FileCode2,
  Flag,
  GitBranch,
  Home,
  Sparkles,
  Waypoints,
} from 'lucide-react'
import type { WorkflowNodeRegistry } from '@flowgram.ai/free-layout-editor'

import {
  DEFAULT_LOOP_CANVAS_HEIGHT,
  DEFAULT_LOOP_CANVAS_WIDTH,
} from '@/features/workflow/editor/loop-node.utils'
import type { WorkflowNode } from '@/types/workflow'

export const CANVAS_OFFSET_X = 420
export const CANVAS_OFFSET_Y = 90
export const NODE_GAP_X = 308
export const NODE_GAP_Y = 142

export const paletteToNodeType: Record<string, WorkflowNode['type']> = {
  llm: 'llm',
  selector: 'selector',
  loop: 'loop',
  code: 'code',
  end: 'end',
}

export const bottomLibrarySections = [
  {
    title: '基础能力',
    items: [
      { title: '大模型', icon: Bot, nodeKey: 'llm' as const },
      { title: '选择器', icon: GitBranch, nodeKey: 'selector' as const },
      { title: '循环', icon: Waypoints, nodeKey: 'loop' as const },
      { title: '编码', icon: FileCode2, nodeKey: 'code' as const },
      { title: '结束', icon: Circle, nodeKey: 'end' as const },
    ],
  },
] as const

export const nodeIcons = {
  start: Flag,
  llm: Sparkles,
  selector: GitBranch,
  loop: Waypoints,
  'loop-start': Home,
  'loop-end': Flag,
  code: Braces,
  end: CheckCircle2,
} as const

export const nodeThemeClass = {
  start: 'aw-flow-node--start',
  llm: 'aw-flow-node--intent',
  selector: 'aw-flow-node--condition',
  loop: 'aw-flow-node--http',
  'loop-start': 'aw-flow-node--loop-start',
  'loop-end': 'aw-flow-node--loop-end',
  code: 'aw-flow-node--skill',
  end: 'aw-flow-node--response',
} as const

export const defaultRegistries: WorkflowNodeRegistry[] = [
  {
    type: 'start',
    meta: {
      isStart: true,
      deleteDisable: true,
      copyDisable: true,
      size: { width: 300, height: 146 },
      defaultPorts: [{ type: 'output' }],
    },
  },
  {
    type: 'llm',
    meta: {
      size: { width: 320, height: 154 },
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
  {
    type: 'selector',
    meta: {
      size: { width: 320, height: 154 },
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
  {
    type: 'loop',
    meta: {
      isContainer: true,
      size: { width: DEFAULT_LOOP_CANVAS_WIDTH + 32, height: DEFAULT_LOOP_CANVAS_HEIGHT + 142 },
      padding: () => ({
        top: 142,
        bottom: 48,
        left: 32,
        right: 32,
      }),
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
  {
    type: 'loop-canvas-anchor',
    meta: {
      size: { width: 58, height: 58 },
      defaultPorts: [{ type: 'output' }],
    },
  },
  {
    type: 'code',
    meta: {
      size: { width: 320, height: 154 },
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
  {
    type: 'end',
    meta: {
      size: { width: 320, height: 154 },
      defaultPorts: [{ type: 'input' }],
    },
  },
]

export const defaultNodeContent: Record<WorkflowNode['type'], Omit<WorkflowNode, 'id' | 'position' | 'type'>> = {
  start: {
    title: '开始节点',
    description: '接收用户输入并启动流程。',
    status: 'success',
    inputs: [],
    outputs: [{ name: 'input', type: 'String', description: '用户输入' }],
    config: {
      prompt: '提取用户问题中的关键信息。',
      model: 'GPT-4o',
      temperature: 0.2,
      maxTokens: 500,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'text',
      outputKey: 'input',
      inputMappings: [],
    },
  },
  llm: {
    title: '大模型',
    description: '调用大语言模型，基于输入变量和提示词生成回复。',
    status: 'active',
    inputs: [],
    outputs: [],
    config: {
      prompt: '',
      systemPrompt: '你是一个工作流节点，请根据输入生成简洁、准确的结果。',
      userPrompt: '{{input}}',
      model: '',
      modelProvider: 'deerflow',
      temperature: 0.7,
      maxTokens: 4096,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'text',
      outputKey: 'output',
      reasoningKey: 'reasoning_content',
      inputMappings: [],
      visionInputAsBase64: false,
      supportContinuation: false,
      thinkingEnabled: false,
      reasoningEffort: 'medium',
      timeoutSeconds: 180,
      retryCount: 1,
      errorStrategy: 'ignore',
      fallbackOutput: '',
    },
  },
  selector: {
    title: '选择器节点',
    description: '按条件命中一个下游分支，未命中时进入否则分支。',
    status: 'idle',
    inputs: [],
    outputs: [],
    config: {
      prompt: '',
      model: 'Rule Engine',
      temperature: 0,
      maxTokens: 300,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'json',
      outputKey: 'branch',
      inputMappings: [],
      selectorBranches: [
        {
          id: 'selector_branch_if',
          label: 'if',
          conditions: [
            {
              id: 'selector_condition_if',
              operator: 'equals',
              left: { sourceType: 'node', source: '', nodeId: '', fieldPath: '', valueType: 'String' },
              right: { sourceType: 'literal', source: '', literalValue: '', valueType: 'String' },
            },
          ],
        },
      ],
      selectorElseBranch: 'else',
    },
  },
  loop: {
    title: '循环节点',
    description: '按数组或指定次数执行循环体子图，并聚合每轮结果。',
    status: 'idle',
    inputs: [],
    outputs: [],
    config: {
      prompt: '按循环配置执行子图。',
      model: 'Loop Engine',
      temperature: 0,
      maxTokens: 600,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'json',
      outputKey: 'loop_results',
      inputMappings: [],
      loopMode: 'array',
      loopArraySource: '',
      loopCount: 3,
      loopIntermediateVariables: [],
      loopBodyNodes: [],
      loopBodyEdges: [],
      loopOutputs: [],
      loopCanvasWidth: DEFAULT_LOOP_CANVAS_WIDTH,
      loopCanvasHeight: DEFAULT_LOOP_CANVAS_HEIGHT,
    },
  },
  'loop-start': {
    title: '循环开始',
    description: '当前轮循环体的开始端点，可连接到第一个子节点。',
    status: 'idle',
    inputs: [],
    outputs: [{ name: 'start', type: 'Object', description: '循环开始信号' }],
    config: {
      prompt: '循环体开始端点。',
      model: 'Loop Engine',
      temperature: 0,
      maxTokens: 0,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'json',
      outputKey: 'start',
      inputMappings: [],
    },
  },
  'loop-end': {
    title: '循环结束',
    description: '当前轮循环体的结束端点，可由最后一个子节点连接进入。',
    status: 'idle',
    inputs: [{ name: 'done', type: 'Object', description: '循环结束信号' }],
    outputs: [],
    config: {
      prompt: '循环体结束端点。',
      model: 'Loop Engine',
      temperature: 0,
      maxTokens: 0,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'json',
      outputKey: 'done',
      inputMappings: [],
    },
  },
  code: {
    title: '编码节点',
    description: '执行受限 Python 代码转换上下文。',
    status: 'idle',
    inputs: [],
    outputs: [],
    config: {
      prompt: 'result = {"branch": input.get("branch"), "loop_count": input.get("count", 0)}',
      model: 'Python',
      temperature: 0,
      maxTokens: 600,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'json',
      outputKey: 'code_result',
      inputMappings: [],
    },
  },
  end: {
    title: '结束节点',
    description: '返回工作流最终输出。',
    status: 'idle',
    inputs: [],
    outputs: [],
    config: {
      prompt: '输出最终结果。',
      model: 'System',
      temperature: 0,
      maxTokens: 1200,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'text',
      outputKey: 'final',
      inputMappings: [],
    },
  },
}
