import { useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import Button from "../ui/Button.jsx";
import { classNames, formatFileSize } from "../../utils/format.js";

const ACCEPTED = "image/jpeg,image/png,image/webp";

export default function ImageUploader({
  file,
  previewUrl,
  onFileSelected,
  onClear,
  error,
  disabled = false,
}) {
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  function choose(fileValue) {
    if (!fileValue || disabled) return;
    onFileSelected(fileValue);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    if (disabled) return;
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) choose(dropped);
  }

  return (
    <div className="k-uploader">
      <input
        ref={galleryRef}
        type="file"
        accept={ACCEPTED}
        className="k-sr-only"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = "";
        }}
        disabled={disabled}
        aria-label="Choose a food image"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="k-sr-only"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = "";
        }}
        disabled={disabled}
        aria-label="Take a food photo"
      />

      {previewUrl ? (
        <div className="k-image-preview">
          <img src={previewUrl} alt="Selected food" />
          <div className="k-image-preview-meta">
            <div>
              <strong>{file?.name ?? "Selected image"}</strong>
              <small>{file ? formatFileSize(file.size) : "Ready to scan"}</small>
            </div>
            <div className="k-image-preview-actions">
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={() => galleryRef.current?.click()}
                disabled={disabled}
              >
                Replace
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                onClick={onClear}
                disabled={disabled}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={classNames("k-dropzone", dragActive && "is-dragging", error && "has-error")}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <span className="k-dropzone-icon" aria-hidden="true"><UploadCloud size={26} /></span>
          <h3>Add a photo of the food</h3>
          <p>Drag and drop an image here, or choose one from your device.</p>
          <div className="k-dropzone-actions">
            <Button
              variant="secondary"
              icon={ImagePlus}
              onClick={() => galleryRef.current?.click()}
              disabled={disabled}
            >
              Choose image
            </Button>
            <Button
              variant="ghost"
              icon={Camera}
              onClick={() => cameraRef.current?.click()}
              disabled={disabled}
            >
              Use camera
            </Button>
          </div>
          <small>JPEG, PNG or WebP · up to 5 MiB · camera capture depends on your device.</small>
        </div>
      )}

      {error ? <p className="k-form-error" role="alert">{error}</p> : null}
    </div>
  );
}
