import { EventEmitter, Injectable } from '@angular/core';
import * as d3 from './d3-imports';
import { BaseType, D3DragEvent, HierarchyPointNode } from './d3-imports';
import { SerializableMapping, DataNode } from './d3.types';

@Injectable({
  providedIn: 'root'
})
export class D3Service {

  private _mappings: SerializableMapping[] = [];

  public updateMappingsEvent = new EventEmitter<SerializableMapping[]>();

  constructor() { }

  getD3Selection<GElement extends BaseType, OldDatum>(element: GElement | string) {
    // check to make typescript happy
    if (typeof element === "string") {
      return d3.select<GElement, OldDatum>(element) as d3.Selection<GElement, OldDatum, Element, any>;
    }
    return d3.select<GElement, OldDatum>(element) as unknown as d3.Selection<GElement, OldDatum, Element, any>;
  }
  private getD3ChildSelection<PElem extends SVGElement, /* CElem extends SVGElement,  */OldDatum>(container: PElem | string, childSelector: string) {
    if (typeof container === "string") {
      return d3.select<SVGGElement, OldDatum>(`${container} ${childSelector}`) as d3.Selection<SVGGElement, OldDatum, Element, any>;
    }
    return (d3.select<PElem, OldDatum>(container) as unknown as d3.Selection<PElem, OldDatum, Element, any>)
      .select<SVGGElement>(childSelector);
  }

  convertData(rootName: string, data: any): DataNode {
    if (data !== null && typeof data === "object") {
      return {
        key: rootName,
        type: "object",
        children: Object.entries(data).map(([key, value]) => this.convertData(key, value))
      }
    }

    return {
      key: rootName,
      value: data,
      type: data === null ? "null" : typeof data
    }
  }

  createCluster(data: DataNode, width: number, height: number) {
    const rootNode = d3.hierarchy(data);
    const clusterLayout = d3.cluster<DataNode>()
      .size([height, width]);
    return clusterLayout(rootNode);
  }

  generateClusterNodes(clusterDecendants: d3.HierarchyPointNode<DataNode>[], containerElem: SVGGElement | string, svgSelection: d3.Selection<SVGSVGElement, unknown, null, any>, clusterWidth: number, offsetWidth: number, offsetHeight: number, invertAxis: boolean) {
    // d3.select<SVGElement, unknown>(`${containerSelector} .nodes`)
    const link = d3.link(d3.curveBumpX);
    this.getD3ChildSelection<SVGGElement, unknown>(containerElem, '.nodes')
      .selectAll<SVGCircleElement, unknown>('circle.node')
      .data(clusterDecendants)
      .join<SVGCircleElement>('circle')
      .classed('node', true)
      .attr('cx', (d) => { return !invertAxis ? d.y + offsetWidth : clusterWidth - d.y + offsetWidth })
      .attr('cy', (d) => { return d.x + offsetHeight; })
      .attr('r', 4)
      .call(d3.drag<SVGCircleElement, HierarchyPointNode<DataNode>>()
        .on("start", this.handleSVGDragStart(clusterWidth, invertAxis, svgSelection, offsetWidth, offsetHeight, link))
        .on("drag", this.handleSVGDragging(svgSelection, link))
        .on("end", this.handleSVGDragStop(clusterWidth, invertAxis, svgSelection, offsetWidth, offsetHeight, link))
      )
  }

  generateClusterLinks(clusterLinks: d3.HierarchyPointLink<DataNode>[], containerElem: SVGGElement | string, clusterWidth: number, offsetWidth: number, offsetHeight: number, invertAxis: boolean) {
    const link = d3.link(d3.curveBumpX);
    this.getD3ChildSelection<SVGGElement, unknown>(containerElem, '.links')
      .selectAll('path.link')
      .data(clusterLinks)
      .join('path')
      .classed('link', true)
      .attr('d', (d) =>
        !invertAxis ? link({
          source: [d.source.y + offsetWidth, d.source.x + offsetHeight],
          target: [d.target.y + offsetWidth, d.target.x + offsetHeight]
        }) : link({
          source: [clusterWidth - d.source.y + offsetWidth, d.source.x + offsetHeight],
          target: [clusterWidth - d.target.y + offsetWidth, d.target.x + offsetHeight]
        })
      );
  }

  generateClusterOverlay(clusterDecendants: d3.HierarchyPointNode<DataNode>[], containerElem: SVGGElement | string, clusterWidth: number, offsetWidth: number, offsetHeight: number, invertAxis: boolean) {
    this.getD3ChildSelection<SVGGElement, unknown>(containerElem, '.overlay')
      .selectAll('text')
      .data(clusterDecendants)
      .join('text')
      .attr('x', (d) => !invertAxis ? d.y + offsetWidth : clusterWidth - d.y + offsetWidth)
      .attr('y', (d) => d.x + offsetHeight)
      .text((d) => `${d.data.key}: ${d.data.type}`)
      .attr('text-anchor', !invertAxis ? 'end' : 'start')
      .attr('transform', (d) => !invertAxis ? `translate(-10, 4)` : `translate(10, 4)`);
  }

  generateCluster(cluster: d3.HierarchyPointNode<DataNode>, containerElem: SVGGElement | string, clusterWidth: number, offsetWidth: number = 0, offsetHeight: number = 0, invertAxis: boolean = false) {
    // d3.select(document.querySelector<SVGGElement>(`${containerSelector} ${nodesSelector}`)!.parentElement)
    //   .attr('offsetWidth', offsetWidth)
    //   .attr('offsetHeight', offsetHeight);

    const svgElem = typeof containerElem === 'string' ?
      d3.select<SVGSVGElement, unknown>(document.querySelector<SVGGElement>(containerElem)!.parentElement as Element as SVGSVGElement) :
      d3.select<SVGSVGElement, unknown>(containerElem.parentElement as Element as SVGSVGElement);

    svgElem
      .attr('offsetWidth', offsetWidth)
      .attr('offsetHeight', offsetHeight);

    this.generateClusterNodes(cluster.descendants(), containerElem, svgElem, clusterWidth, offsetWidth, offsetHeight, invertAxis);
    this.generateClusterLinks(cluster.links(), containerElem, clusterWidth, offsetWidth, offsetHeight, invertAxis);
    this.generateClusterOverlay(cluster.descendants(), containerElem, clusterWidth, offsetWidth, offsetHeight, invertAxis);
  }

  private handleSVGDragStart(width: number, invertAxis: boolean, svgSelection: d3.Selection<SVGSVGElement, unknown, null, any>, offsetWidth: number, offsetHeight: number, link: d3.Link<any, d3.DefaultLinkObject, [number, number]>) {
    return function <T extends Element>(this: T, event: D3DragEvent<T, unknown, HierarchyPointNode<DataNode>>, d: HierarchyPointNode<DataNode>) {
      const sourceX = invertAxis ? width - event.y + offsetWidth : event.y + offsetWidth;
      const sourceY = event.x + offsetHeight;

      const mouseEvent = event.sourceEvent as MouseEvent;
      const svg = svgSelection.node()!;
      const pt = svg.createSVGPoint();
      pt.x = mouseEvent.clientX; pt.y = mouseEvent.clientY;

      const svgCoords = pt.matrixTransform(svg.getScreenCTM()!.inverse());
      const offsetX = svgCoords.x - sourceX;
      const offsetY = svgCoords.y - sourceY;

      svgSelection
        .append('circle').lower()
        .classed('dragging', true)
        .attr('cx', sourceX + offsetX)
        .attr('cy', sourceY + offsetY)
        .attr('r', 4);

      svgSelection
        .append('path').lower()
        .classed('dragging', true)
        .attr('source', `${sourceX},${sourceY}`)
        .attr('d', link({
          source: [sourceX, sourceY],
          target: [sourceX + offsetX, sourceY + offsetY]
        }));
    }
  }

  private handleSVGDragging(svgSelection: d3.Selection<SVGSVGElement, unknown, null, any>, link: d3.Link<any, d3.DefaultLinkObject, [number, number]>) {
    return function <T extends Element>(this: T, event: D3DragEvent<T, unknown, HierarchyPointNode<DataNode>>, d: HierarchyPointNode<DataNode>) {
      const draggingElem = svgSelection.select<SVGCircleElement>('circle.dragging');
      const draggingPath = svgSelection.select<SVGPathElement>('path.dragging');
      const currX = +draggingElem.attr('cx');
      const currY = +draggingElem.attr('cy');
      const sourcePos = draggingPath.attr('source').split(',').map(Number) as [number, number];

      draggingElem
        .attr('cx', currX + event.dx)
        .attr('cy', currY + event.dy);

      draggingPath
        .attr('d', link({
          source: sourcePos,
          target: [currX + event.dx, currY + event.dy]
        }));
    }
  }

  private handleSVGDragStop(width: number, invertAxis: boolean, svgSelection: d3.Selection<SVGSVGElement, unknown, null, any>, offsetWidth: number, offsetHeight: number, link: d3.Link<any, d3.DefaultLinkObject, [number, number]>) {
    return function <T extends Element>(this: T, event: D3DragEvent<T, unknown, HierarchyPointNode<DataNode>>, d: HierarchyPointNode<DataNode>) {
      const mouseEvent = event.sourceEvent as MouseEvent;
      const targetElem = d3.select<SVGPathElement | Element, HierarchyPointNode<DataNode>>(mouseEvent.target as Element);
      const targetNode = targetElem.datum();
      svgSelection.select('circle.dragging').remove();
      svgSelection.select('path.dragging').remove();

      if (targetNode != null) {
        const [targetOffsetW, targetOffsetH] = ((selection: d3.Selection<Element, HierarchyPointNode<DataNode>, null, undefined>) => {
          const offsetElem = d3.select(selection.node()!.parentElement!.parentElement);
          return [offsetElem.attr("offsetWidth"), offsetElem.attr("offsetHeight")];
        })(targetElem);

        const sourceX = invertAxis ? width - d.y + offsetWidth : d.y + offsetWidth;
        const sourceY = d.x + offsetHeight;
        const targetX = !invertAxis ? width - targetNode.y + (+targetOffsetW) : targetNode.y + (+targetOffsetW);
        const targetY = targetNode.x + (+targetOffsetH);

        svgSelection.select('g.connections')
          .append('path')
          .attr('d', link({
            source: [sourceX, sourceY],
            target: [targetX, targetY]
          }));
      }
    }
  }

}