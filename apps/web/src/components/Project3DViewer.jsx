import React, { useEffect, useRef, useState } from 'react';

function describeModelError(event) {
  const detail = event?.detail;
  const message = String(detail?.sourceError?.message || detail?.message || event?.type || '');
  if (/shader|compile|WEBGL|GLSL/i.test(message)) {
    return 'This GLB failed GPU shader compilation. Upload an optimized file (≤ 15 MB, 1024px JPEG textures, metallic-roughness PBR).';
  }

  return message || 'The 3D preview could not load this model.';
}

export default function Project3DViewer({ src, title = '3D model', description = '', compact = false }) {
  const viewerRef = useRef(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadModelViewer() {
      try {
        await import('@google/model-viewer');
      } catch {
        if (!cancelled) {
          setLoadError('3D preview library failed to load.');
        }
      }
    }

    loadModelViewer();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLoadError('');
    const element = viewerRef.current;
    if (!element || !src) {
      return undefined;
    }

    function handleError(event) {
      setLoadError(describeModelError(event));
    }

    element.addEventListener('error', handleError);
    return () => {
      element.removeEventListener('error', handleError);
    };
  }, [src]);

  if (!src) {
    return null;
  }

  if (loadError) {
    return (
      <div className={`project-3d-viewer ${compact ? 'project-3d-viewer--compact' : ''}`}>
        <div className="project-3d-viewer__frame">
          <p className="error-text" style={{ padding: '1rem' }}>{loadError}</p>
        </div>
        {description ? <p className="hint">{description}</p> : null}
      </div>
    );
  }

  return (
    <div className={`project-3d-viewer ${compact ? 'project-3d-viewer--compact' : ''}`}>
      <div className="project-3d-viewer__frame">
        <model-viewer
          ref={viewerRef}
          src={src}
          alt={title}
          camera-controls
          touch-action="pan-y"
          auto-rotate
          shadow-intensity="0.35"
          exposure="1"
          loading="lazy"
          reveal="auto"
          style={{ width: '100%', height: '100%', minHeight: compact ? '300px' : '380px' }}
        />
      </div>
      {description ? <p className="hint">{description}</p> : null}
    </div>
  );
}
