export interface GraphNode {
  moduleId: string
  inputModuleIds: string[]  // modules whose outputs feed into this module's inputs
}

export interface SortResult {
  order: string[]           // moduleIds in evaluation order
  feedbackEdges: Array<{ from: string; to: string }>  // cycles, get one-buffer delay
}

export function topologicalSort(nodes: GraphNode[]): SortResult {
  const nodeMap = new Map(nodes.map(n => [n.moduleId, n]))
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const order: string[] = []
  const feedbackEdges: Array<{ from: string; to: string }> = []

  function visit(id: string): void {
    if (inStack.has(id)) {
      // cycle detected — record but don't recurse further
      // the caller tracks which edge caused the cycle
      return
    }
    if (visited.has(id)) return

    inStack.add(id)
    const node = nodeMap.get(id)
    if (node) {
      for (const depId of node.inputModuleIds) {
        if (inStack.has(depId)) {
          feedbackEdges.push({ from: depId, to: id })
        } else {
          visit(depId)
        }
      }
    }
    inStack.delete(id)
    visited.add(id)
    order.push(id)
  }

  for (const node of nodes) {
    visit(node.moduleId)
  }

  return { order, feedbackEdges }
}
