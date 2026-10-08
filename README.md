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

```bash
npm test
```

Ce iese în `dist/` e un site static, plus funcția din `api/`. Pe Vercel, fiecare push pe `main` îl publică din nou.

## Versiune nouă a aplicației

Nu se mai face nimic în site. APK-ul vine din ultimul release al aplicației
([PingUp/releases](https://github.com/dulgherustefan/PingUp/releases)): `/ping-up.apk` trimite la fișierul lui,
iar `/apk.json` dă versiunea, mărimea și SHA-256-ul. CDN-ul le ține 5 minute, deci un release nou apare pe site în
cel mult 5 minute, fără deploy.

Opțional, pe Vercel: `GITHUB_TOKEN` (un token fără drepturi) ridică limita de cereri către GitHub. Fără el,
descărcarea merge oricum; doar mărimea și SHA-256-ul pot lipsi o vreme.

## Ce e unde

- `app.json`: numele aplicației, versiunea de rezervă (dacă GitHub nu răspunde la build), Android-ul minim (SDK) și
  `certSha256`, amprenta certificatului de semnare (din notele primului release), afișată sub butonul de descărcare.
- `api/apk.js`, `lib/release.js`: ultimul release de pe GitHub, pentru butonul de descărcare.
- `src/data/venue.json`: harta festivalului, aceeași ca în aplicație.
- `src/scene/`: scena 3D (Three.js): mulțimea și rețeaua, oamenii, scenele, construcțiile, pinul din logo, solul și harta.
- `src/story.js`: ce se întâmplă în scenă la fiecare capitol, pe scroll.
- `src/nav.js`: saltul la o secțiune, din bara de sus.
- Fontul Inter (SIL Open Font License) și iconițele Phosphor (MIT); licențele sunt în `licenses/`.
