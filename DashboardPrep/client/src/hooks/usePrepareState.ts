import { useState } from "react";
import type { LatLon, SkillPreset, MaskMeta, ESResult, AimCandidate } from "@shared/types";
import type { RollCondition } from "@/lib/types";
import type { MaskBuffer } from "@/lib/maskBuffer";

export function usePrepareState(){
  const [courseId, setCourseId] = useState<string>();
  const [holeId, setHoleId] = useState<string>();
  const [start, setStart] = useState<LatLon>();
  const [pin, setPin] = useState<LatLon>();
  const [aim, setAim] = useState<LatLon>();
  const [skill, setSkill] = useState<SkillPreset>({ name:"Elite Am", offlineDeg:5.9, distPct:4.7 });
  const [maxCarry, setMaxCarry] = useState<number>(305); // Default max carry in yards
  const [sampleCount, setSampleCount] = useState<number>(1000);
  const [mask, setMask] = useState<MaskMeta>();
  const [maskBuffer, setMaskBuffer] = useState<MaskBuffer>();
  const [es, setEs] = useState<ESResult>();
  const [best, setBest] = useState<AimCandidate>();
  const [selectionMode, setSelectionMode] = useState<'start' | 'aim' | 'pin' | null>(null);
  const [rollCondition, setRollCondition] = useState<RollCondition>('none');

  return { 
    courseId, holeId, setCourseId, setHoleId, 
    start, setStart, pin, setPin, aim, setAim, 
    skill, setSkill, maxCarry, setMaxCarry, 
    sampleCount, setSampleCount,
    mask, setMask, maskBuffer, setMaskBuffer,
    es, setEs, best, setBest,
    selectionMode, setSelectionMode,
    rollCondition, setRollCondition
  };
}