"use client";

import { useState } from "react";

export default function Page() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Railway backend
  const API = process.env.NEXT_PUBLIC_RENDER_URL || "";

  async function generate() {
    if (!text.trim()) {
      setError("Voer eerst een tekst in.");
      return;
    }

    setLoading(true);
    setError(null);
    setAudioUrl(null);

    try {
      const res = await fetch(`${API}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          voiceId: "YUdpWWny7k5yb4QCeweX", // vaste stem
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Genereren mislukt");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (e: any) {
      setError(e?.message || "Er ging iets mis");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0058A3",
        padding: "40px 16px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: 12,
          padding: 32,
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        }}
      >
        <h1
          style={{
            marginBottom: 24,
            color: "#0058A3",
            textAlign: "center",
          }}
        >
          Albert Heijn Spot Generator
        </h1>

        <label
          style={{
            fontWeight: 600,
            display: "block",
            marginBottom: 6,
          }}
        >
          Tekst voor de spot
        </label>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Typ hier je boodschap..."
          style={{
            width: "100%",
            padding: 12,
            fontSize: 16,
            borderRadius: 6,
            border: "1px solid #ccc",
            resize: "vertical",
            color: "#000",
            background: "#fff",
          }}
        />

        <div style={{ height: 20 }} />

        <button
          onClick={generate}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px 0",
            background: loading ? "#999" : "#0058A3",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 16,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Bezig met genereren..." : "Genereer spot"}
        </button>

        {error && (
          <p style={{ marginTop: 16, color: "red", fontWeight: 500 }}>
            {error}
          </p>
        )}

        {audioUrl && (
          <div style={{ marginTop: 24 }}>
            <audio controls src={audioUrl} style={{ width: "100%" }} />

            <a
              href={audioUrl}
              download="spot.mp3"
              style={{
                display: "block",
                marginTop: 12,
                textAlign: "center",
                color: "#0058A3",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              ⬇ Download MP3
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
