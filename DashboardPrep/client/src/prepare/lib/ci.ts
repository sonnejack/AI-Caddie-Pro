export class ProgressiveStats {
  mean=0; M2=0; n=0;
  add(x:number){ this.n++; const d=x-this.mean; this.mean+=d/this.n; this.M2+=d*(x-this.mean); }
  variance(){ return this.n>1 ? this.M2/(this.n-1) : 0; }
  stdev(){ return Math.sqrt(this.variance()); }
  ci95(){ return this.n>1 ? 1.96*this.stdev()/Math.sqrt(this.n) : Infinity; }
}