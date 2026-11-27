import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import api from "../../services/api.js";

export default function AuthenticatedImage({ src, alt = "", className = "", fallback = null }) {
  const [state, setState] = useState({ status: "idle", url: null });

  useEffect(() => {
    if (!src) {
      setState({ status: "empty", url: null });
      return undefined;
    }

    if (src.startsWith("data:") || src.startsWith("blob:")) {
      setState({ status: "ready", url: src });
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl = null;
    setState({ status: "loading", url: null });

    api
      .get(src, { responseType: "blob", signal: controller.signal })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        setState({ status: "ready", url: objectUrl });
      })
      .catch((error) => {
        if (error?.code === "ERR_CANCELED") return;
        setState({ status: "error", url: null });
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (state.status === "loading" || state.status === "idle") {
    return <span className={`k-image-skeleton ${className}`} aria-label="Loading image" />;
  }

  if (state.status !== "ready" || !state.url) {
    return fallback ?? (
      <span className={`k-image-fallback ${className}`} aria-label={alt || "Image unavailable"}>
        <ImageOff size={20} aria-hidden="true" />
      </span>
    );
  }

  return <img src={state.url} alt={alt} className={className} />;
}
