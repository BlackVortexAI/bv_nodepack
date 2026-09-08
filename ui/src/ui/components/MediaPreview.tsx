import { useEffect, useRef, useState, type SyntheticEvent } from "react";

export type PreviewMediaType = "image" | "video";
type Dimensions = { width: number; height: number };

type MediaPreviewProps = {
    src: string;
    mediaType?: PreviewMediaType;
    label: string;
    active?: boolean;
    onDimensions?: (size: Dimensions) => void;
};

/** A source change starts a fresh media lifecycle, including error state. */
export function MediaPreview(props: MediaPreviewProps) {
    return <MediaPreviewContent key={`${props.mediaType ?? "image"}:${props.src}:${props.active === true}`} {...props} />;
}

function MediaPreviewContent({ src, mediaType = "image", label, active = false, onDimensions }: MediaPreviewProps) {
    const [hasFailed, setHasFailed] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const video = videoRef.current;
        if (!active) video?.pause();
        return () => video?.pause();
    }, [active, hasFailed]);
    const failed = () => setHasFailed(true);
    if (hasFailed) return <span className="bv-media-preview-error" role="img" aria-label={`${label}: preview unavailable`}>Preview unavailable</span>;
    if (mediaType === "video") {
        const loaded = (event: SyntheticEvent<HTMLVideoElement>) => {
            const video = event.currentTarget;
            onDimensions?.({ width: video.videoWidth, height: video.videoHeight });
        };
        return <><video ref={videoRef} key={src} src={src} aria-label={`${label} preview`} muted loop playsInline
            autoPlay={active} preload={active ? "auto" : "metadata"} onLoadedMetadata={loaded} onError={failed} />
            {!active && <span className="bv-media-preview-badge" aria-hidden="true">▶ Video</span>}</>;
    }
    return <img src={src} alt={`${label} preview`} loading={active ? "eager" : "lazy"} decoding="async" onError={failed}
        onLoad={event => onDimensions?.({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />;
}
