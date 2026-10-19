# Cerca · Mainframe z/OS

Ricerca e ascolto della guida al mainframe IBM z/OS (256 pagine), del documento «a voce» (67 pagine) e di 34 estratti di fonti esterne.

**Sito:** https://hidesburrat0.github.io/cerca-mainframe/

## Cosa fa

- **Ricerca**: scrivi una parola chiave o una domanda e ti porta al passaggio giusto, con le parole evidenziate.
- **Ascolta**: legge ad alta voce qualsiasi sezione, con la voce neurale Kokoro che gira direttamente nel browser (niente server, niente abbonamenti).
- **Impostazioni › Voce**:
  - scegli tra otto voci italiane (vedi la tabella sotto), oppure una delle voci Kokoro straniere che leggono in italiano con il loro accento;
  - mescola Sara o Nicola con un'altra voce Kokoro per creare un timbro nuovo;
  - regola velocità, tono e la durata delle pause a virgola, due punti e punto;
  - decidi come vengono lette sigle e parole inglesi (per esempio JCL → «gei ci elle», job → «giòb»).

Ogni voce si scarica la prima volta che la usi (da 20 a 110 MB). Da quel momento resta salvata sul dispositivo e non si riscarica.

## Le voci

| Voce | Motore | Note | Licenza |
|---|---|---|---|
| Sara, Nicola | Kokoro-82M | le più naturali, ma le più lente da generare | Apache 2.0 |
| Serena, Serena HD | Piper | di [committa](https://huggingface.co/committa/it_IT-serena-medium), addestrata su una voce sintetica Qwen3-TTS | CC BY 4.0 |
| Paola | Piper | [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices), dataset di Paola Persico | vedi dataset |
| Riccardo | Piper | rhasspy/piper-voices, dataset M-AILABS; la più leggera | vedi dataset |
| Miro, Dii | Piper | di [OpenVoiceOS](https://huggingface.co/OpenVoiceOS/pipertts_it-IT_miro), dati sintetici | CC BY-NC-SA 4.0 (solo uso non commerciale) |

Le voci Piper sono copiate dalle release di [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models). Serena viene da Hugging Face, tramite il workflow `.github/workflows/voce-serena.yml`. Ogni cartella in `tts/piper/` contiene il model card originale.

L'assistente AI (modalità Ripasso e Colloquio) c'è solo nella versione su Claude.

## Come funziona la voce

| Pezzo | Cosa fa | Licenza |
|---|---|---|
| [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), versione ONNX int8 di [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) | Trasforma i fonemi in audio (`tts/model`, `tts/voices`) | Apache 2.0 |
| [eSpeak NG](https://github.com/espeak-ng/espeak-ng), build WebAssembly di [Echogarden](https://github.com/echogarden-project/espeak-ng-emscripten), ridotta a italiano e inglese | Trasforma il testo in fonemi (`tts/espeak`) | GPL 3.0 |
| [Piper](https://github.com/OHF-Voice/piper1-gpl) | Le voci Piper (`tts/piper`) | vedi tabella sopra |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | Esegue il modello nel browser (`tts/ort`) | MIT |

- Le pronunce predefinite sono in `tts/pronunce.js`; quelle aggiunte dalle Impostazioni restano salvate solo nel browser.
- Il file `sw.js` attiva l'isolamento cross-origin, così la voce può usare più processori.
- I modelli sono divisi in parti da 23 MB per stare sotto il limite di caricamento di GitHub.
