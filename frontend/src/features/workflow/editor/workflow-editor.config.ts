import {
  Bot,
  Braces,
  CheckCircle2,
  Circle,
  FileCode2,
  Flag,
  GitBranch,
  Sparkles,
  Waypoints,
} from 'lucide-react'
import type { WorkflowNodeRegistry } from '@flowgram.ai/free-layout-editor'

import type { WorkflowNode } from '@/types/workflow'

export const CANVAS_OFFSET_X = 420
export const CANVAS_OFFSET_Y = 90
export const NODE_GAP_X = 264
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
  code: Braces,
  end: CheckCircle2,
} as const

export const nodeThemeClass = {
  start: 'aw-flow-node--start',
  llm: 'aw-flow-node--intent',
  selector: 'aw-flow-node--condition',
  loop: 'aw-flow-node--http',
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
      size: { width: 228, height: 132 },
      defaultPorts: [{ type: 'output' }],
    },
  },
  {
    type: 'llm',
    meta: {
      size: { width: 236, height: 144 },
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
  {
    type: 'selector',
    meta: {
      size: { width: 236, height: 144 },
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
  {
    type: 'loop',
    meta: {
      size: { width: 236, height: 144 },
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
  {
    type: 'code',
    meta: {
      size: { width: 236, height: 144 },
      defaultPorts: [{ type: 'input' }, { type: 'output' }],
    },
  },
  {
    type: 'end',
    meta: {
      size: { width: 236, height: 144 },
      defaultPorts: [{ type: 'input' }],
    },
  },
]

export const defaultNodeContent: Record<WorkflowNode['type'], Omit<WorkflowNode, 'id' | 'position' | 'type'>> = {
  start: {
    title: '开始节点',
    description: '接收用户输入并启动流程。',
    status: 'success',
    inputs: [{ name: 'userInput', type: 'string', description: '用户输入的问题文本' }],
    outputs: [{ name: 'query', type: 'string', description: '标准化后的查询文本' }],
    config: {
      prompt: '提取用户问题中的关键信息。',
      model: 'GPT-4o',
      temperature: 0.2,
      maxTokens: 500,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'text',
      outputKey: 'query',
      inputMappings: [{ field: 'userInput', sourceType: 'context', source: 'message.content' }],
    },
  },
  llm: {
    title: '大模型节点',
    description: '调用后端配置的大模型处理输入。',
    status: 'active',
    inputs: [{ name: 'query', type: 'string', description: '用户问题文本' }],
    outputs: [{ name: 'llm_output', type: 'string', description: '大模型输出文本' }],
    config: {
      prompt: '你是一个工作流节点，请根据输入生成简洁、准确的结果。',
      model: '',
      temperature: 0.3,
      maxTokens: 800,
      enabled: true,
      fallbackToHuman: true,
      responseMode: 'text',
      outputKey: 'llm_output',
      inputMappings: [{ field: 'query', sourceType: 'node', source: 'start.query' }],
    },
  },
  selector: {
    title: '选择器节点',
    description: '根据规则选择一个分支标签。',
    status: 'idle',
    inputs: [{ name: 'text', type: 'string', description: '待匹配文本' }],
    outputs: [{ name: 'branch', type: 'string', description: '命中的分支标签' }],
    config: {
      prompt: '查询=>search\n订单=>order\n退款=>refund',
      model: 'Rule Engine',
      temperature: 0,
      maxTokens: 300,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'json',
      outputKey: 'branch',
      inputMappings: [{ field: 'text', sourceType: 'node', source: 'llm.llm_output' }],
    },
  },
  loop: {
    title: '循环节点',
    description: '遍历数组输入并输出处理摘要。',
    status: 'idle',
    inputs: [{ name: 'items', type: 'array', description: '待遍历项目' }],
    outputs: [{ name: 'loop_items', type: 'array', description: '循环处理结果' }],
    config: {
      prompt: '遍历输入数组并返回每一项的处理结果。',
      model: 'Loop Engine',
      temperature: 0,
      maxTokens: 600,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'json',
      outputKey: 'loop_items',
      inputMappings: [{ field: 'items', sourceType: 'context', source: 'items' }],
    },
  },
  code: {
    title: '编码节点',
    description: '执行受限 Python 代码转换上下文。',
    status: 'idle',
    inputs: [{ name: 'input', type: 'json', description: '代码输入' }],
    outputs: [{ name: 'code_result', type: 'json', description: '代码执行结果' }],
    config: {
      prompt: 'result = {"branch": input.get("branch"), "loop_count": input.get("count", 0)}',
      model: 'Python',
      temperature: 0,
      maxTokens: 600,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'json',
      outputKey: 'code_result',
      inputMappings: [
        { field: 'branch', sourceType: 'node', source: 'selector.branch' },
        { field: 'count', sourceType: 'node', source: 'loop.count' },
      ],
    },
  },
  end: {
    title: '结束节点',
    description: '返回工作流最终输出。',
    status: 'idle',
    inputs: [{ name: 'result', type: 'json', description: '待输出结果' }],
    outputs: [{ name: 'final', type: 'json', description: '最终输出' }],
    config: {
      prompt: '输出最终结果。',
      model: 'System',
      temperature: 0,
      maxTokens: 1200,
      enabled: true,
      fallbackToHuman: false,
      responseMode: 'text',
      outputKey: 'final',
      inputMappings: [{ field: 'result', sourceType: 'node', source: 'code.code_result' }],
    },
  },
}
