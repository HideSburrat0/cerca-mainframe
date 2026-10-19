"""Prova le voci «grandi» (Qwen3-TTS, Chatterbox, XTTS-v2, F5-TTS) in italiano, su CPU.
Uso: python tools/prova_voci.py <modello> <cartella-uscita>"""
import json, os, sys, time, subprocess
import numpy as np, soundfile as sf

TESTO = ("Quando faccio sabmìt, il giòb entra in gès due, che gli assegna un giòb ai di e lo scrive sullo spùl. "
         "Poi il convèrter controlla la sintassi del gei ci elle: se trova un errore, il giòb finisce con gei ci elle èrror, senza partire. "
         "Se lo stèp va in esse zero ci sette, apro esse di esse effe e controllo con erre a ci effe chi può usare il dàta set.")
REF_TXT = open("tools/ref/ref.txt").read().strip()
REFS = ["sara", "nicola", "serena"]
modello, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
info = {"modello": modello, "voci": {}}

def salva(nome, wav, sr, dt):
    wav = np.asarray(wav, dtype=np.float32).reshape(-1)
    sf.write(f"/tmp/{nome}.wav", wav, sr)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", f"/tmp/{nome}.wav", "-b:a", "96k", f"{out}/{nome}.mp3"], check=True)
    info["voci"][nome] = {"secondi_audio": round(len(wav) / sr, 2), "secondi_calcolo": round(dt, 1), "rtf": round(dt / (len(wav) / sr), 2)}
    print(nome, info["voci"][nome], flush=True)

t0 = time.time()
if modello == "qwen":
    import torch
    from qwen_tts import Qwen3TTSModel
    m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-0.6B-Base", device_map="cpu", dtype=torch.float32)
    info["caricamento"] = round(time.time() - t0, 1)
    for r in REFS:
        t = time.time()
        wavs, sr = m.generate_voice_clone(text=TESTO, language="Italian", ref_audio=f"tools/ref/{r}.wav", ref_text=REF_TXT)
        salva(f"qwen-{r}", wavs[0], sr, time.time() - t)
elif modello == "chatterbox":
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    try: m = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model="v3")
    except TypeError: m = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    info["caricamento"] = round(time.time() - t0, 1)
    for r in REFS:
        t = time.time()
        wav = m.generate(TESTO, language_id="it", audio_prompt_path=f"tools/ref/{r}.wav")
        salva(f"chatterbox-{r}", wav.squeeze().cpu().numpy(), m.sr, time.time() - t)
elif modello == "xtts":
    os.environ["COQUI_TOS_AGREED"] = "1"
    from TTS.api import TTS
    m = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
    info["caricamento"] = round(time.time() - t0, 1)
    for r in REFS:
        t = time.time()
        wav = m.tts(text=TESTO, speaker_wav=f"tools/ref/{r}.wav", language="it")
        salva(f"xtts-{r}", wav, 24000, time.time() - t)
elif modello == "f5":
    from huggingface_hub import hf_hub_download
    from f5_tts.api import F5TTS
    ck = hf_hub_download("alien79/F5-TTS-italian", "model_159600.safetensors")
    vo = hf_hub_download("alien79/F5-TTS-italian", "vocab.txt")
    m = F5TTS(model="F5TTS_Base", ckpt_file=ck, vocab_file=vo, device="cpu")
    info["caricamento"] = round(time.time() - t0, 1)
    for r in REFS:
        t = time.time()
        wav, sr, _ = m.infer(ref_file=f"tools/ref/{r}.wav", ref_text=REF_TXT, gen_text=TESTO)
        salva(f"f5-{r}", wav, sr, time.time() - t)
json.dump(info, open(f"{out}/info.json", "w"), indent=1)
