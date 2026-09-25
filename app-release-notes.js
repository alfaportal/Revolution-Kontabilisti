/** Shënime versioni — shfaqen 1 herë pas përditësimit */
const RELEASE_NOTES = {
  "1.1.1": [
    "Rregullim Pasqyra (afatet ATK — gabim JavaScript)",
    "Rregullim Cilësimet → Të dhënat (rruga e folderit)",
    "Paketim i mbrojtur si Fiskale (Setup + Start.cmd)",
    "Folder të dhënash: %APPDATA%\\Kontabilisti\\{Biznes-Komuna}\\",
  ],
  "1.1.0": [
    "Të dhënat ruhen në AppData — të sigurta gjatë përditësimit/reinstalimit",
    "Backup automatik ditor (30 ditë)",
    "Eksport/Import ZIP (DB + fotot e faturave)",
    "KPI më të qarta te Shitjet (B2C / B2B / Total)",
    "Rregullim i formulës së Fitimit Neto",
  ],
};

function notesForVersion(version) {
  return RELEASE_NOTES[version] || ["Përmirësime dhe rregullime."];
}

module.exports = { RELEASE_NOTES, notesForVersion };
