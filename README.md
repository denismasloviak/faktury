# Faktúry — pripomienky opakujúcich sa platieb mailom

Jedna stránka na pridávanie faktúr (deň v mesiaci + koľko dní vopred upozorniť),
dáta sync-nuté cez privátny GitHub Gist (rovnaký princíp ako HQ). Raz denne beží
GitHub Action, ktorá zoznam skontroluje a pošle mail cez Resend, ak dnes vychádza
upozornenie alebo je deň splatnosti.

## Ako to funguje

1. `index.html` — appka na pridávanie/úpravu faktúr, dáta v Gist-e (`faktury.json`).
2. `.github/workflows/pripomienky.yml` — cron, beží denne o 6:00 UTC.
3. `.github/scripts/check-and-notify.mjs` — prečíta Gist, spočíta dátumy, pošle mail cez Resend API.

Dáta faktúr (názvy, poznámky) **nie sú v repe** ani vo workflow súbore — sú len
v privátnom Gist-e. Do repa/Actions ide len token na jeho čítanie (ako secret).

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
   | `RESEND_API_KEY` | API kľúč z resend.com |
   | `TO_EMAIL` | mailová adresa, kam majú chodiť upozornenia |
   | `FROM_EMAIL` | voliteľné, napr. `Faktury <onboarding@resend.dev>` — ak nezadáš, použije sa tento default |

4. Otvor appku na Pages URL, vlož ten istý `GIST_TOKEN` do onboarding obrazovky,
   pridaj prvú faktúru. Appka si sama vytvorí Gist.
5. Over cron ručne: **Actions → Pripomienky faktúr → Run workflow**, pozri log.

## Dôležité — Resend a cudzí príjemca

Bez overenej vlastnej domény v Resend-e vie účet `onboarding@resend.dev` v niektorých
prípadoch posielať len na mail, ktorým bol Resend účet založený — nie na ľubovoľnú
cudziu adresu. Ak prvý test na `TO_EMAIL` nepríde:

1. Choď na resend.com → **Domains** → Add Domain (stačí doména, čo vlastníš).
2. Pridaj 2–3 DNS záznamy, ktoré ti Resend ukáže (trvá pár minút, u niektorých
   poskytovateľov aj pár hodín, kým sa DNS prejaví).
3. Zmeň `FROM_EMAIL` secret na `Faktury <pripomienka@tvoja-domena.sk>`.

## Formát dát v Gist-e (`faktury.json`)

```json
{
  "bills": [
    { "id": "abc123", "name": "Elektrina", "day": 12, "before": 2, "note": "cca 45 €" }
  ]
}
```

- `day` — deň v mesiaci splatnosti (1–31; ak mesiac nemá toľko dní, orezáva sa
  na jeho posledný deň, napr. 30. vo februári → 28./29.)
- `before` — koľko dní pred splatnosťou príde upozornenie
- v deň splatnosti príde ešte samostatný mail "Dnes treba zaplatiť"
