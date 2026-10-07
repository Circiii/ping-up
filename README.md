# Ping Up · site

Pagina de prezentare a aplicației Ping Up, de unde se descarcă APK-ul pentru Android: [ping-up.org](https://ping-up.org). Mesajele sar din telefon în
telefon, prin Bluetooth, fără internet; site-ul arată cum, pe un festival în 3D.

Codul aplicației: [github.com/dulgherustefan/PingUp](https://github.com/dulgherustefan/PingUp).

## Rulare

```bash
npm install
```

```bash
npm run dev
```

Pe telefon, în aceeași rețea: `npm run dev -- --host`.

```bash
npm run build
```

Ce iese în `dist/` e un site static. Pe Vercel, fiecare push pe `main` îl publică din nou.

## APK nou

```bash
npm run apk -- cale/catre/app-debug.apk
```

Copiază APK-ul în `public/ping-up.apk` și scrie în `public/apk.json` versiunea, mărimea și SHA-256-ul lui, pe care
butonul de descărcare le afișează. Versiunea ajunge și în `app.json`. După commit și push, site-ul servește APK-ul nou.

## Ce e unde

- `app.json`: numele aplicației, versiunea și Android-ul minim (SDK).
- `src/data/venue.json`: harta festivalului, aceeași ca în aplicație.
- `src/scene/`: scena 3D (Three.js): mulțimea și rețeaua, oamenii, scenele, construcțiile, pinul din logo, solul și harta.
- `src/story.js`: ce se întâmplă în scenă la fiecare capitol, pe scroll.
- `src/nav.js`: saltul la o secțiune, din bara de sus.
- Fontul Inter (SIL Open Font License) și iconițele Phosphor (MIT); licențele sunt în `licenses/`.
