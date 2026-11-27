/* Environnement minimal pour charger les fichiers du socle sous node (sans navigateur) :
   window, localStorage, et un mini-jQuery (each, grep, map, extend, isArray, inArray, Deferred). */
var fs = require("fs"), path = require("path"), vm = require("vm");
module.exports = function (fichiers, stockageInitial) {
    var mem = stockageInitial || {};
    var ctx = { console: console, JSON: JSON, Math: Math, Date: Date, String: String, Number: Number, Object: Object, parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN };
    ctx.window = ctx;
    ctx.localStorage = { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } };
    function $(f) { return { on: function () {}, tooltip: function () {} }; }
    $.each = function (o, fn) {
        if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) if (fn.call(o[i], i, o[i]) === false) break; }
        else for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) if (fn.call(o[k], k, o[k]) === false) break;
        return o;
    };
    $.grep = function (a, fn) { return (a || []).filter(function (x, i) { return fn(x, i); }); };
    $.map = function (a, fn) { var r = []; $.each(a, function (k, v) { var x = fn(v, k); if (x != null) r = r.concat(x); }); return r; };
    $.isArray = Array.isArray;
    $.inArray = function (v, a) { return (a || []).indexOf(v); };
    $.extend = function () {
        var args = [].slice.call(arguments), deep = false;
        if (typeof args[0] === "boolean") deep = args.shift();
        var t = args.shift() || {};
        args.forEach(function (o) { for (var k in o) if (o[k] !== undefined) t[k] = deep && o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) ? $.extend(true, t[k] || {}, o[k]) : o[k]; });
        return t;
    };
    $.Deferred = function () {
        var v, ok, d = { resolve: function (x) { v = x; ok = true; return d; }, reject: function (x) { v = x; ok = false; return d; },
            promise: function () { return d; }, done: function (f) { if (ok) f(v); return d; }, fail: function (f) { if (ok === false) f(v); return d; } };
        return d;
    };
    ctx.$ = ctx.jQuery = $;
    vm.createContext(ctx);
    fichiers.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx, { filename: f }); });
    ctx.__stockage = mem;
    return ctx;
};
