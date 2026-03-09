import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { GraphData, Node, Edge } from '../types/api';

interface MindMapProps {
  data: GraphData;
  mode?: 'default' | 'knowledge';
  focusedNodeId?: string | null;
  onNodeClick?: (node: Node) => void;
}

export const MindMap: React.FC<MindMapProps> = ({
  data,
  mode = 'default',
  focusedNodeId = null,
  onNodeClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.nodes.length === 0)
      return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const isMobile = width < 640;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    const zoomGroup = svg.append('g');

    // Define arrow markers
    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#ffffff');

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        zoomGroup.attr('transform', event.transform as any);
      });

    svg.call(zoom);

    // Simulation
    const simulation = d3
      .forceSimulation<Node, Edge>(data.nodes)
      .force(
        'link',
        d3
          .forceLink<Node, Edge>(data.edges)
          .id((d: Node) => d.id)
          .distance(mode === 'knowledge' ? (isMobile ? 85 : 110) : (isMobile ? 110 : 150))
      )
      .force('charge', d3.forceManyBody().strength(mode === 'knowledge' ? (isMobile ? -180 : -260) : (isMobile ? -260 : -400)))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius((d: any) => {
        if (mode === 'knowledge') {
          const w = Math.max(1, d.weight ?? 1);
          return Math.min(34, 10 + Math.sqrt(w) * 3) + 8;
        }
        return 60;
      }));

    const nodeColor = (d: Node) => {
      if (mode !== 'knowledge') {
        if (d.type === 'root') return '#ffffff';
        if (d.type === 'action') return '#aaaaaa';
        return '#ffffff';
      }
      const raw = (d.rawType || d.type || '').toLowerCase();
      if (raw.includes('concept')) return '#34d399';
      if (raw.includes('term')) return '#60a5fa';
      return '#d1d5db';
    };

    const nodeRadius = (d: Node) => {
      if (mode !== 'knowledge') return 20;
      const w = Math.max(1, d.weight ?? 1);
      return Math.max(8, Math.min(28, 8 + Math.sqrt(w) * 2.8));
    };

    const edgeWidth = (d: Edge) => {
      if (mode !== 'knowledge') return 1;
      const w = Math.max(1, d.weight ?? 1);
      return Math.min(5, 1 + Math.log2(w));
    };

    const edgeDash = (d: Edge) => {
      const t = (d.relationType || d.label || '').toLowerCase();
      if (t.includes('co_occurs')) return '5 4';
      return '0';
    };

    // Links (Edges)
    const link = zoomGroup
      .append('g')
      .attr('stroke', '#404040')
      .attr('stroke-opacity', 0.8)
      .selectAll('line')
      .data(data.edges)
      .join('line')
      .attr('stroke-width', edgeWidth)
      .attr('stroke-dasharray', edgeDash)
      .attr('marker-end', 'url(#arrow)');

    // Nodes Group
    const node = zoomGroup
      .append('g')
      .selectAll('g')
      .data(data.nodes)
      .join('g')
      .call(
        d3
          .drag<SVGGElement, Node>()
          .on('start', dragstarted as any)
          .on('drag', dragged as any)
          .on('end', dragended as any) as any
      );

    if (onNodeClick) {
      node
        .style('cursor', 'pointer')
        .on('click', (_event, d) => onNodeClick(d));
    }

    // Node Circles
    node
      .append('circle')
      .attr('r', nodeRadius)
      .attr('fill', '#000000')
      .attr('stroke', (d: Node) => (focusedNodeId && d.id === focusedNodeId ? '#f59e0b' : nodeColor(d)))
      .attr('stroke-width', (d: Node) => {
        if (focusedNodeId && d.id === focusedNodeId) return 4;
        if (mode === 'knowledge') return 2;
        return d.type === 'root' ? 3 : 1;
      })
      .attr('stroke-dasharray', (d: Node) =>
        d.type === 'question' ? '4 2' : '0'
      );

    // Icons or Text initials
    node
      .append('text')
      .text((d: Node) =>
        mode === 'knowledge'
          ? ((d.rawType || d.type || 'n').slice(0, 2).toUpperCase())
          : d.type === 'root'
          ? 'RT'
          : d.type === 'action'
            ? 'AC'
            : d.type === 'question'
              ? '?'
              : 'CP'
      )
      .attr('x', 0)
      .attr('y', 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffff')
      .attr('font-size', isMobile ? '9px' : '10px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .attr('font-weight', 'bold');

    // Labels (Below node)
    node
      .append('text')
      .text((d: Node) => {
        const lbl = d.label || d.id;
        return mode === 'knowledge' ? lbl : lbl.toUpperCase();
      })
      .attr('x', 0)
      .attr('y', (d: Node) => nodeRadius(d) + 15)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffff')
      .attr('font-size', isMobile ? '8px' : '10px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .attr('letter-spacing', '1px')
      .clone(true)
      .lower()
      .attr('stroke', '#000000')
      .attr('stroke-width', 4);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => (d.source as Node).x!)
        .attr('y1', (d: any) => (d.source as Node).y!)
        .attr('x2', (d: any) => (d.target as Node).x!)
        .attr('y2', (d: any) => (d.target as Node).y!);

      node.attr('transform', (d: Node) => `translate(${d.x},${d.y})`);
    });

    // Fit graph into viewport once layout stabilizes, especially important on mobile.
    simulation.on('end', () => {
      if (data.nodes.length === 0) return;
      const xs = data.nodes.map((n) => n.x ?? 0);
      const ys = data.nodes.map((n) => n.y ?? 0);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const graphW = Math.max(1, maxX - minX);
      const graphH = Math.max(1, maxY - minY);
      const padding = isMobile ? 44 : 80;
      const scale = Math.min(
        1.6,
        Math.max(
          0.45,
          Math.min((width - padding * 2) / graphW, (height - padding * 2) / graphH)
        )
      );
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const transform = d3.zoomIdentity
        .translate(width / 2 - cx * scale, height / 2 - cy * scale)
        .scale(scale);
      svg.transition().duration(450).call(zoom.transform as any, transform);
    });

    if (focusedNodeId) {
      const focusNode = data.nodes.find((n) => n.id === focusedNodeId);
      if (focusNode && focusNode.x != null && focusNode.y != null) {
        const transform = d3.zoomIdentity
          .translate(width / 2 - focusNode.x, height / 2 - focusNode.y)
          .scale(1.3);
        svg.transition().duration(450).call(zoom.transform as any, transform);
      }
    }

    function dragstarted(event: d3.D3DragEvent<SVGGElement, Node, Node>) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, Node, Node>) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, Node, Node>) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [data, focusedNodeId, mode, onNodeClick]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-black"
    >
      <svg
        ref={svgRef}
        className="w-full h-full cursor-crosshair active:cursor-grabbing"
      />
    </div>
  );
};

