/**
 * File: apps/web/src/components/PannellumTourOverlay.jsx
 * Purpose: Fullscreen Pannellum 360° multi-scene tour overlay for unit detail.
 * Author: Portal team
 * Date: 2026-09-13
 * Dependencies: react, ./PannellumTourOverlay.css, /pannellum/pannellum.js, /pannellum/pannellum.css
 * Usage:
 *   <PannellumTourOverlay configUrl="/pannellum/tours/city-unit/vt.json" title="Unit tour" onClose={...} />
 */
import React, { useEffect, useRef, useState } from 'react';
import './PannellumTourOverlay.css';

const SCRIPT_ID = 'pannellum-script';
const STYLE_ID = 'pannellum-style';

function loadStylesheet(href, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
    document.head.appendChild(link);
  });
}

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing && window.pannellum) {
      resolve();
      return;
    }

    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.body.appendChild(script);
  });
}

function configDirectory(configUrl) {
  const trimmed = String(configUrl || '').trim();
  if (!trimmed) {
    return '/';
  }

  try {
    const absolute = new URL(trimmed, window.location.origin);
    const pathname = absolute.pathname;
    const slashIndex = pathname.lastIndexOf('/');
    return slashIndex < 0 ? `${absolute.origin}/` : `${absolute.origin}${pathname.slice(0, slashIndex + 1)}`;
  } catch {
    const withoutQuery = trimmed.split(/[?#]/)[0];
    const slashIndex = withoutQuery.lastIndexOf('/');
    return slashIndex < 0 ? '/' : withoutQuery.slice(0, slashIndex + 1);
  }
}

function isAbsoluteUrl(value) {
  return /^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:');
}

function resolveTourAssetUrl(basePath, value) {
  if (typeof value !== 'string' || !value.trim()) {
    return value;
  }

  const trimmed = value.trim();
  if (isAbsoluteUrl(trimmed) || trimmed.startsWith('/')) {
    return trimmed;
  }

  return `${basePath}${trimmed.replace(/^\.\//, '')}`;
}

function normalizeTourConfig(config, configUrl) {
  const basePath = configDirectory(configUrl);
  const nextDefault = {
    ...(config.default || {}),
    basePath,
    autoLoad: true,
    // Pannellum viewer FOV max is ~120; 360 breaks rendering.
    hfov: Math.min(Number(config.default?.hfov) || 100, 120),
    minHfov: Number(config.default?.minHfov) || 50,
    maxHfov: Math.min(Number(config.default?.maxHfov) || 120, 120),
  };

  const scenes = {};
  Object.entries(config.scenes || {}).forEach(([sceneId, scene]) => {
    // Only set preview when present. `preview: undefined` still makes
    // `"preview" in scene` true, and Pannellum then crashes on a[0] in qa().
    const nextScene = {
      ...scene,
      panorama: resolveTourAssetUrl(basePath, scene.panorama),
    };
    if (scene.preview) {
      nextScene.preview = resolveTourAssetUrl(basePath, scene.preview);
    } else {
      delete nextScene.preview;
    }
    scenes[sceneId] = nextScene;
  });

  return {
    ...config,
    default: nextDefault,
    scenes,
  };
}

async function loadTourConfig(configUrl) {
  const response = await fetch(configUrl, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Failed to load tour config (${response.status}).`);
  }

  const config = await response.json();
  return normalizeTourConfig(config, configUrl);
}

export const DEFAULT_UNIT_TOUR_CONFIG_URL = '/pannellum/tours/city-unit/vt.json';

export default function PannellumTourOverlay({
  configUrl = DEFAULT_UNIT_TOUR_CONFIG_URL,
  title = '360° tour',
  subtitle = '',
  onClose,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setStatus('loading');
      setErrorMessage('');

      try {
        const [, , tourConfig] = await Promise.all([
          loadStylesheet('/pannellum/pannellum.css', STYLE_ID),
          loadScript('/pannellum/pannellum.js', SCRIPT_ID),
          loadTourConfig(configUrl),
        ]);

        if (cancelled || !containerRef.current || !window.pannellum) {
          return;
        }

        viewerRef.current?.destroy?.();
        containerRef.current.innerHTML = '';
        viewerRef.current = window.pannellum.viewer(containerRef.current, tourConfig);
        setStatus('ready');
      } catch (error) {
        if (cancelled) {
          return;
        }
        setStatus('error');
        setErrorMessage(error?.message || 'Failed to open 360° tour.');
      }
    }

    boot();

    return () => {
      cancelled = true;
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
    };
  }, [configUrl]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose?.();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <section className="public-pannellum-overlay panel" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="public-pannellum-overlay__close" onClick={onClose} aria-label="Close 360 tour">
        ×
      </button>
      <div className="public-pannellum-overlay__head">
        <div>
          <p className="eyebrow">360° tour</p>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      <div className="public-pannellum-overlay__frame">
        {status === 'loading' ? <div className="public-pannellum-overlay__status">Loading 360° tour…</div> : null}
        {status === 'error' ? <div className="public-pannellum-overlay__status">{errorMessage}</div> : null}
        <div ref={containerRef} className="public-pannellum-overlay__viewer" />
      </div>
    </section>
  );
}
