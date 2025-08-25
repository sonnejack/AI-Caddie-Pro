import { Button } from "@/components/ui/button";
import { useState } from "react";

interface TogglesRowProps {
  onPhotorealToggle?: () => void;
  onGPSToggle?: () => void;
  onMaskToggle?: () => void;
  onSamplesToggle?: () => void;
  photorealEnabled?: boolean;
  gpsEnabled?: boolean;
  maskEnabled?: boolean;
  samplesEnabled?: boolean;
}

export default function TogglesRow(props: TogglesRowProps) {
  const {
    onPhotorealToggle,
    onGPSToggle,
    onMaskToggle,
    onSamplesToggle,
    photorealEnabled = false,
    gpsEnabled = false,
    maskEnabled = false,
    samplesEnabled = true
  } = props;

  const toggles = [
    {
      id: 'photoreal',
      icon: 'fas fa-cube',
      active: photorealEnabled,
      onClick: onPhotorealToggle,
      title: 'Photorealistic 3D Tiles'
    },
    {
      id: 'gps',
      icon: 'fas fa-crosshairs',
      active: gpsEnabled,
      onClick: onGPSToggle,
      title: 'GPS Location'
    },
    {
      id: 'mask',
      icon: 'fas fa-layer-group',
      active: maskEnabled,
      onClick: onMaskToggle,
      title: 'Course Feature Mask'
    },
    {
      id: 'samples',
      icon: 'fas fa-circle',
      active: samplesEnabled,
      onClick: onSamplesToggle,
      title: 'Shot Samples'
    }
  ];

  return (
    <div className="flex items-center gap-1">
      {toggles.map(toggle => (
        <Button
          key={toggle.id}
          variant="ghost"
          size="sm"
          className={`h-8 w-8 p-0 ${
            toggle.active 
              ? 'text-primary bg-primary/10' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={toggle.onClick}
          disabled={!toggle.onClick}
          title={toggle.title}
        >
          <i className={`${toggle.icon} text-xs`}></i>
        </Button>
      ))}
    </div>
  );
}