# Voce italiana Coqui VITS «mai_female» (Lisa Caputo)

Modello `tts_models/it/mai_female/vits` del model zoo di [Coqui TTS](https://github.com/coqui-ai/TTS) (release v0.6.1_models),
addestrato sul dataset M-AILABS, voce di Lisa Caputo.
Convertito in ONNX (fp32) con `coqui-tts` dal workflow `.github/workflows/converti-voci.yml` e diviso in parti da 23 MB.
Legge lettere, non fonemi: il testo viene semplificato (minuscole, niente accenti, numeri in parole).
