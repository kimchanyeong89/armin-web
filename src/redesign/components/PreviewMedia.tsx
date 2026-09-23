import { useState, type ImgHTMLAttributes } from "react";

type PreviewMediaProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt"> & {
  alt: string;
  fallbackLabel: string;
};

export default function PreviewMedia({
  fallbackLabel,
  alt,
  className,
  width = 1600,
  height = 1200,
  loading = "lazy",
  fetchPriority,
  ...props
}: PreviewMediaProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !props.src) {
    return (
      <div
        className={`${className || ""} rd-media-fallback`}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        <span>{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <img
      {...props}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading={loading}
      fetchPriority={fetchPriority ?? (loading === "eager" ? "high" : undefined)}
      onError={() => setFailed(true)}
    />
  );
}
