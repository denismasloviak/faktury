# Faktúry a úlohy — pripomienky opakujúcich sa platieb mailom

Stránka na pridávanie faktúr (firemné/súkromné, deň v mesiaci + koľko dní vopred
upozorniť) a úloh, dáta sync-nuté cez privátny GitHub Gist (rovnaký princíp ako HQ).
Raz denne beží GitHub Action, ktorá zoznam faktúr skontroluje a pošle mail cez
Gmail (SMTP), ak dnes vychádza upozornenie alebo je deň splatnosti.

## Ako to funguje

1. `index.html` — appka na pridávanie/úpravu faktúr a úloh, dáta v Gist-e (`faktury.json`).
2. `.github/workflows/pripomienky.yml` — cron, beží denne o 6:00 UTC.
3. `.github/scripts/check-and-notify.mjs` — prečíta Gist, spočíta dátumy, pošle mail cez Gmail.

Dáta (názvy faktúr, poznámky, úlohy) **nie sú v repe** ani vo workflow súbore —
sú len v privátnom Gist-e. Do repa/Actions ide len token na jeho čítanie (ako secret).

## Nasadenie

```bash
cd ~/Documents/claude_code/faktury
git init
git add -A
git commit -m "Faktury: pripomienky platieb mailom"
git branch -M main
git remote add origin https://github.com/TVOJE-MENO/faktury.git
git push -u origin main
```

Potom na GitHube:

1. Vytvor repo `faktury` (verejné — Pages na súkromnom repe je len platený plán,
   nevadí, žiadne citlivé dáta v repe nie sú).
2. **Settings → Pages → Source: Deploy from a branch → main / (root)** → Save.
   Po chvíli beží appka na `https://tvoje-meno.github.io/faktury/`.
3. **Settings → Secrets and variables → Actions → New repository secret** —
   pridaj tieto štyri:

   | Name | Hodnota |
   |---|---|
   | `GIST_TOKEN` | GitHub token so scope `gist` (rovnaký typ ako v appke — classic PAT, zaškrtnutý `gist`) |
   | `GMAIL_USER` | tvoja gmailová adresa, z ktorej sa bude posielať (napr. `denismasloviak@gmail.com`) |
   | `GMAIL_APP_PASSWORD` | App Password vygenerované v Google účte (postup nižšie) |
   | `TO_EMAIL` | mailová adresa, kam majú chodiť upozornenia |

4. Otvor appku na Pages URL, vlož ten istý `GIST_TOKEN` do onboarding obrazovky,
   pridaj prvú faktúru. Appka si sama vytvorí Gist.
5. Over cron ručne: **Actions → Pripomienky faktúr → Run workflow**, pozri log.

## Ako vygenerovať Gmail App Password

Bežné heslo do Gmailu na toto nepoužiješ — Google to blokuje. Treba samostatné
"App Password" (funguje len ak máš na účte zapnuté dvojfaktorové overenie):

1. Zapni 2-faktorové overenie (ak ešte nemáš): myaccount.google.com → **Security** →
   **2-Step Verification**.
2. Potom choď na **myaccount.google.com/apppasswords** (alebo Security → App passwords).
3. Zadaj názov (napr. "faktury") → **Create**.
4. Google ti ukáže 16-miestne heslo bez medzier (napr. `abcdwxyzabcdwxyz`) —
   to skopíruj do `GMAIL_APP_PASSWORD` secretu. Zobrazí sa len raz.

Toto heslo funguje len na posielanie mailu cez appky/skripty, nedá sa ním prihlásiť
na gmail.com — bezpečnejšie ako dávať niekam skutočné heslo.

## Formát dát v Gist-e (`faktury.json`)

```json
{
  "bills": [
    { "id": "abc123", "name": "Elektrina", "day": 12, "before": 2, "note": "cca 45 €", "type": "sukromne" }
  ],
  "tasks": [
    { "id": "xyz789", "text": "Zavolať dodávateľovi", "date": "2026-09-15", "done": false }
  ]
}
```

- `day` — deň v mesiaci splatnosti (1–31; ak mesiac nemá toľko dní, orezáva sa
  na jeho posledný deň, napr. 30. vo februári → 28./29.)
- `before` — koľko dní pred splatnosťou príde upozornenie
- `type` — `"firma"` alebo `"sukromne"`, len farebné rozlíšenie v appke a v maily
- v deň splatnosti príde ešte samostatný mail "Dnes treba zaplatiť"
- `tasks` sa mailom neposielajú, sú len v appke
