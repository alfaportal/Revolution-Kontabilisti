## 2026-11-07 — Ndërtim i pastër 1.2.3

- Databaza e re: tabelat krijohen bosh. Fatura, klientë, shpenzime, Z-raporte, blerje dhe pagesa B2B = 0. Një rresht bosh te cilësimet, që të dalë regjistrimi i biznesit. 9 data afatesh të vitit (jo fatura). Nuk u hoq asgjë, sepse s’kishte të dhëna prove.
- Rivendosja i fshin të gjitha tabelat, përfshirë `b2b_payments`. Prova: pas fshirjes të gjitha 0, emri i biznesit bosh. `factory-reset.js` rreshtat 12–25. `z_report_items` është në listë, por tabela nuk ekziston.
- Setup: `dist-build-v1.2.3\Revolution-Kontabilisti-Setup-v1.2.3.exe`. Nuk u instalua në këtë hap. Në kompjuter duket vetëm pasi instalohet, mbyllet programi dhe hapet përsëri.

## 2026-11-07 — Fshirja e pagesës B2B

- Te çdo pagesë B2B ka butonin «Fshi». Pyetja është «Të fshihet kjo pagesë?» me Po dhe Jo. Skedari: `public/js/shitjet-app.js`, rreshtat 662–680 dhe 865, 910–920.
- Serveri e fshin pagesën, e rillogarit sa është paguar dhe borxhin, dhe e kthen statusin. Ditari e humb rreshtin sepse pagesa nuk është më në listë. Skedari: `server.js`, rreshtat 769–786.
- Prova në databazë të re: 1.000,00 € me pagesë 400,00 € u kthye Pa paguar dhe borxh 1.000,00 €, pa rresht në Ditari. 500,00 € e paguar u kthye Pa paguar dhe borxh 500,00 €. 800,00 € me 300,00 + 200,00, pas fshirjes së 200,00 mbeti 300,00 e paguar, borxh 500,00, Pjesërisht. Databaza u fshi.
- Prova e plotë me të njëjtat shifra: 47 kontrolle, asnjë gabim. Shitje 2.142,80 €, TVSH −723,66 €, bilanci −7.998,04 €. Databaza e dytë u fshi. Në programin e instaluar duket vetëm pas një Setup të ri.

## 2026-11-07 — Kolona 8% dhe kartat e bilancit

- Te Libri i Blerjes, kolona 8% merr TVSH-në e vërtetë. Coca-Cola: 900,00 te 18% dhe 0,00 te 8%. Ülker: 0,00 te 18% dhe 64,00 te 8%. Skedari: `public/js/kontabilisti-app.js`, `sectionBlerjeTvsh`.
- Kartat e Bilancit tregojnë shumat pa TVSH. Prova: 1.875,46 − 5.800,00 − 4.073,50 = −7.998,04, sa fitimi. Skedari: `public/js/kontabilisti-app.js`, `sectionBilanc`.
- Prova u bë në databazë të përkohshme, pastaj u fshi. Në programin e instaluar duket vetëm pas një Setup të ri.

## 2026-11-07 — Pagat, TVSH e shpenzimit dhe funksioni i papërdorur

- Te Pagat, nëse s’ka shpenzim «Paga», lista mbetet bosh dhe formulari del 0,00 €. Nuk nxirret më pagë nga shitjet. Skedari: `public/js/kontabilisti-app.js`, `sectionPaga`.
- Te Libri i Blerjes, kutia [43] e shpenzimit tregon TVSH-në, jo bazën. Kutia [K1] e numëron TVSH-në e shpenzimit një herë. Prova e veçantë: blerja 180,00 + shpenzimi 36,00 = [43] 216,00 dhe [K1] 216,00 (jo 252,00). Skedarët: `public/js/kontabilisti-app.js` rreshti i shpenzimit, `public/js/kontabilisti-atk.js` rreshtat 37–38.
- Funksioni i vjetër `buildVatDeclaration` nuk u hoq. Asnjë ekran nuk e përdor, por `tests/kontabilisti-test.js` e thërret te rreshtat 83 dhe 171.
- Prova e plotë me shpenzimin Mirëmbajtje 236,00 € (200,00 + TVSH 36,00): shitje 1.751,00, blerje 3.540,00, shpenzime 2.921,00, fitim neto −4.393,70, TVSH −316,30, [43] 576,00. Databaza e përkohshme u fshi. Në programin e instaluar duket vetëm pas një Setup të ri.

## 2026-11-07 — NUI, grafiku dhe pala e Z-raportit

- Fatura B2B pa NUI nuk ruhet. Mesazhi: «NUI është i detyrueshëm». Skedari: `validators.js`, rreshtat 37–43. Prova: kërkesë direkte pa NUI u refuzua. Fatura me NUI u ruajt.
- Grafiku i Pasqyrës mbledh Z-raportin dhe faturën B2B. Prova: 335,00 + 1.416,00 = 1.751,00 për të njëjtën ditë. Skedari: `server.js`, rreshtat 1003–1011.
- Te Ditari, pala e Z-raportit është numri i raportit. Prova: Pala «Z-0001», totali 335,00 €. Skedari: `server.js`, rreshti 1062.
- Prova u bë në databazë të përkohshme, pastaj u fshi. Databaza e përdoruesit nuk u prek. Në programin e instaluar duket vetëm pas një Setup të ri.

## 2026-11-07 — Tre rregullimet e fundit

- Deklarata merr TVSH-në e ruajtur nga faturat dhe Z-raporti, jo 18% të bazës. Kutia [12] = 198,31 €, [16] = 201,64 €, [30] = −158,36 €, njësoj me Pasqyrën. Skedari: `vat-engine.js` rreshtat 205–212. Kontrolli te `audit-engine.js` rreshtat 27–32 u përshtat që të mos e quajë gabim këtë përputhje.
- Te Kontabilisti → Shpenzimet mbeten vetëm shpenzimet. Prova: Qira 400,00 €, Rryma 120,00 €, Paga 1.500,00 €, gjithsej 2.020,00 €. Pa blerje, pa 5%. Skedari: `public/js/kontabilisti-app.js`, `sectionShpenzime`.
- Te Ditari, pala e shpenzimit është kategoria. Qiraja 400,00 € del Tipi «Shpenzim», Pala «Qira». Skedari: `server.js`, rreshti i shpenzimeve te Ditari.
- Prova A u bë në databazë të përkohshme, pastaj u fshi. Databaza e përdoruesit nuk u prek. Në programin e instaluar duket vetëm pas një Setup të ri.

## 2026-11-07 — Pagesa B2B dhe shpenzimet sipas kategorisë

- Te faturat B2B të finalizuara ka butonin «Regjistro pagesën». Pagesa ruhet veç. Rreshti tregon totalin, sa është paguar, borxhin dhe statusin. Ditari shton rreshtin «Pagesë B2B». Skedarët: `database.js`, `server.js`, `public/js/shitjet-app.js`, `factory-reset.js`.
- Te Raportet, Libri i Shpenzimeve mblidhet sipas kategorisë. Prova: Qira 500,00 €, Rryma 85,50 €, Paga 1.200,00 €, gjithsej 1.785,50 €. Skedari: `public/js/raportet-app.js`.
- Pasqyra mbeti e njëjtë pas pagesës 200,00 €: shitje 519,40 €, blerje 590,00 €, shpenzime 1.785,50 €, fitim bruto −42,61 €, fitim neto −1.828,11 €, TVSH −27,99 €.
- Prova u bë në databazë të përkohshme. Në programin e instaluar duket vetëm pas një Setup të ri.

## 2026-11-07 — Kutitë e TVSH-së, qiraja dhe titulli i bilancit

- Te Libri i Shitjes, kutia [12] tregon TVSH-në (45,75 € në provë), jo bazën. Te Libri i Blerjes, kutia [43] tregon TVSH-në (90,00 €). Skedari: `public/js/kontabilisti-atk.js`, rreshtat 20–21 dhe 33. Rreshti i blerjes te `public/js/kontabilisti-app.js` rreshti 486.
- Te Qera, shuma vjen nga shpenzimet me kategorinë Qira. Qiraja 300,00 € doli 300,00 €. Skedari: `public/js/kontabilisti-app.js`, `loadQiraRows` dhe `sectionQera`.
- Titulli i bilancit tani thotë se fitimi është pa TVSH. Formula nuk u prek.
- Prova u bë në databazë të përkohshme. Databaza e përdoruesit nuk u prek. Në programin e instaluar duket vetëm pas një Setup të ri.

## 2026-11-07 — Pagesa e blerjes te Ditari

- Te Ditari, pagesa e një blerjeje del si rresht më vete: tipi «Pagesë blerje», pala është furnitori, pa TVSH dhe totali janë shuma e pagesës, TVSH është 0. Skedari: `server.js`, rreshtat 1030–1035.
- Prova me server të përkohshëm: blerja 500,00 + 90,00 = 590,00 dhe pagesa 200,00 dolën si dy rreshta. Databaza e përdoruesit nuk u prek.
- Pagesat e klientëve B2B nuk kanë tabelë të vetën. Ato mbeten te fatura. Nuk u shtua rresht i ri për to.

## 2026-11-07 — Shiriti i Z-raportit dhe komentet

- Te Pasqyra, shiriti i verdhë për Z-raportet që mungojnë ka buton × në të djathtë. Klikimi e fsheh vetëm për këtë hapje të programit. Herën tjetër del prapë. Skedarët: `public/js/pasqyra-app.js`, `public/css/modules.css`.
- U hoqën komentet nga skedarët e programit që u kërkuan. Komentet te `tests/` mbetën.
- Te `protection/cloud-license.js` një rresht u prek gabim (`blocked: false` u bë `true`). U kthye siç ishte.
- Sintaksa e skedarëve u kontrollua me `node --check`. Butoni × nuk u klikua në programin e hapur. NUK ËSHTË PROVUAR në ekran. Duket vetëm pas një Setup të ri.
