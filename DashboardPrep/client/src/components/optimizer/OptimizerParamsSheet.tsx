import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

interface OptimizerParamsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function OptimizerParamsSheet({ open, onOpenChange }: OptimizerParamsSheetProps) {
  // These would typically come from a shared store/context
  // For now, we'll manage them locally with defaults matching desktop OptimizerPanel
  const [maxDistance, setMaxDistance] = useState(300); // Max Distance (yds)
  const [nEarly, setNEarly] = useState(350);           // Early Samples  
  const [nFinal, setNFinal] = useState(850);           // Final Samples
  const [ci95Stop, setCi95Stop] = useState(0.001);    // CI95 Threshold
  const [optimizerMethod, setOptimizerMethod] = useState('CEM'); // Optimizer Method

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>Advanced Optimizer Parameters</SheetTitle>
          <SheetDescription>
            Fine-tune the optimization algorithm settings. Changes apply to the next optimization run.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {/* Optimizer Method */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Optimization Method</Label>
            <Select
              value={optimizerMethod}
              onValueChange={setOptimizerMethod}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CEM">Cross-Entropy Method (CEM)</SelectItem>
                <SelectItem value="RingGrid">Ring Grid Search</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Max Distance */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Max Distance (yards)</Label>
            <Input 
              type="number" 
              value={maxDistance} 
              onChange={(e) => setMaxDistance(Number(e.target.value))}
              min={50}
              max={450}
              className="w-full"
            />
          </div>

          {/* Early Samples */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Early Samples</Label>
            <div className="px-2">
              <Slider
                value={[nEarly]}
                onValueChange={(value) => setNEarly(value[0])}
                min={100}
                max={500}
                step={25}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>100</span>
                <span className="font-medium">{nEarly}</span>
                <span>500</span>
              </div>
            </div>
          </div>

          {/* Final Samples */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Final Samples</Label>
            <div className="px-2">
              <Slider
                value={[nFinal]}
                onValueChange={(value) => setNFinal(value[0])}
                min={500}
                max={1000}
                step={50}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>500</span>
                <span className="font-medium">{nFinal}</span>
                <span>1000</span>
              </div>
            </div>
          </div>

          {/* CI95 Threshold */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">CI95 Threshold</Label>
            <div className="px-2">
              <Slider
                value={[ci95Stop === 0.001 ? 0 : ci95Stop === 0.01 ? 1 : 2]}
                onValueChange={(value) => {
                  const thresholds = [0.001, 0.01, 0.05];
                  setCi95Stop(thresholds[value[0]]);
                }}
                min={0}
                max={2}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0.001</span>
                <span>0.01</span>
                <span>0.05</span>
              </div>
              <div className="text-center text-sm font-medium mt-1">
                {ci95Stop.toFixed(3)}
              </div>
            </div>
          </div>

          {/* Information */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h4 className="text-sm font-semibold">Parameter Guide</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li><strong>Method:</strong> CEM is adaptive and faster, RingGrid is exhaustive but thorough</li>
              <li><strong>Max Distance:</strong> Maximum shot distance allowed in yards</li>
              <li><strong>Early Samples:</strong> Number of samples for initial evaluation</li>
              <li><strong>Final Samples:</strong> Number of samples for final evaluation</li>
              <li><strong>CI95 Threshold:</strong> Confidence interval threshold for stopping</li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}