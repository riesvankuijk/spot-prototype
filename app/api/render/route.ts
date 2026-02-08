import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

export const runtime = "nodejs";

function runCmd(cmd: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = "";
    let stderr = "";

    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `${cmd} exited with ${code}`));
    });
  });
}

async function getAudioDurationSeconds(filePath: string): Promise<number> {
  // ffprobe is included with ffmpeg install
  const { stdout } = await runCmd("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  const s = stdout.trim();
  const dur = Number(s);

  if (!Number.isFinite(dur) || dur <= 0) {
    throw new Error(`Could not read duration via ffprobe: "${s}"`);
  }
  return dur;
}

async function runFfmpeg(args: string[]) {
  await runCmd("ffmpeg", args);
}

export async function POST(req: Request) {
  try {
    const { text, voiceId } = await req.json();

    if (!text || typeof text !== "string" || !text.trim()) {
      return new NextResponse("No text provided", { status: 400 });
    }
    if (!voiceId) {
      return new NextResponse("No voiceId provided", { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return new NextResponse("Missing ELEVENLABS_API_KEY", { status: 500 });

    // 1) TTS ophalen
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.85,
          style: 0.6,
          use_speaker_boost: true,
        },
      }),
    });

    if (!ttsRes.ok) {
      const msg = await ttsRes.text();
      return new NextResponse(msg || "TTS failed", { status: 500 });
    }

    const ttsBuffer = Buffer.from(await ttsRes.arrayBuffer());

    // 2) Files
    const tmpDir = "/tmp";
    const ttsFile = path.join(tmpDir, `tts-${Date.now()}.mp3`);
    const outFile = path.join(tmpDir, `spot-${Date.now()}.mp3`);

    await fs.writeFile(ttsFile, ttsBuffer);

    const bgmFile = path.join(process.cwd(), "public/audio/bgm.mp3");

    // Check bgm exists
    try {
      await fs.access(bgmFile);
    } catch {
      return new NextResponse("Missing public/audio/bgm.mp3", { status: 500 });
    }

    // 3) Durations & timing
    const pre = 1.5; // sec muziek vóór voice
    const post = 1.5; // sec muziek na voice (incl fade-out)
    const voiceDur = await getAudioDurationSeconds(ttsFile);

    // Total length (cap op 25 sec indien je dat wil)
    let total = pre + voiceDur + post;
    // Als je altijd max 25 wil, laat dit aan:
    if (total > 25) total = 25;

    // In dat geval wordt voice ook gecapt zodat er altijd nog post overblijft
    const maxVoice = Math.max(0.1, total - pre - post);

    // Volumes (tweak hier)
    const bgmPrePostVol = 0.55; // "harder" intro/outro bedje
    const bgmDuringVol = 0.80;  // "zachter" tijdens voice, maar harder dan je huidige 0.18
    const voiceVol = 0.80;      // voice iets omhoog voor verstaanbaarheid

    // 4) Build mix
    // - bgm loopt door (loop)
    // - knip bgm in 3 segmenten met verschillende volumes
    // - voice start na 1.5s (adelay)
    // - mix voice + bgm
    // - fade out in de laatste 1.5 sec
    await runFfmpeg([
      "-y",

      // Voice input
      "-i",
      ttsFile,

      // Loop bgm (indien korter)
      "-stream_loop",
      "-1",
      "-i",
      bgmFile,

      "-filter_complex",
      // Voice trim + volume + delay
      `[0:a]atrim=0:${maxVoice.toFixed(3)},asetpts=N/SR/TB,volume=${voiceVol}[v];` +
        `[v]adelay=${Math.round(pre * 1000)}|${Math.round(pre * 1000)}[vdel];` +
        // BGM segments: pre, during, post
        `[1:a]atrim=0:${pre.toFixed(3)},asetpts=N/SR/TB,volume=${bgmPrePostVol}[bpre];` +
        `[1:a]atrim=${pre.toFixed(3)}:${(pre + maxVoice).toFixed(3)},asetpts=N/SR/TB,volume=${bgmDuringVol}[bdur];` +
        `[1:a]atrim=${(pre + maxVoice).toFixed(3)}:${(pre + maxVoice + post).toFixed(3)},asetpts=N/SR/TB,volume=${bgmPrePostVol}[bpost];` +
        `[bpre][bdur][bpost]concat=n=3:v=0:a=1[bgmfull];` +
        // Mix (duration = bgmfull)
        `[bgmfull][vdel]amix=inputs=2:duration=first:dropout_transition=0[m];` +
        // Fade out in last 1.5 sec
        `[m]afade=t=out:st=${Math.max(0, total - post).toFixed(3)}:d=${post.toFixed(3)}[out]`,

      "-map",
      "[out]",

      // Total length hard cap
      "-t",
      total.toFixed(3),

      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outFile,
    ]);

    const outBuffer = await fs.readFile(outFile);

    return new NextResponse(outBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="spot.mp3"',
      },
    });
  } catch (err: any) {
    console.error("Render error:", err);
    return new NextResponse(err?.message || "Server error", { status: 500 });
  }
}
