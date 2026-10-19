# Cerca · Mainframe z/OS

Ricerca e ascolto della guida al mainframe IBM z/OS (256 pagine), del documento «a voce» (67 pagine) e di 34 estratti di fonti esterne.

**Sito:** https://hidesburrat0.github.io/cerca-mainframe/

## Cosa fa

- **Ricerca**: scrivi una parola chiave o una domanda e ti porta al passaggio giusto, con le parole evidenziate.
- **Ascolta**: legge ad alta voce qualsiasi sezione, con la voce neurale Kokoro che gira direttamente nel browser (niente server, niente abbonamenti).
- **Impostazioni › Voce**:
  - scegli Sara o Nicola, oppure mescola una delle due con un'altra voce per creare un timbro nuovo;
  - regola velocità, tono e la durata delle pause a virgola, due punti e punto;
  - decidi come vengono lette sigle e parole inglesi (per esempio JCL → «gei ci elle», job → «giòb»).

La prima volta che premi «Ascolta» il browser scarica il modello vocale (circa 90 MB). Da quel momento resta salvato sul dispositivo e non si riscarica.

L'assistente AI (modalità Ripasso e Colloquio) c'è solo nella versione su Claude.

## Come funziona la voce

| Pezzo | Cosa fa | Licenza |
|---|---|---|
| [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), versione ONNX int8 di [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) | Trasforma i fonemi in audio (`tts/model`, `tts/voices`) | Apache 2.0 |
| [eSpeak NG](https://github.com/espeak-ng/espeak-ng), build WebAssembly di [Echogarden](https://github.com/echogarden-project/espeak-ng-emscripten), ridotta a italiano e inglese | Trasforma il testo in fonemi (`tts/espeak`) | GPL 3.0 |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | Esegue il modello nel browser (`tts/ort`) | MIT |

- Le pronunce predefinite sono in `tts/pronunce.js`; quelle aggiunte dalle Impostazioni restano salvate solo nel browser.
- Il file `sw.js` attiva l'isolamento cross-origin, così la voce può usare più processori.
- Il modello è diviso in quattro parti da 23 MB per stare sotto il limite di caricamento di GitHub.
