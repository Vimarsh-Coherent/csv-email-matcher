/*
 * matcher.js — core matching logic (no DOM, runs in browser AND node).
 *
 * Joins a "verified emails" CSV (email, domain, status, score, reason)
 * to a "people" export CSV (first_name, last_name, org_website, ...).
 *
 * For each person it finds the verified email on the same domain whose
 * local-part best matches the person's name, then assigns it uniquely.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Matcher = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Strip diacritics + anything that isn't a-z0-9. "O'Donohue" -> "odonohue"
  function clean(s) {
    return (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  // Normalize a website/domain into a bare host: "http://www.x.com/path" -> "x.com"
  function normDomain(d) {
    if (!d) return "";
    let s = d.toString().trim().toLowerCase();
    s = s.replace(/^https?:\/\//, "");
    s = s.replace(/^www\./, "");
    s = s.split("/")[0].split("?")[0].split("#")[0];
    s = s.replace(/:\d+$/, "");
    return s.trim();
  }

  var GENERIC = new Set([
    "info", "sales", "admin", "contact", "hello", "office", "support",
    "enquiries", "enquiry", "inquiry", "inquiries", "mail", "team",
    "marketing", "accounts", "account", "hr", "jobs", "careers", "career",
    "service", "services", "general", "billing", "orders", "order",
    "reception", "ar", "ap", "finance", "help", "noreply", "no-reply",
  ]);

  var GENERIC_SCORE = 22;

  // Score how well an email local-part matches a person's name. 0 = no match.
  function nameScore(firstName, lastName, localPart) {
    var f = clean(firstName);
    var l = clean(lastName);
    var lp = clean(localPart);
    if (!lp) return 0;

    if (!f && !l) return GENERIC.has((localPart || "").toLowerCase()) ? GENERIC_SCORE : 0;

    var fi = f ? f[0] : "";
    var li = l ? l[0] : "";
    var best = 0;
    function bump(v) { if (v > best) best = v; }

    if (f && l) {
      if (lp === f + l) bump(100);          // first.last / first_last / firstlast
      if (lp === l + f) bump(78);           // last.first
      if (lp === fi + l) bump(88);          // flast
      if (lp === f + li) bump(72);          // firstl
      if (lp === fi + li) bump(28);         // initials only (weak)
    }
    if (f && lp === f) bump(70);            // first only
    if (l && lp === l) bump(60);            // last only

    // role / generic mailbox
    if (best === 0 && GENERIC.has((localPart || "").toLowerCase())) bump(GENERIC_SCORE);

    return best;
  }

  function statusRank(status) {
    var s = (status || "").toLowerCase();
    if (s === "verified") return 3;
    if (s === "confidential") return 2;
    if (s === "catch-all" || s === "catchall") return 1;
    return 0;
  }

  // Extract the domain for a person row, trying several columns.
  function personDomain(row) {
    var cand = row.org_website || row.organization_website || row.website ||
      row.org_domain || row.domain || "";
    var d = normDomain(cand);
    if (d) return d;
    // last resort: domain from a real-looking email column
    var em = row.email || "";
    if (em && em.indexOf("@") > -1 && !/email_not_unlocked/i.test(em)) {
      return normDomain(em.split("@")[1]);
    }
    return "";
  }

  /*
   * verified: array of objects {email, domain, status, score, reason}
   * people:   array of objects (full export rows)
   * opts: { minScore=60, includeGeneric=false }
   * returns: { assignments: Map(personIndex -> emailObj), stats }
   */
  function matchEmails(verified, people, opts) {
    opts = opts || {};
    var minScore = opts.minScore != null ? opts.minScore : 60;
    var includeGeneric = !!opts.includeGeneric;

    // Index verified emails by domain (dedupe by email).
    var byDomain = new Map();
    var seen = new Set();
    verified.forEach(function (v) {
      var email = (v.email || "").trim().toLowerCase();
      if (!email || email.indexOf("@") < 0) return;
      if (seen.has(email)) return;
      seen.add(email);
      var dom = normDomain(v.domain) || normDomain(email.split("@")[1]);
      if (!dom) return;
      if (!byDomain.has(dom)) byDomain.set(dom, []);
      byDomain.get(dom).push({
        email: email,
        local: email.split("@")[0],
        domain: dom,
        status: (v.status || "").toLowerCase(),
        score: Number(v.score) || 0,
        reason: v.reason || "",
      });
    });

    // Group people indices by domain.
    var peopleByDomain = new Map();
    people.forEach(function (p, i) {
      var dom = personDomain(p);
      if (!dom) return;
      if (!peopleByDomain.has(dom)) peopleByDomain.set(dom, []);
      peopleByDomain.get(dom).push(i);
    });

    var assignments = new Map();

    peopleByDomain.forEach(function (idxs, dom) {
      var emails = byDomain.get(dom);
      if (!emails || !emails.length) return;

      // Build all candidate (person, email) pairs above threshold.
      var pairs = [];
      idxs.forEach(function (pi) {
        var p = people[pi];
        emails.forEach(function (e) {
          var ns = nameScore(p.first_name, p.last_name, e.local);
          var isGeneric = GENERIC.has(e.local);
          if (ns < minScore && !(includeGeneric && isGeneric && ns >= GENERIC_SCORE)) return;
          pairs.push({ pi: pi, e: e, ns: ns, isGeneric: isGeneric });
        });
      });

      // Greedy: strongest name match first, then verified status, then score.
      pairs.sort(function (a, b) {
        if (b.ns !== a.ns) return b.ns - a.ns;
        var sr = statusRank(b.e.status) - statusRank(a.e.status);
        if (sr) return sr;
        return b.e.score - a.e.score;
      });

      var usedEmail = new Set();
      pairs.forEach(function (pr) {
        if (assignments.has(pr.pi)) return;
        if (usedEmail.has(pr.e.email)) return;
        assignments.set(pr.pi, pr.e);
        usedEmail.add(pr.e.email);
      });
    });

    return {
      assignments: assignments,
      stats: {
        people: people.length,
        verified: seen.size,
        matched: assignments.size,
        unmatched: people.length - assignments.size,
      },
    };
  }

  /*
   * Produce output rows = matched people only, all original columns kept,
   * with email (and email_status) overwritten by the matched verified email.
   */
  function buildOutput(people, fields, assignments) {
    var out = [];
    people.forEach(function (p, i) {
      var e = assignments.get(i);
      if (!e) return;
      var row = {};
      fields.forEach(function (f) { row[f] = p[f] != null ? p[f] : ""; });
      row.email = e.email;
      if ("email_status" in row) row.email_status = e.status;
      if ("email_true_status" in row) row.email_true_status = e.status;
      if ("all_emails" in row) row.all_emails = e.email;
      out.push(row);
    });
    return out;
  }

  return {
    clean: clean,
    normDomain: normDomain,
    nameScore: nameScore,
    personDomain: personDomain,
    matchEmails: matchEmails,
    buildOutput: buildOutput,
  };
});
