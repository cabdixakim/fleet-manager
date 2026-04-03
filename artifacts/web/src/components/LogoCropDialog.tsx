import { useRef, useState } from "react";
import ReactCropperComponent from "react-cropper";
import type { ReactCropperElement } from "react-cropper";
import "cropperjs/dist/cropper.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Crop as CropIcon, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  imageSrc: string;
  onClose: () => void;
  onComplete: (croppedBlob: Blob) => void;
  loading?: boolean;
}

type AspectPreset = { label: string; value: number };

const ASPECT_PRESETS: AspectPreset[] = [
  { label: "Square (1:1)", value: 1 },
  { label: "Landscape (4:3)", value: 4 / 3 },
  { label: "Wide (16:9)", value: 16 / 9 },
];

export function LogoCropDialog({ open, imageSrc, onClose, onComplete, loading }: Props) {
  const cropperRef = useRef<ReactCropperElement>(null);
  const [aspectIdx, setAspectIdx] = useState(0);
  const [processing, setProcessing] = useState(false);

  const getCropper = () => cropperRef.current?.cropper ?? null;

  const handleAspectChange = (idx: number) => {
    setAspectIdx(idx);
    getCropper()?.setAspectRatio(ASPECT_PRESETS[idx].value);
  };

  const handleReset = () => {
    getCropper()?.reset();
  };

  const handleConfirm = async () => {
    const cropper = getCropper();
    if (!cropper) return;
    setProcessing(true);
    try {
      const canvas = cropper.getCroppedCanvas({ fillColor: "#ffffff" });
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Failed to produce blob"))),
          "image/png",
          0.95,
        ),
      );
      onComplete(blob);
    } catch (e) {
      console.error("Crop error:", e);
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setAspectIdx(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CropIcon className="w-4 h-4 text-primary" />Crop Logo
          </DialogTitle>
        </DialogHeader>

        {/* Aspect ratio presets */}
        <div className="flex gap-1.5">
          {ASPECT_PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => handleAspectChange(i)}
              className={cn(
                "flex-1 text-xs py-1.5 px-2 rounded-md border transition-colors",
                aspectIdx === i
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* CropperJS: corner/edge handles to resize, drag inside to move, scroll/pinch to zoom */}
        <div className="w-full rounded-lg overflow-hidden bg-secondary/50" style={{ height: 300 }}>
          {open && (
            <ReactCropperComponent
              ref={cropperRef}
              src={imageSrc}
              style={{ height: 300, width: "100%" }}
              aspectRatio={ASPECT_PRESETS[aspectIdx].value}
              guides
              viewMode={1}
              dragMode="move"
              cropBoxResizable
              cropBoxMovable
              zoomable
              zoomOnWheel
              autoCropArea={0.8}
              responsive
            />
          )}
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">
            Drag corners/edges to resize · Drag inside to move · Scroll to zoom
          </Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-7 text-xs text-muted-foreground shrink-0"
          >
            <RotateCcw className="w-3 h-3 mr-1" />Reset
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={processing || loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={processing || loading}>
            {processing || loading ? "Saving..." : "Apply & Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
