
export enum ToolType {
  PENCIL = 'pencil',
  RECTANGLE = 'rectangle',
  CIRCLE = 'circle',
  ELLIPSE = 'ellipse',
  ARROW = 'arrow',
  TEXT = 'text',
  SELECT = 'select',
  ERASER = 'eraser'
}

export interface CanvasState {
  color: string;
  strokeWidth: number;
  tool: ToolType;
}

export interface GeneratedImage {
  url: string;
  timestamp: number;
  prompt: string;
}
