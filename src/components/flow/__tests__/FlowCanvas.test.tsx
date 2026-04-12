import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { FlowCanvas } from "../FlowCanvas";

vi.mock("@xyflow/react", async () => {
  const ReactModule = await import("react");

  function useNodesState(initialNodes: unknown[]) {
    const [nodes, setNodes] = ReactModule.useState(initialNodes);
    return [nodes, setNodes, vi.fn()] as const;
  }

  function useEdgesState(initialEdges: unknown[]) {
    const [edges, setEdges] = ReactModule.useState(initialEdges);
    return [edges, setEdges, vi.fn()] as const;
  }

  return {
    ReactFlow: ({ nodes }: { nodes: Array<{ id: string; data?: { ruleName?: string } }> }) => (
      <div>
        {nodes.map((node) => (
          <div key={node.id}>{node.data?.ruleName ?? node.id}</div>
        ))}
      </div>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: () => null,
    Position: { Left: "left", Right: "right" },
    BackgroundVariant: { Dots: "dots" },
    useNodesState,
    useEdgesState,
    addEdge: vi.fn((edge, edges) => [...edges, edge]),
  };
});

describe("FlowCanvas", () => {
  it("refreshes rendered nodes when props change without a remount", () => {
    const { rerender } = render(
      <FlowCanvas
        initialNodes={[
          {
            id: "match-rule-1",
            type: "match",
            position: { x: 0, y: 0 },
            data: {
              kind: "match",
              ruleId: "rule-1",
              ruleName: "Old Rule",
              matchType: "domain-suffix",
              matchValue: "old.example.com",
              enabled: true,
              order: 0,
            },
          },
        ]}
        initialEdges={[]}
        onConnect={vi.fn()}
      />
    );

    expect(screen.getByText("Old Rule")).toBeTruthy();

    rerender(
      <FlowCanvas
        initialNodes={[
          {
            id: "match-rule-1",
            type: "match",
            position: { x: 0, y: 0 },
            data: {
              kind: "match",
              ruleId: "rule-1",
              ruleName: "New Rule",
              matchType: "domain-suffix",
              matchValue: "new.example.com",
              enabled: true,
              order: 0,
            },
          },
        ]}
        initialEdges={[]}
        onConnect={vi.fn()}
      />
    );

    expect(screen.queryByText("Old Rule")).toBeNull();
    expect(screen.getByText("New Rule")).toBeTruthy();
  });
});
