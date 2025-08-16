"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export default function Home() {
  const [target, setTarget] = useState(null);
  const [targetPreview, setTargetPreview] = useState(null);

  const [tilesZip, setTilesZip] = useState(null);
  const [tilesFiles, setTilesFiles] = useState([]);
  const [tilesPreviews, setTilesPreviews] = useState([]);

  const [tileSize, setTileSize] = useState(16);
  const [blend, setBlend] = useState(0.12);
  const [maxWidth, setMaxWidth] = useState(800);
  const [noRepeat, setNoRepeat] = useState(true);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState(null);
  const [error, setError] = useState(null);

  const [showGuide, setShowGuide] = useState(true); // NEW: toggle for the guide

  const apiBase = process.env.NEXT_PUBLIC_API_URL;

  const abortRef = useRef(null);

  // ------- Helpers -------
  const reset = () => {
    setTarget(null);
    setTargetPreview(null);
    setTilesZip(null);
    setTilesFiles([]);
    setTilesPreviews([]);
    setResultUrl(null);
    setError(null);
    setProgress(0);
  };

  const readPreview = (file) =>
    new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(file);
    });

  const onTargetPick = async (file) => {
    setTarget(file || null);
    setTargetPreview(file ? await readPreview(file) : null);
  };

  const onTilesZipPick = (file) => {
    setTilesZip(file || null);
    // if using zip, clear loose files previews
    setTilesFiles([]);
    setTilesPreviews([]);
  };

  const onTilesFilesPick = async (files) => {
    const arr = Array.from(files || []);
    setTilesFiles(arr);
    setTilesZip(null);
    // limit previews to first 8 for performance
    const limited = arr.slice(0, 8);
    const previews = await Promise.all(limited.map(readPreview));
    setTilesPreviews(previews);
  };

  const canSubmit = useMemo(
    () => !!target && (!!tilesZip || tilesFiles.length > 0) && !loading,
    [target, tilesZip, tilesFiles, loading]
  );

  // ------- Drag & Drop handlers -------
  const handleDropTarget = useCallback(async (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) {
      await onTargetPick(f);
    }
  }, []);

  const handleDropTiles = useCallback(async (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    const isZip = Array.from(files).some((f) =>
      f.name.toLowerCase().endsWith(".zip")
    );
    if (isZip && files.length === 1) {
      onTilesZipPick(files[0]);
    } else {
      const onlyImages = Array.from(files).filter((f) =>
        f.type.startsWith("image/")
      );
      await onTilesFilesPick(onlyImages);
    }
  }, []);

  // Prevent default drag behavior on page
  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // ------- Submit -------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResultUrl(null);
    setProgress(5);

    try {
      const fd = new FormData();
      if (!target) throw new Error("Постави target слика!");
      fd.append("target", target);
      if (tilesZip) {
        fd.append("tiles_zip", tilesZip);
      } else if (tilesFiles.length > 0) {
        for (const f of tilesFiles) fd.append("tiles_files", f);
      } else {
        throw new Error("Додај ZIP или повеќе слики за плочки.");
      }
      fd.append("tile_size", String(tileSize));
      fd.append("blend", String(blend));
      fd.append("max_width", String(maxWidth));
      fd.append("no_immediate_repeat", String(noRepeat));

      // trackable fetch
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Fake progress bumps while waiting
      const bump = () =>
        setProgress((p) =>
          p < 85 ? p + Math.max(1, Math.floor((100 - p) / 15)) : p
        );
      const timer = setInterval(bump, 350);

      const res = await fetch(`${apiBase}/api/mosaic`, {
        method: "POST",
        body: fd,
        signal: ctrl.signal,
      });

      clearInterval(timer);
      setProgress(95);

      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.error || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setProgress(100);
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message || "Unknown error");
      }
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const cancel = () => {
    if (abortRef.current) abortRef.current.abort();
    setLoading(false);
    setProgress(0);
  };

  // ------- UI -------
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-white/90 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            🧩 Photo Mosaic (OpenCV)
          </h1>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <button
              type="button"
              onClick={() => setShowGuide((s) => !s)}
              className="rounded-lg px-3 py-1.5 bg-slate-100 hover:bg-slate-200 transition-colors"
              aria-expanded={showGuide}
              aria-controls="guide"
              title="Прикажи/Скриј упатство"
            >
              {showGuide ? "Скриј упатство" : "Покажи упатство"}
            </button>
            <div>
              API:{" "}
              <code className="px-1 py-0.5 rounded bg-slate-200/60">
                {apiBase || "not set"}
              </code>
            </div>
          </div>
        </div>
      </header>

      {/* NEW: Guide / How-to section */}
      <section
        id="guide"
        className={`transition-all duration-300 ${
          showGuide
            ? "max-h-[9999px] opacity-100"
            : "max-h-0 opacity-0 overflow-hidden"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
            <h2 className="text-lg font-semibold mb-2">
              Упатство: како се користи
            </h2>
            <ol className="list-decimal pl-5 space-y-3 text-sm text-slate-700">
              <li>
                <span className="font-medium">Target image</span> — постави ја
                главната слика што сакаш да се претвори во мозаик. Може drag &
                drop или преку копчето. По избор ќе видиш <em>преглед</em>.
              </li>
              <li>
                <span className="font-medium">Tiles</span> — постави „плочки“
                (малите слики што ќе го сочинуваат мозаикот). Има две опции:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>
                    <span className="font-medium">Option 1: ZIP</span> — качи{" "}
                    <code>.zip</code> со многу слики внатре (препорачано за
                    голем број плочки).
                  </li>
                  <li>
                    <span className="font-medium">
                      Option 2: Multiple images
                    </span>{" "}
                    — избери повеќе слики одеднаш. Ќе се прикажат првите 8 како
                    преглед.
                  </li>
                </ul>
                Забелешка: Ако избереш ZIP, изборот на „multiple images“ се
                чисти, и обратно — секогаш важи само едната опција.
              </li>
              <li>
                <span className="font-medium">Tile size</span> — големина на
                секоја плочка (во px). Помала вредност = повеќе плочки, повеќе
                детали, но подолга обработка. Поголема вредност = покрупни
                плочки, побрза обработка.
              </li>
              <li>
                <span className="font-medium">Blend</span> — колку оригиналната{" "}
                <em>target</em> слика да се „вмеша“ над плочките (0 = без
                мешање, 1 = само таргет). Типично 0.10–0.25 дава добар баланс.
              </li>
              <li>
                <span className="font-medium">Max width</span> — максимална
                ширина на конечната слика. Поголема ширина = поголема резолуција
                и поголем фајл.
              </li>
              <li>
                <span className="font-medium">No immediate repeat</span> — ако е
                вклучено, иста плочка нема да се појави една до друга
                (хоризонтално/вертикално), за поприроден изглед.
              </li>
              <li>
                <span className="font-medium">Build mosaic</span> — ја стартува
                обработката кон API (<code>/api/mosaic</code>). Ќе видиш прогрес
                лента. <span className="font-medium">Cancel</span> ја откажува
                активната обработка. <span className="font-medium">Reset</span>{" "}
                ги чисти сите полиња и прегледи.
              </li>
              <li>
                <span className="font-medium">Preview</span> — десно ќе се
                прикаже таргетот и резултатот (кога ќе биде готов). Можеш да{" "}
                <span className="font-medium">преземеш</span> (Download) или да{" "}
                <span className="font-medium">отвориш во нов таб</span>.
              </li>
              <li>
                <span className="font-medium">Грешки</span> — ако недостига
                таргет или плочки, ќе добиеш порака (пример: „Постави target
                слика!“ или „Додај ZIP или повеќе слики за плочки.“).
              </li>
            </ol>
            <div className="mt-4 grid sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="font-semibold mb-1">Минимум за старт</p>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  <li>1 × Target image</li>
                  <li>
                    ZIP со слики <span className="italic">или</span> повеќе
                    слики (Tiles)
                  </li>
                </ul>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="font-semibold mb-1">Совети</p>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  <li>Повеќе и разновидни плочки = подобар мозаик</li>
                  <li>
                    <span className="font-medium">Blend</span> ~0.12–0.20 за
                    фини детали
                  </li>
                  <li>
                    Ако резултатот е премногу „квадратест“, намали{" "}
                    <span className="font-medium">Tile size</span> или зголеми{" "}
                    <span className="font-medium">Max width</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-2 gap-6">
        {/* Left: Form card */}
        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Target Upload */}
            <div
              onDragEnter={prevent}
              onDragOver={prevent}
              onDrop={handleDropTarget}
              className="rounded-xl border-2 border-dashed border-slate-300 hover:border-slate-400 transition-colors p-4"
            >
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Target image
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="target"
                  type="file"
                  accept="image/*"
                  onChange={(e) => onTargetPick(e.target.files?.[0] || null)}
                  className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-white hover:file:bg-indigo-700"
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Drag & drop дозволено (само една слика).
              </p>

              {targetPreview && (
                <div className="mt-4">
                  <img
                    src={targetPreview}
                    alt="target preview"
                    className="w-full h-auto rounded-lg ring-1 ring-slate-200"
                  />
                </div>
              )}
            </div>

            {/* Tiles Upload */}
            <div
              onDragEnter={prevent}
              onDragOver={prevent}
              onDrop={handleDropTiles}
              className="rounded-xl border-2 border-dashed border-slate-300 hover:border-slate-400 transition-colors p-4"
            >
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Tiles
              </label>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">
                    Option 1: ZIP
                  </span>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={(e) =>
                      onTilesZipPick(e.target.files?.[0] || null)
                    }
                    className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-white hover:file:bg-slate-800"
                  />
                  {tilesZip && (
                    <p className="text-xs text-slate-500">
                      Selected:{" "}
                      <span className="font-medium">{tilesZip.name}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">
                    Option 2: Multiple images
                  </span>
                  <input
                    multiple
                    type="file"
                    accept="image/*"
                    onChange={(e) => onTilesFilesPick(e.target.files)}
                    className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-white hover:file:bg-slate-800"
                  />
                  {tilesFiles.length > 0 && (
                    <p className="text-xs text-slate-500">
                      {tilesFiles.length} image
                      {tilesFiles.length > 1 ? "s" : ""} selected
                    </p>
                  )}
                </div>
              </div>

              {/* Tiles thumbnails */}
              {tilesPreviews.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-slate-500 mb-2">
                    Preview (first {tilesPreviews.length}):
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {tilesPreviews.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`tile ${i}`}
                        className="aspect-square object-cover rounded-md ring-1 ring-slate-200"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-xl p-4 ring-1 ring-slate-200 space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Tile size: <span className="font-semibold">{tileSize}px</span>
                </label>
                <input
                  type="range"
                  min={8}
                  max={64}
                  step={1}
                  value={tileSize}
                  onChange={(e) => setTileSize(Number(e.target.value))}
                  className="w-full"
                />

                <label className="block text-sm font-medium text-slate-700">
                  Blend:{" "}
                  <span className="font-semibold">{blend.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={blend}
                  onChange={(e) => setBlend(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="bg-slate-50 rounded-xl p-4 ring-1 ring-slate-200 space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Max width: <span className="font-semibold">{maxWidth}px</span>
                </label>
                <input
                  type="range"
                  min={400}
                  max={2000}
                  step={20}
                  value={maxWidth}
                  onChange={(e) => setMaxWidth(Number(e.target.value))}
                  className="w-full"
                />

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={noRepeat}
                    onChange={(e) => setNoRepeat(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  No immediate repeat
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                disabled={!canSubmit}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-60 hover:bg-indigo-700 transition-colors"
              >
                {loading ? "Processing..." : "Build mosaic"}
              </button>

              {loading ? (
                <button
                  type="button"
                  onClick={cancel}
                  className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 hover:bg-slate-300 transition-colors"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={reset}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors"
                >
                  Reset
                </button>
              )}

              {error && <span className="text-red-600 text-sm">{error}</span>}
            </div>

            {/* Progress */}
            {loading && (
              <div className="mt-1">
                <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-2 bg-indigo-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Generating… {progress}%
                </p>
              </div>
            )}
          </form>
        </section>

        {/* Right: Results / Preview card */}
        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5">
          <h2 className="text-lg font-semibold mb-3">Preview</h2>

          <div className="grid grid-cols-1 gap-4">
            {/* Side by side when both exist */}
            {targetPreview && resultUrl ? (
              <div className="grid md:grid-cols-2 gap-4">
                <figure className="space-y-2">
                  <img
                    src={targetPreview}
                    alt="Target"
                    className="w-full h-auto rounded-lg ring-1 ring-slate-200"
                  />
                  <figcaption className="text-xs text-slate-500 text-center">
                    Target
                  </figcaption>
                </figure>
                <figure className="space-y-2">
                  <img
                    src={resultUrl}
                    alt="Mosaic"
                    className="w-full h-auto rounded-lg ring-1 ring-slate-200"
                  />
                  <figcaption className="text-xs text-slate-500 text-center">
                    Mosaic
                  </figcaption>
                </figure>
              </div>
            ) : (
              <>
                {targetPreview && (
                  <figure className="space-y-2">
                    <img
                      src={targetPreview}
                      alt="Target"
                      className="w-full h-auto rounded-lg ring-1 ring-slate-200"
                    />
                    <figcaption className="text-xs text-slate-500 text-center">
                      Target
                    </figcaption>
                  </figure>
                )}
                {resultUrl && (
                  <figure className="space-y-2">
                    <img
                      src={resultUrl}
                      alt="Mosaic"
                      className="w-full h-auto rounded-lg ring-1 ring-slate-200"
                    />
                    <figcaption className="text-xs text-slate-500 text-center">
                      Mosaic
                    </figcaption>
                  </figure>
                )}
                {!targetPreview && !resultUrl && (
                  <div className="text-sm text-slate-500">
                    Upload images to see the preview here.
                  </div>
                )}
              </>
            )}
          </div>

          {resultUrl && (
            <div className="mt-4 flex items-center gap-3">
              <a
                href={resultUrl}
                download="mosaic.jpg"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 transition-colors"
              >
                Download mosaic
              </a>
              <button
                type="button"
                onClick={() => {
                  const w = window.open();
                  if (w)
                    w.document.write(
                      `<img src="${resultUrl}" style="max-width:100%"/>`
                    );
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors"
              >
                Open in new tab
              </button>
            </div>
          )}
        </section>
      </div>

      <footer className="py-6 text-center text-xs text-slate-500">
        Built with Next.js + FastAPI + OpenCV
      </footer>
    </main>
  );
}
