# CountApp - PRD (Product Requirements Document)

## Overview
App mobile Expo React Native per il conteggio preciso di oggetti industriali (barre, tubi, profili, travi) tramite riconoscimento AI con fotocamera.

## Categorie Supportate
- **Barre**: Tonde, Quadre, Rettangolari, Esagonali, Generiche
- **Tubi**: Tondi, Quadri, Rettangolari, Generici
- **Profili**: Profilo a L, Profilo a T
- **Travi**: IPE

## Flusso Applicativo
1. **Selezione Categoria** → Scelta del tipo di oggetto da contare
2. **Cattura Foto** → Scatto o selezione dalla galleria
3. **Selezione Area** → Disegno area di inclusione/esclusione sulla foto
4. **Conteggio AI** → Analisi GPT-4o dell'area selezionata
5. **Risultati** → Visualizzazione marker numerati + correzione manuale (+/-)

## Stack Tecnologico
- **Frontend**: Expo SDK 54, React Native, expo-router, react-native-svg, expo-image-picker
- **Backend**: FastAPI (Python), emergentintegrations (GPT-4o vision)
- **AI**: OpenAI GPT-4o per analisi immagini e conteggio
- **Database**: MongoDB (per storico futuro)

## Endpoints API
- `GET /api/` — Health check
- `POST /api/count` — Conteggio oggetti (input: immagine base64 + categoria + aree)

## Autenticazione
Nessuna autenticazione richiesta.
