import type { MaskMeta, ClassId, LatLon } from "@shared/types";

export class PaletteMask {
  private img = new Image();
  private canvas = document.createElement("canvas");
  private ctx!: CanvasRenderingContext2D;

  constructor(private meta: MaskMeta){
    this.canvas.width = meta.width;
    this.canvas.height = meta.height;
    const ctx = this.canvas.getContext("2d");
    if(!ctx) throw new Error("no 2D context");
    this.ctx = ctx;
    this.img.crossOrigin = "anonymous";
    this.img.src = meta.url;
  }

  async ready(){
    await this.img.decode();
    this.ctx.drawImage(this.img, 0, 0);
  }

  sample(ll:LatLon):ClassId{
    const { west,south,east,north } = this.meta.bbox;
    const u = (ll.lon - west)/(east - west);
    const v = 1 - (ll.lat - south)/(north - south);
    const x = Math.max(0, Math.min(this.meta.width-1, Math.floor(u*this.meta.width)));
    const y = Math.max(0, Math.min(this.meta.height-1, Math.floor(v*this.meta.height)));
    const px = this.ctx.getImageData(x,y,1,1).data;
    return px[0] as ClassId; // class id in red channel
  }
}