/* =====================================================================
   Tests du moteur de tarification (CX.tarifs) - sans navigateur
   Lancer :  node commercial/tests/tarifs-moteur.test.js
   Les montants attendus sont calculés à la main (voir commentaires) à
   partir des grilles de démonstration de cx-data.js (seedTarifs) :
     TAR-0001 standard : minimum 1 500 F, arrondi 100 F au plus proche
     TAR-0002 Pharmacies & santé : base TAR-0001 - 10 %, suppléments hérités
     TAR-0003 PHARMACIE PACIFIC : base TAR-0002, arrondi 100 F supérieur
     TAR-0004 Banques : plis, base TAR-0001
   TVA 19,25 %.
   ===================================================================== */
var shim = require("./shim.js");
var ctx = shim(["assets/cx-core.js", "assets/cx-data.js", "assets/cx-tarifs.js"]);
var CX = ctx.CX, T = CX.tarifs, U = CX.util;

var nb = 0, ko = 0;
function eq(nom, obtenu, attendu) {
    nb++;
    if (obtenu === attendu) console.log("  ok   " + nom + " = " + obtenu);
    else { ko++; console.log("  ÉCHEC " + nom + " : obtenu " + obtenu + ", attendu " + attendu); }
}
var STD = T.grilleParId(1);
function ht(grille, envoi) { return T.calculer(grille, envoi).ht; }

console.log("Grille standard (TAR-0001)");
/* 3 000 F jusqu'à 1 kg + 2 × 250 F = 3 500 F */
var r = T.calculer(STD, { villeDep: "DOUALA", villeDest: "YAOUNDE", nature: "Colis", poids: 3 });
eq("national colis 3 kg (HT)", r.ht, 3500);
eq("national colis 3 kg (TVA 19,25 %)", r.tva, 674);          // 3 500 × 0,1925 = 673,75
eq("national colis 3 kg (TTC)", r.ttc, 4174);
eq("règle retenue", r.regle.libelle, "National · colis");
/* 2 kg réels, 40×30×25/5000 = 6 kg taxables : 3 000 + 5 × 250 = 4 250 -> arrondi au 100 le plus proche = 4 300 */
eq("poids volumétrique", ht(STD, { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 2, L: 40, l: 30, H: 25 }), 4300);
/* Pli 0,4 kg national : tranche 0 – 0,5 kg = 2 000 F */
eq("pli national 0,4 kg (tranches)", ht(STD, { villeDep: "DOUALA", villeDest: "KRIBI", nature: "Pli fermé", poids: 0.4 }), 2000);
/* Document 3 kg national : au-delà de 2 kg -> règle National · colis : 3 000 + 2 × 250 = 3 500 */
eq("document 3 kg national (repli sur colis)", ht(STD, { villeDep: "DOUALA", villeDest: "KRIBI", nature: "Document", poids: 3 }), 3500);
/* 12 plis urbains : dégressif dès 10 pièces = 800 F × 12 = 9 600 F */
eq("12 plis urbains (pièce dégressive)", ht(STD, { villeDep: "DOUALA", villeDest: "DOUALA", nature: "Pli fermé", poids: 0.1, nombre: 12 }), 9600);
/* Urbain colis 4 kg : 1 500 + 3 × 150 = 1 950 -> 2 000 (arrondi le plus proche) ; identique à l'ancien CX.tarif */
eq("urbain colis 4 kg", ht(STD, { villeDep: "DOUALA", villeDest: "DOUALA", poids: 4 }), 2000);
eq("compatibilité CX.tarif.transport", CX.tarif.transport("DOUALA", "DOUALA", 4), CX.tarif.transportIndicatif("DOUALA", "DOUALA", 4));
/* Grand Nord 35 kg : au-delà de 30 kg : 23 000 + 5 × 600 = 26 000 ; même prix dans l'autre sens */
eq("Grand Nord Douala → Garoua 35 kg", ht(STD, { villeDep: "DOUALA", villeDest: "GAROUA", poids: 35 }), 26000);
eq("Grand Nord Garoua → Douala (bidirectionnel)", ht(STD, { villeDep: "GAROUA", villeDest: "DOUALA", poids: 35 }), 26000);
/* Fret 260 kg, paliers cumulatifs : 50×300 + 150×250 + 60×200 + 5 000 = 69 500 */
eq("fret 260 kg (paliers cumulatifs)", ht(STD, { villeDep: "DOUALA", villeDest: "YAOUNDE", typeEnvoi: "FRET", poids: 260 }), 69500);
/* Fragile 3 kg : 3 500 + 25 % (875) = 4 375 -> 4 400 */
eq("supplément Fragile +25 %", ht(STD, { villeDep: "DOUALA", villeDest: "YAOUNDE", nature: "Fragile", poids: 3 }), 4400);
/* Assurance 1 % de 250 000 = 2 500 ; total 3 500 + 2 500 = 6 000 */
r = T.calculer(STD, { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 3, valeurDeclaree: 250000 });
eq("ad valorem cumulable (total)", r.ht, 6000);
eq("ad valorem (part assurance)", r.parts.assurance, 2500);
/* Express +50 % (1 750) + livraison zone 2 (2 500) : 3 500 + 1 750 + 2 500 = 7 750 -> 7 800 */
r = T.calculer(STD, { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 3, express: true, livraison: "DOMICILE", zone: "Z2" });
eq("express + livraison à domicile Z2", r.ht, 7800);
eq("part livraison", r.parts.livraison, 2500);
/* Emballage 500 F par colis × 3 colis de 3 kg : 3 × 3 500 + 1 500 = 12 000 */
eq("3 colis + emballage par colis", ht(STD, { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 3, nombre: 3, emballage: true }), 12000);
/* CEMAC Gabon 2,3 kg : 2,5 kg × 4 500 = 11 250 < minimum 15 000 */
eq("régional CEMAC (au kg, minimum)", ht(STD, { villeDep: "DOUALA", paysDest: "Gabon", poids: 2.3 }), 15000);
/* International France 1,2 kg : 25 000 + 2 × 6 000 (pas 0,5 kg) = 37 000 */
eq("international France 1,2 kg (incrément 0,5 kg)", ht(STD, { villeDep: "DOUALA", paysDest: "France", poids: 1.2 }), 37000);
/* Plusieurs colis de natures différentes : 3 500 (colis 3 kg) + 2 000 (pli 0,4 kg) = 5 500 */
eq("envoi multi-colis", ht(STD, { villeDep: "DOUALA", villeDest: "YAOUNDE", colis: [{ nature: "Colis", poids: 3 }, { nature: "Pli fermé", poids: 0.4 }] }), 5500);

console.log("Résolution de la grille d'un client");
var res = T.resoudre(1);
eq("client 1 : origine", res.origine, "CONTRAT");
eq("client 1 : grille", res.grille.code, "TAR-0003");
eq("client 1 : contrat", res.contrat.numero, "CTR-" + U.today().substr(0, 4) + "-0001");
eq("client 4 : groupe", T.resoudre(4).origine + " " + T.resoudre(4).grille.code, "GROUPE TAR-0002");
eq("client 11 : contrat banque", T.resoudre(11).origine + " " + T.resoudre(11).grille.code, "CONTRAT TAR-0004");
eq("client 5 : standard", T.resoudre(5).origine + " " + T.resoudre(5).grille.code, "STANDARD TAR-0001");
eq("client 6 : contrat résilié -> standard", T.resoudre(6).origine, "STANDARD");
eq("sans client : standard", T.resoudre(null).grille.code, "TAR-0001");
var apres = U.addDays(U.today(), 25);   // contrat et grille PACIFIC expirés, grille Pharmacies encore valide
eq("client 1 après fin de contrat : groupe", T.resoudre(1, apres).origine, "GROUPE");
eq("client 5 simulé dans le groupe 1", T.resoudre(5, null, { groupeIds: [1] }).grille.code, "TAR-0002");

console.log("Grilles client / groupe");
var PAC = res.grille;
/* Navette Douala ⇄ Yaoundé 12 kg, palier atteint 5–20 kg : 12 × 500 = 6 000 */
eq("PACIFIC navette 12 kg (palier atteint)", ht(PAC, { villeDep: "YAOUNDE", villeDest: "DOUALA", poids: 12 }), 6000);
/* PACIFIC 2 kg : 2 × 700 = 1 400 < minimum 2 500 */
eq("PACIFIC navette 2 kg (minimum de la règle)", ht(PAC, { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 2 }), 2500);
/* Douala → Bafoussam colis 3 kg : aucune règle PACIFIC ni Pharmacies -> standard 3 500 - 10 % = 3 150 -> 3 200 (arrondi supérieur) */
r = T.calculer(PAC, { villeDep: "DOUALA", villeDest: "BAFOUSSAM", poids: 3 });
eq("PACIFIC repli sur la base de la base (-10 %)", r.ht, 3200);
eq("règle de repli", r.regle.libelle, "National · colis");
/* Médicament 2,2 kg : 2 800 + 3 × 200 (pas 0,5 kg) = 3 400 + supplément Médicament hérité 1 000 = 4 400 */
eq("PACIFIC médicament (règle du groupe + supplément hérité)", ht(PAC, { villeDep: "DOUALA", villeDest: "BAFOUSSAM", nature: "Médicament", poids: 2.2 }), 4400);
/* Banque : 25 plis urbains, dégressif dès 20 = 650 × 25 = 16 250 -> 16 300 (arrondi supérieur) */
eq("banque 25 plis urbains", ht(T.grilleParId(4), { villeDep: "YAOUNDE", villeDest: "YAOUNDE", nature: "Document", poids: 0.05, nombre: 25 }), 16300);
/* Projet 2027 : majoration 5 % de la base : 3 500 + 175 = 3 675 -> 3 700 */
eq("majoration de la base (remise négative)", ht(T.grilleParId(5), { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 3 }), 3700);

console.log("Modèles isolés");
function g(regle, opts) {
    var x = T.nouvelleGrille("CLIENT");
    x.arrondi = 1; x.regles = [regle];
    for (var k in (opts || {})) x[k] = opts[k];
    return x;
}
var pal = T.nouvelleRegle("PALIERS");     // 10 kg à 400, 50 kg à 300, au-delà 200, min 2 000
eq("paliers cumulatifs 60 kg", ht(g(pal), { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 60 }), 18000);   // 4 000 + 12 000 + 2 000
pal.params.mode = "ATTEINT";
eq("paliers au palier atteint 60 kg", ht(g(pal), { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 60 }), 12000);  // 60 × 200
var inc = T.nouvelleRegle("INCREMENTIEL"); inc.params.pas = 0.5;     // 2 500 jusqu'à 1 kg + 500 par 0,5 kg
eq("incrémentiel par pas de 0,5 kg (2,2 kg)", ht(g(inc), { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 2.2 }), 4000);
var tr = T.nouvelleRegle("TRANCHES");   // 1 kg 2 500 · 5 kg 4 500 · 10 kg 7 000 · 20 kg 11 000 · au-delà +500/kg
eq("tranches 1 – 5 kg", ht(g(tr), { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 5 }), 4500);
eq("tranches au-delà (23 kg)", ht(g(tr), { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 23 }), 12500);
var kgR = T.nouvelleRegle("AU_KG");     // 350 F/kg, minimum 3 000
eq("au kg 12 kg", ht(g(kgR), { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 12 }), 4200);
eq("au kg 5 kg (minimum)", ht(g(kgR), { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 5 }), 3000);
/* TVA incluse : 5 kg × 1 000 = 5 000 TTC -> HT 5 000 / 1,1925 = 4 193 */
var ttc = T.nouvelleRegle("AU_KG"); ttc.params = { prixKg: 1000, minimum: 0, pasKg: 1 };
r = T.calculer(g(ttc, { tvaIncluse: true }), { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 5 });
eq("TVA incluse : TTC", r.ttc, 5000);
eq("TVA incluse : HT", r.ht, 4193);
eq("TVA incluse : TVA", r.tva, 807);
var adv = T.nouvelleRegle("AD_VALOREM"); adv.cumulable = false;   // seule règle : 1 % min 1 000
eq("ad valorem seul (minimum)", ht(g(adv), { villeDep: "DOUALA", villeDest: "YAOUNDE", poids: 1, valeurDeclaree: 50000 }), 1000);
r = T.calculer(g(T.nouvelleRegle("PIECE")), { villeDep: "DOUALA", paysDest: "France", poids: 1 });
eq("hors périmètre : pas d'alerte manquante", r.alertes.length > 0 || !!r.regle, true);
eq("contrôle de règle (tranches non croissantes)", T.verifierRegle({ modele: "TRANCHES", params: { tranches: [{ max: 5, prix: 1 }, { max: 2, prix: 2 }] } }).length, 1);

console.log("\n" + (nb - ko) + " / " + nb + " tests réussis");
if (ko) process.exitCode = 1;
