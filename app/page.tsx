"use client";

import { useState } from "react";

export default function Page() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Vaste stem (niet zichtbaar in UI)
  const VOICE_ID = "YUdpWWny7k5yb4QCeweX";

  async function generate() {
    setLoading(true);
    setError(null);
    setAudioUrl(null);

    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId: VOICE_ID }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Render failed");
      }

      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setError(e?.message || "Er ging iets mis");
    } finally {
      setLoading(false);
    }
  }

  const brandBlue = "#0a4b9c";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f5f8ff",
        padding: 24,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      }}
    >
      <div style={{ maxWidth: 980, margin: "40px auto" }}>
        {/* Header */}
        <div
          style={{
            background: brandBlue,
            color: "#fff",
            borderRadius: 16,
            padding: "18px 20px",
            boxShadow: "0 10px 30px rgba(10,75,156,0.18)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <img
            src="/ah-logo.png"
            alt="Logo"
            style={{
              width: 46,
              height: 46,
              objectFit: "contain",
              background: "rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 8,
            }}
          />

          <h1 style={{ margin: 0, fontSize: 28 }}>
            Albert Heijn Spot Generator
          </h1>
        </div>

        {/* Card */}
        <div
          style={{
            marginTop: 18,
            background: "#ffffff",
            borderRadius: 16,
            padding: 22,
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            border: "1px solid rgba(10,75,156,0.12)",
          }}
        >
          {/* Text */}
          <label
            style={{
              display: "block",
              fontWeight: 800,
              color: brandBlue,
              marginBottom: 8,
              fontSize: 16,
            }}
          >
            Tekst (middenstuk)
          </label>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Typ hier je nieuwe boodschap..."
            style={{
              width: "100%",
              minHeight: 180,
              padding: 14,
              borderRadius: 12,
              border: "1px solid rgba(10,75,156,0.25)",
              fontSize: 18,
              lineHeight: 1.45,
              outline: "none",
              resize: "vertical",
              color: "#0f172a",
              background: "#ffffff",
            }}
          />

          <div style={{ height: 16 }} />

          {/* Button */}
          <button
            onClick={generate}
            disabled={loading || !text.trim()}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              border: "none",
              background: loading || !text.trim() ? "#9bb7df" : brandBlue,
              color: "#fff",
              fontWeight: 900,
              fontSize: 16,
              cursor: loading || !text.trim() ? "not-allowed" : "pointer",
              boxShadow: "0 12px 22px rgba(10,75,156,0.22)",
            }}
          >
            {loading ? "Bezig met genereren..." : "Genereer spot"}
          </button>

          {/* Error */}
          {error && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 12,
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                color: "#9f1239",
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          )}

          {/* Result */}
          {audioUrl && (
            <div
              style={{
                marginTop: 16,
                padding: 16,
                borderRadius: 16,
                background: "#f0f7ff",
                border: "1px solid rgba(10,75,156,0.18)",
              }}
            >
              <div style={{ fontWeight: 900, color: brandBlue, marginBottom: 10 }}>
                Resultaat
              </div>

              <audio controls src={audioUrl} style={{ width: "100%" }} />

              <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                <a
                  href={audioUrl}
                  download="albert-heijn-spot.mp3"
                  style={{
                    padding: "10px 14px",
                    background: brandBlue,
                    color: "#fff",
                    borderRadius: 12,
                    textDecoration: "none",
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                >
                  Download MP3
                </a>

                <button
                  onClick={() => setAudioUrl(null)}
                  style={{
                    padding: "10px 14px",
                    background: "#fff",
                    color: brandBlue,
                    borderRadius: 12,
                    border: "1px solid rgba(10,75,156,0.25)",
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Nieuw fragment
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
