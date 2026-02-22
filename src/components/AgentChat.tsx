import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { GraphData, Node, Edge } from '../types/api';

interface MindMapProps {
  data: GraphData;
}

export const MindMap: React.FC<MindMapProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.nodes.length === 0)
      return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

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
          .distance(150)
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(60));

    // Links (Edges)
    const link = zoomGroup
      .append('g')
      .attr('stroke', '#404040')
      .attr('stroke-opacity', 0.8)
      .selectAll('line')
      .data(data.edges)
      .join('line')
      .attr('stroke-width', 1)
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

    // Node Circles
    node
      .append('circle')
      .attr('r', 20)
      .attr('fill', '#000000')
      .attr('stroke', (d: Node) => {
        if (d.type === 'root') return '#ffffff';
        if (d.type === 'action') return '#aaaaaa';
        return '#ffffff';
      })
      .attr('stroke-width', (d: Node) => (d.type === 'root' ? 3 : 1))
      .attr('stroke-dasharray', (d: Node) =>
        d.type === 'question' ? '4 2' : '0'
      );

    // Icons or Text initials
    node
      .append('text')
      .text((d: Node) =>
        d.type === 'root'
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
      .attr('font-size', '10px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .attr('font-weight', 'bold');

    // Labels (Below node)
    node
      .append('text')
      .text((d: Node) => d.label.toUpperCase())
      .attr('x', 0)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffff')
      .attr('font-size', '10px')
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
  }, [data]);

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

