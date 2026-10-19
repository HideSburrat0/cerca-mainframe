---
library_name: piper
license: cc-by-4.0
language:
- it
tags:
- text-to-speech
- tts
- piper
- italian
datasets:
- committa/serena-synthetic-it-28h
pipeline_tag: text-to-speech
---

# it_IT-serena-high — Piper voice (Italian)

Custom Italian voice for [Piper](https://github.com/OHF-Voice/piper1-gpl), trained from the
`committa/serena-synthetic-it-28h` dataset (Qwen3-TTS synthetic voice).

- Language: Italian (`it`) — neutral Standard Italian (no regional accent)
- Voice: **female** ("serena")
- Sample rate: 22050 Hz
- Quality: high
- Files: `it_IT-serena-high.onnx` + `it_IT-serena-high.onnx.json` (must stay together)

## License

CC-BY-4.0 — this model is derived from
[committa/serena-synthetic-it-28h](https://huggingface.co/datasets/committa/serena-synthetic-it-28h).

## Recommended inference settings

The `.onnx.json` already embeds these defaults; the CLI uses them automatically.
They were chosen after stability testing: the Piper stock defaults (0.667 / 0.8)
tend to swallow phonemes (e.g. /r/ in "portato").

| Parameter       | Value |
|-----------------|-------|
| noise_scale     | 0.6   |
| length_scale    | 1.0   |
| noise_w         | 0.4   |
| sentence_silence| 0.2   |

## Sample

<audio controls src="https://huggingface.co/committa/it_IT-serena-high/resolve/main/samples/speaker_0.mp3"></audio>

## CLI usage

```sh
piper -m it_IT-serena-high.onnx < text.txt
```

Explicit overrides (optional):

```sh
piper -m it_IT-serena-high.onnx --noise-scale 0.6 --noise-w 0.4 < text.txt
```

## Home Assistant (piper add-on)

The Home Assistant add-on ignores the `.onnx.json` settings and always passes its
own options, whose defaults (noise_scale 0.667, noise_w 0.333) are NOT optimal for
this voice. For the best quality set in the add-on options:

- `noise_scale`: **0.6**
- `length_scale`: 1.0
- `noise_w`: **0.4**
- `sentence_silence`: 0.2 (optional; add-on default is 0.0)

## Notes

- Pronunciation of rare vocabulary (<10 occurrences in training data) can be off;
  fix with espeak-ng rules if needed.
- The training checkpoint (base for finetuning other Italian voices) is published at:
  https://huggingface.co/committa/it_IT-serena-high-checkpoint
