import { v4 as uuid } from "uuid";

export type Condition =
  | "green" | "fairway" | "tee" | "bunker" | "water" | "hazard" | "OB" | "recovery" | "rough";

export type UserPolygon = {
  id: string;
  condition: Condition;
  positionsLL: Array<{ lon: number; lat: number }>; // closed ring
};

export type Callbacks = {
  onUpdate?: (polys: UserPolygon[]) => void;
  onState?: (state: { isDrawing: boolean; condition?: Condition; vertices: number }) => void;
};

export const CONDITION_COLORS = {
  green:   { fill: "rgba(108,200,138,0.25)", outline: "#52a373" },
  fairway: { fill: "rgba(40,150,60,0.20)",   outline: "#4a8560" },
  tee:     { fill: "rgba(156,204,220,0.25)", outline: "#7ba3c2" },
  bunker:  { fill: "rgba(190,160,120,0.40)", outline: "#b8a082" },
  water:   { fill: "rgba(80,129,207,0.35)", outline: "#5a8db3" },
  hazard:  { fill: "rgba(201,76,60,0.30)",   outline: "#c4685c" },
  OB:      { fill: "rgba(200,200,200,0.50)", outline: "#666666" },
  recovery:{ fill: "rgba(122,68,153,0.30)",  outline: "#7a5499" }, // muted purple
  rough:   { fill: "rgba(87,122,35,0.30)",  outline: "#6b8e57" },
} as const;

export class ConditionDrawingManager {
  private userPolygons: UserPolygon[] = [];
  private isDrawingMode = false;
  private currentCondition?: Condition;
  private currentPolygonPoints: Array<{ lon: number; lat: number }> = [];
  private vertexEntities: any[] = [];
  private drawingPolygonEntity: any = null;
  private committedEntities: Array<{ polygonEntity: any; vertexEntities: any[] }> = [];
  private handler: any = null;

  constructor(private viewer: any, private cb?: Callbacks) {
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.viewer || this.handler) return;

    const Cesium = (window as any).Cesium;
    this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    // Handle left clicks to add vertices while drawing
    this.handler.setInputAction((click: any) => {
      if (!this.isDrawingMode) return;

      const ray = this.viewer.camera.getPickRay(click.position);
      const pickedPosition = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      
      if (!pickedPosition) return;

      const cartographic = Cesium.Cartographic.fromCartesian(pickedPosition);
      const longitude = Cesium.Math.toDegrees(cartographic.longitude);
      const latitude = Cesium.Math.toDegrees(cartographic.latitude);

      this.addVertex({ lon: longitude, lat: latitude });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Handle mouse move to show preview line
    this.handler.setInputAction((movement: any) => {
      if (!this.isDrawingMode || this.currentPolygonPoints.length === 0) return;

      const ray = this.viewer.camera.getPickRay(movement.endPosition);
      const pickedPosition = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      
      if (!pickedPosition) return;

      const cartographic = Cesium.Cartographic.fromCartesian(pickedPosition);
      const longitude = Cesium.Math.toDegrees(cartographic.longitude);
      const latitude = Cesium.Math.toDegrees(cartographic.latitude);

      this.updatePreviewPolygon({ lon: longitude, lat: latitude });
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  start(condition: Condition): void {
    // Reset any previous drawing state
    this.cancel();

    this.isDrawingMode = true;
    this.currentCondition = condition;
    this.currentPolygonPoints = [];
    this.clearPreviewEntities();

    this.notifyStateChange();
  }

  finish(): void {
    if (!this.isDrawingMode || this.currentPolygonPoints.length < 3 || !this.currentCondition) {
      return;
    }

    // Close the polygon by repeating the first vertex
    const closedVertices = [...this.currentPolygonPoints, this.currentPolygonPoints[0]];

    // Create user polygon
    const userPolygon: UserPolygon = {
      id: uuid(),
      condition: this.currentCondition,
      positionsLL: closedVertices
    };

    this.userPolygons.push(userPolygon);
    
    // Create final committed entities
    this.createCommittedPolygon(userPolygon);
    
    // Reset drawing state
    this.resetDrawingState();
    
    // Notify callbacks
    if (this.cb?.onUpdate) {
      this.cb.onUpdate([...this.userPolygons]);
    }
    this.notifyStateChange();
  }

  cancel(): void {
    this.clearPreviewEntities();
    this.resetDrawingState();
    this.notifyStateChange();
  }

  removeLast(): void {
    if (this.userPolygons.length === 0) return;

    // Remove last polygon from data
    this.userPolygons.pop();
    
    // Remove last committed entities
    const lastCommitted = this.committedEntities.pop();
    if (lastCommitted) {
      this.viewer.entities.remove(lastCommitted.polygonEntity);
      lastCommitted.vertexEntities.forEach((entity: any) => {
        this.viewer.entities.remove(entity);
      });
    }
    
    if (this.cb?.onUpdate) {
      this.cb.onUpdate([...this.userPolygons]);
    }
  }

  clearAll(): void {
    // Clear all user polygons
    this.userPolygons = [];
    
    // Remove all committed entities
    this.committedEntities.forEach(({ polygonEntity, vertexEntities }) => {
      this.viewer.entities.remove(polygonEntity);
      vertexEntities.forEach((entity: any) => {
        this.viewer.entities.remove(entity);
      });
    });
    this.committedEntities = [];
    
    // Clear any preview entities
    this.clearPreviewEntities();
    this.resetDrawingState();
    
    if (this.cb?.onUpdate) {
      this.cb.onUpdate([]);
    }
    this.notifyStateChange();
  }

  getPolygons(): UserPolygon[] {
    return [...this.userPolygons];
  }

  isDrawing(): boolean {
    return this.isDrawingMode;
  }

  private addVertex(position: { lon: number; lat: number }): void {
    if (!this.isDrawingMode) return;

    this.currentPolygonPoints.push(position);
    this.createVertexMarker(position);
    this.updatePreviewPolygon();
    this.notifyStateChange();
  }

  private createVertexMarker(position: { lon: number; lat: number }): void {
    const Cesium = (window as any).Cesium;
    
    const entity = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(position.lon, position.lat),
      point: {
        pixelSize: 6,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    
    this.vertexEntities.push(entity);
  }

  private updatePreviewPolygon(mousePosition?: { lon: number; lat: number }): void {
    if (!this.isDrawingMode || !this.currentCondition) return;

    // Remove existing preview polygon
    if (this.drawingPolygonEntity) {
      this.viewer.entities.remove(this.drawingPolygonEntity);
      this.drawingPolygonEntity = null;
    }

    // Need at least 3 points to show polygon preview
    if (this.currentPolygonPoints.length < 3) return;

    const Cesium = (window as any).Cesium;
    const colors = CONDITION_COLORS[this.currentCondition];
    
    // Create positions array
    let positions = [...this.currentPolygonPoints];
    if (mousePosition) {
      positions.push(mousePosition);
    }
    
    // Close the polygon for preview
    positions.push(positions[0]);
    
    const cartesianPositions = positions.map(pos => 
      Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat)
    );

    this.drawingPolygonEntity = this.viewer.entities.add({
      polygon: {
        hierarchy: cartesianPositions,
        material: Cesium.Color.fromCssColorString(colors.fill),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(colors.outline),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        extrudedHeight: 0
      }
    });
  }

  private createCommittedPolygon(userPolygon: UserPolygon): void {
    const Cesium = (window as any).Cesium;
    const colors = CONDITION_COLORS[userPolygon.condition];
    
    // Create final polygon entity
    const cartesianPositions = userPolygon.positionsLL.map(pos => 
      Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat)
    );

    const polygonEntity = this.viewer.entities.add({
      polygon: {
        hierarchy: cartesianPositions,
        material: Cesium.Color.fromCssColorString(colors.fill),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(colors.outline),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        extrudedHeight: 0
      }
    });

    // Create final vertex entities
    const vertexEntities: any[] = [];
    userPolygon.positionsLL.slice(0, -1).forEach(pos => { // Skip the duplicate closing vertex
      const entity = this.viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat),
        point: {
          pixelSize: 4,
          color: Cesium.Color.fromCssColorString(colors.outline),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      vertexEntities.push(entity);
    });

    this.committedEntities.push({ polygonEntity, vertexEntities });
  }

  private clearPreviewEntities(): void {
    // Remove vertex markers
    this.vertexEntities.forEach(entity => {
      this.viewer.entities.remove(entity);
    });
    this.vertexEntities = [];

    // Remove preview polygon
    if (this.drawingPolygonEntity) {
      this.viewer.entities.remove(this.drawingPolygonEntity);
      this.drawingPolygonEntity = null;
    }
  }

  private resetDrawingState(): void {
    this.isDrawingMode = false;
    this.currentCondition = undefined;
    this.currentPolygonPoints = [];
    this.clearPreviewEntities();
  }

  private notifyStateChange(): void {
    if (this.cb?.onState) {
      this.cb.onState({
        isDrawing: this.isDrawingMode,
        condition: this.currentCondition,
        vertices: this.currentPolygonPoints.length
      });
    }
  }

  destroy(): void {
    this.clearAll();
    if (this.handler) {
      this.handler.destroy();
      this.handler = null;
    }
  }
}