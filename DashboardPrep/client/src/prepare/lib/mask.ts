import type { MaskMeta, ClassId, LatLon } from "@shared/types";

export class PaletteMask {
  private img = new Image();
  private canvas = document.createElement("canvas");
  private ctx!: CanvasRenderingContext2D;
  private isReady = false;

  constructor(private meta: MaskMeta){
    // Validate mask metadata
    if (!meta || !meta.url || meta.width <= 0 || meta.height <= 0) {
      console.error('❌ Invalid mask metadata:', meta);
      throw new Error('Invalid mask metadata provided');
    }
    
    this.canvas.width = meta.width;
    this.canvas.height = meta.height;
    const ctx = this.canvas.getContext("2d");
    if(!ctx) throw new Error("no 2D context");
    this.ctx = ctx;
    this.img.crossOrigin = "anonymous";
    
    // Add error handler for image loading
    this.img.onerror = (error) => {
      console.error('❌ Failed to load mask image:', meta.url, error);
    };
    
    this.img.src = meta.url;
  }

  async ready(){
    if (this.isReady) return;
    
    try {
      // Use Promise-based approach for better error handling
      await new Promise<void>((resolve, reject) => {
        if (this.img.complete) {
          if (this.img.naturalWidth === 0) {
            reject(new Error('Image failed to load or is corrupted'));
            return;
          }
          resolve();
          return;
        }
        
        const onLoad = () => {
          this.img.removeEventListener('load', onLoad);
          this.img.removeEventListener('error', onError);
          resolve();
        };
        
        const onError = (error: any) => {
          this.img.removeEventListener('load', onLoad);
          this.img.removeEventListener('error', onError);
          reject(new Error(`Failed to load mask image: ${this.meta.url} - ${error}`));
        };
        
        this.img.addEventListener('load', onLoad);
        this.img.addEventListener('error', onError);
      });
      
      // Try to decode the image
      if (this.img.decode) {
        await this.img.decode();
      }
      
      // Draw image to canvas
      this.ctx.drawImage(this.img, 0, 0);
      this.isReady = true;
      
    } catch (error) {
      console.error('❌ Error in PaletteMask.ready():', error);
      
      // Create a fallback 1x1 canvas with default rough class
      console.warn('⚠️ Creating fallback mask data');
      this.canvas.width = 1;
      this.canvas.height = 1;
      this.ctx.fillStyle = 'rgb(8, 0, 0)'; // Class 8 (rough) in red channel
      this.ctx.fillRect(0, 0, 1, 1);
      this.isReady = true;
      
      // Update meta to reflect fallback dimensions
      this.meta.width = 1;
      this.meta.height = 1;
      
      throw error; // Re-throw to allow caller to handle
    }
  }

  sample(ll:LatLon):ClassId{
    if (!this.isReady) {
      console.warn('⚠️ PaletteMask not ready, returning default rough class');
      return 8 as ClassId; // Default to rough
    }
    
    try {
      const { west,south,east,north } = this.meta.bbox;
      const u = (ll.lon - west)/(east - west);
      const v = 1 - (ll.lat - south)/(north - south);
      const x = Math.max(0, Math.min(this.meta.width-1, Math.floor(u*this.meta.width)));
      const y = Math.max(0, Math.min(this.meta.height-1, Math.floor(v*this.meta.height)));
      const px = this.ctx.getImageData(x,y,1,1).data;
      return px[0] as ClassId; // class id in red channel
    } catch (error) {
      console.error('❌ Error sampling mask:', error);
      return 8 as ClassId; // Default to rough on error
    }
  }
}