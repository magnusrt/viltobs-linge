# Viltobservasjoner Linge

Delt kart for å registrere hvor det er observert vilt ved Linge i Valldal (Fjord kommune). Appen kjører som en Google Apps Script-webapp. Observasjonene lagres i et Google-regneark.

## Funksjoner

- Kartlag: flyfoto (Esri), Kartverkets topografiske kart i farger og gråtone, og høydekurver med stedsnavn lagt over flyfotoet.
- Ny observasjon: trykk «Ny observasjon» og deretter i kartet. Markøren kan dras for å justere posisjonen.
- Felter: art, antall, dato og klokkeslett, vær, vindretning (fra) og snøforhold.
- Vær og vindretning fylles ut automatisk for valgt sted og tidspunkt. Feltene kan overstyres.
  - De siste 90 døgnene og inntil 2 døgn fram: MET Nordic-modellen fra MET Norge (1 km oppløsning), via Open-Meteo.
  - Eldre tidspunkt: ERA5-reanalyse, som er grovere.
- Hver observasjon viser koordinater i UTM 33 (EUREF89) og grader, med lenke til norgeibilder.no.
- Alle med lenken ser de samme observasjonene. Kartet oppdateres hvert minutt.

## Prototype uten database

`docs/index.html` er en frittstående versjon for å teste utforming og funksjoner. Den publiseres med GitHub Pages på https://magnusrt.github.io/viltobs-linge/

- Design «Kartblad» med trådkors i midten og koordinatlinje i UTM 33.
- Nye observasjoner plasseres med krysset: flytt kartet og trykk «Legg til ved krysset». Posisjon kan også settes der du står, eller med retning og avstand fra deg.
- Hjort registreres med antall bukk, kolle, kalv og ungdyr. Rådyr registreres med totalt antall.
- Min posisjon (GPS), med testmodus som simulerer at du står på gården Linge. Punktet kan dras.
- Filter per art og periode, og retningen dyret gikk vist som pil på markøren.
- Statistikk: hjort etter kategori med kalv per kolle og kolle per bukk, observasjoner per måned og per time på døgnet.
- Merkede eksempelobservasjoner som kan fjernes.

Observasjoner lagres bare i nettleseren på enheten. Værdata hentes direkte fra Open-Meteo (MET Nordic), eller via `getWeather` i `Code.gs` når siden kjøres i Apps Script.

## Filer

| Fil | Innhold |
| --- | --- |
| `Code.gs` | Server: lagring i regnearket og henting av værdata |
| `Index.html` | Kartet, skjemaet og listen (Leaflet) |

## Oppsett

1. Lag et nytt Google-regneark, for eksempel «Viltobservasjoner Linge».
2. Velg **Utvidelser → Apps Script**.
3. Erstatt innholdet i `Code.gs` med `Code.gs` fra dette repoet.
4. Trykk **+ → HTML**, gi filen navnet `Index` og lim inn `Index.html`.
5. Velg **Distribuer → Ny distribusjon → Nettapp**.
   - Kjør som: **Meg**
   - Hvem har tilgang: **Alle med en Google-konto**
6. Godkjenn tilgangene. Google varsler at appen ikke er bekreftet. Velg **Avansert → Gå til …**.
7. Del nettapp-lenken. Legg den gjerne på hjemskjermen på mobilen.

Arket «Observasjoner» opprettes automatisk ved første bruk.

## Oppdatere koden

Lim inn de nye filene i Apps Script og lagre. Velg deretter **Distribuer → Administrer distribusjoner**, rediger distribusjonen og velg **Ny versjon**. Lenken forblir den samme.

## Tilpasninger

- Startposisjon og zoom: `START` øverst i skriptet i `Index.html`.
- Forslag til arter: `ARTER` i `Index.html`.
- Valg for vær, vind og snø: `VAER`, `VIND` og `SNO`. Listene finnes i både `Index.html` og `Code.gs` og må være like.

## Datakilder og lisenser

- Topografisk kart: © Kartverket, CC BY 4.0.
- Flyfoto: Esri, Maxar, Earthstar Geographics.
- Værdata: MET Norge (MET Nordic) og ERA5 via Open-Meteo. Open-Meteo er gratis for ikke-kommersiell bruk.
- Norge i bilder kan ikke bygges inn i egne kart. Kartverket stengte de åpne kartflis-tjenestene i 2026. Appen lenker derfor til innsynsløsningen på norgeibilder.no.
