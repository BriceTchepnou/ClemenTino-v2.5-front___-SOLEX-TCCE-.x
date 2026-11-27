/* =====================================================================
   ClemenTino 2.0 - Export du jeu de données de démonstration
   ---------------------------------------------------------------------
   Exécute, sous Node (sans navigateur), les MÊMES générateurs que les
   maquettes (cx-data.js, cx-demo-exploitation.js, guichet-commun.js,
   ops-commun.js, carnets-common.js) puis écrit le résultat dans data/ :

     data/jeu-de-donnees.json        store complet (clé localStorage cx_commercial_demo_v1)
     data/carnets.json               carnets de LT (clé ct_carnets_demo_cx_v1)
     data/collections/<nom>.json     une collection par fichier (lisible / diffable)
     data/index.json                 date de génération, volumes par collection

   Usage :   node outils/generer-jeu-de-donnees.js [AAAA-MM-JJ]
             (date de référence facultative ; défaut : aujourd'hui)

   Les dates sont relatives à la date de référence (J-92 à J+4).
   Sert de référence pour les fixtures / migrations côté Symfony.
   ===================================================================== */
var fs = require("fs"), path = require("path"), vm = require("vm");
var RACINE = path.join(__dirname, "..");
var dateRef = process.argv[2];

/* ---------- Horloge figée (option) ---------- */
var VraiDate = Date;
function DateFigee() {
    if (arguments.length === 0 && dateRef) return new VraiDate(dateRef + "T" + new VraiDate().toTimeString().substr(0, 8));
    var a = [].slice.call(arguments);
    return new (Function.prototype.bind.apply(VraiDate, [null].concat(a)))();
}
DateFigee.prototype = VraiDate.prototype;
DateFigee.now = function () { return new DateFigee().getTime(); };
DateFigee.UTC = VraiDate.UTC; DateFigee.parse = VraiDate.parse;

/* ---------- Mini-jQuery suffisant pour les générateurs ---------- */
function creerJQuery() {
    function $(x) { if (typeof x === "function") return; return { on: function () { return this; }, html: function () { return this; }, text: function () { return this; } }; }
    $.each = function (o, fn) {
        if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) if (fn.call(o[i], i, o[i]) === false) break; }
        else for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) if (fn.call(o[k], k, o[k]) === false) break;
        return o;
    };
    $.grep = function (a, fn, inv) { return (a || []).filter(function (x, i) { return !!fn(x, i) !== !!inv; }); };
    $.map = function (a, fn) { var r = []; $.each(a, function (k, v) { var x = fn(v, k); if (x != null) r = r.concat(x); }); return r; };
    $.isArray = Array.isArray;
    $.isFunction = function (f) { return typeof f === "function"; };
    $.isPlainObject = function (o) { return !!o && Object.prototype.toString.call(o) === "[object Object]"; };
    $.inArray = function (v, a) { return (a || []).indexOf(v); };
    $.trim = function (s) { return String(s == null ? "" : s).trim(); };
    $.noop = function () {};
    $.extend = function () {
        var args = [].slice.call(arguments), deep = false;
        if (typeof args[0] === "boolean") deep = args.shift();
        var t = args.shift() || {};
        args.forEach(function (o) {
            if (!o) return;
            for (var k in o) {
                if (o[k] === undefined) continue;
                if (deep && o[k] && typeof o[k] === "object") t[k] = $.extend(true, Array.isArray(o[k]) ? [] : (t[k] && typeof t[k] === "object" ? t[k] : {}), o[k]);
                else t[k] = o[k];
            }
        });
        return t;
    };
    /* Deferred synchrone (les API simulées résolvent immédiatement) */
    $.Deferred = function () {
        var etat = null, args = [], cbs = [];
        function vider() { var l = cbs; cbs = []; l.forEach(function (c) { if (c.t === "always" || c.t === etat) c.f.apply(null, args); }); }
        var d = {
            resolve: function () { if (!etat) { etat = "done"; args = [].slice.call(arguments); vider(); } return d; },
            reject: function () { if (!etat) { etat = "fail"; args = [].slice.call(arguments); vider(); } return d; },
            done: function (f) { cbs.push({ t: "done", f: f }); if (etat) vider(); return d; },
            fail: function (f) { cbs.push({ t: "fail", f: f }); if (etat) vider(); return d; },
            always: function (f) { cbs.push({ t: "always", f: f }); if (etat) vider(); return d; },
            then: function (ok, ko) {
                var n = $.Deferred();
                d.done(function () { var r = ok ? ok.apply(null, arguments) : arguments[0]; if (r && typeof r.done === "function") r.done(n.resolve).fail(n.reject); else n.resolve(r); });
                d.fail(function () { var r = ko ? ko.apply(null, arguments) : arguments[0]; if (ko && !(r && typeof r.done === "function")) n.resolve(r); else if (r && typeof r.done === "function") r.done(n.resolve).fail(n.reject); else n.reject(r); });
                return n;
            },
            promise: function () { return d; },
            state: function () { return etat === "done" ? "resolved" : etat === "fail" ? "rejected" : "pending"; }
        };
        return d;
    };
    $.when = function () {
        var l = [].slice.call(arguments), d = $.Deferred(), res = [], reste = l.length;
        if (!reste) return d.resolve();
        l.forEach(function (p, i) {
            if (!p || typeof p.done !== "function") { res[i] = p; if (!--reste) d.resolve.apply(null, res); return; }
            p.done(function () { res[i] = arguments.length > 1 ? [].slice.call(arguments) : arguments[0]; if (!--reste) d.resolve.apply(null, res); }).fail(d.reject);
        });
        return d;
    };
    $.fn = {};
    return $;
}

/* ---------- Contexte « navigateur » ---------- */
var memoire = {};
var noeud = { setAttribute: function () {}, appendChild: function () {}, style: {} };
var ctx = {
    console: { log: function () {}, info: function () {}, warn: console.warn, error: console.error },
    JSON: JSON, Math: Math, Date: DateFigee, String: String, Number: Number, Object: Object, Array: Array, RegExp: RegExp, Error: Error,
    parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite, encodeURIComponent: encodeURIComponent, setTimeout: function (f) { f(); },
    localStorage: { getItem: function (k) { return k in memoire ? memoire[k] : null; }, setItem: function (k, v) { memoire[k] = String(v); }, removeItem: function (k) { delete memoire[k]; } },
    document: { createElement: function () { return { setAttribute: function () {}, style: {} }; }, getElementById: function () { return null; },
        getElementsByTagName: function () { return [noeud]; }, documentElement: noeud, addEventListener: function () {} },
    location: { search: "", hash: "", pathname: "/", href: "" }, navigator: { userAgent: "node" },
    addEventListener: function () {}
};
ctx.window = ctx;
ctx.$ = ctx.jQuery = creerJQuery();
vm.createContext(ctx);
[
    "commercial/assets/cx-core.js", "commercial/assets/cx-data.js", "commercial/assets/cx-tarifs.js",
    "commercial/assets/cx-demo-exploitation.js", "guichet/assets/guichet-commun.js", "operations/assets/ops-commun.js",
    "maquettes-carnets/assets/carnets-common.js"
].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(RACINE, f), "utf8"), ctx, { filename: f }); });

/* Générateurs déclenchés par les pages (et non au chargement des fichiers) */
vm.runInContext("CX.guichet && CX.guichet.preenreg && CX.guichet.preenreg.assurer();" +
    "if (window.CT && CT.store) CT.store.tous();", ctx);

/* ---------- Écriture ---------- */
var store = JSON.parse(memoire.cx_commercial_demo_v1 || "{}");
var carnets = memoire.ct_carnets_demo_cx_v1 ? JSON.parse(memoire.ct_carnets_demo_cx_v1) : null;
var DATA = path.join(RACINE, "data"), COLL = path.join(DATA, "collections");
fs.mkdirSync(COLL, { recursive: true });
fs.readdirSync(COLL).forEach(function (f) { if (/\.json$/.test(f)) fs.unlinkSync(path.join(COLL, f)); });
function ecrire(f, o) { fs.writeFileSync(f, JSON.stringify(o, null, 2) + "\n", "utf8"); }

var volumes = {};
Object.keys(store).sort().forEach(function (k) {
    if (Array.isArray(store[k])) { volumes[k] = store[k].length; ecrire(path.join(COLL, k + ".json"), store[k]); }
});
ecrire(path.join(DATA, "jeu-de-donnees.json"), store);
if (carnets) { ecrire(path.join(DATA, "carnets.json"), carnets); volumes.carnets = carnets.length; }
var jour = vm.runInContext("CX.util.today()", ctx);
ecrire(path.join(DATA, "index.json"), {
    application: "ClemenTino 2.0 - maquettes (Solex / Touristique Logistique)",
    genereLe: jour, periode: { du: vm.runInContext("CX.util.addDays('" + jour + "', -92)", ctx), au: vm.runInContext("CX.util.addDays('" + jour + "', 4)", ctx) },
    clesLocalStorage: { store: "cx_commercial_demo_v1", carnets: "ct_carnets_demo_cx_v1" },
    referentiels: vm.runInContext("({ villes: CX.REF.VILLES, agences: CX.REF.AGENCES, zonesLivraison: CX.REF.ZONES_LIVRAISON })", ctx),
    volumes: volumes
});
ecrire(path.join(DATA, "referentiels.json"), vm.runInContext("({ villes: CX.REF.VILLES, agences: CX.REF.AGENCES, zonesLivraison: CX.REF.ZONES_LIVRAISON, naturesColis: CX.REF.NATURES_COLIS, secteurs: CX.REF.SECTEURS, modesPaiement: CX.REF.MODES_PAIEMENT, typesVehicule: CX.REF.TYPES_VEHICULE, societes: CX.SOCIETES })", ctx));

console.log("Jeu de données du " + jour + " écrit dans data/ :");
Object.keys(volumes).forEach(function (k) { console.log("  " + (k + "                    ").substr(0, 20) + volumes[k]); });
